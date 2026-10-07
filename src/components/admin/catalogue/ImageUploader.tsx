"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ProductInput } from "@/domain/catalogue/product-schema";
import { MAX_PRODUCT_IMAGES } from "@/domain/catalogue/product-schema";
import { fillTemplate } from "./form-errors";
import { buttonClass, errorClass, helpClass, inputClass, labelClass } from "./styles";

export type ProductImageValue = ProductInput["images"][number];

export type ImageListLabels = {
  count: string;
  empty: string;
  preview: string;
  altId: string;
  altEn: string;
  moveUp: string;
  moveDown: string;
  remove: string;
};

/** The raw admin.uploads message tree, passed down unresolved (see fillTemplate). */
export type UploadLabels = (typeof import("@/messages/en.json"))["admin"]["uploads"];

type UploadResponse = {
  url?: string;
  width?: number;
  height?: number;
  orientation?: ProductImageValue["orientation"];
  error?: string;
  limit?: Record<string, number | string | string[]>;
};

type UploadProblem = { text: string; signIn: boolean };

/**
 * The product's image list: preview, bilingual alt text, order and removal
 * (spec FR-015…FR-018), and the upload control (spec US2,
 * contracts/uploads.md). Removing an image only takes it off the product; the
 * file it points at is never deleted. An accepted upload is appended with
 * empty alt texts and its Indonesian alt input is focused; it is attached to
 * the product only when the form is saved. `errors` are resolved messages
 * keyed by dotted path: `images`, `images.<i>`, `images.<i>.altId`,
 * `images.<i>.altEn`.
 */
export function ImageUploader({
  images,
  onChange,
  labels,
  uploadLabels,
  signInLabel,
  errors,
  idPrefix = "images",
}: {
  images: ProductImageValue[];
  onChange: (images: ProductImageValue[]) => void;
  labels: ImageListLabels;
  uploadLabels: UploadLabels;
  signInLabel: string;
  errors: Record<string, string[]>;
  idPrefix?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProblem, setUploadProblem] = useState<UploadProblem | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_PRODUCT_IMAGES;

  // Focus the new image's Indonesian alt text once it has rendered.
  useEffect(() => {
    if (focusIndex === null) return;
    document.getElementById(`${idPrefix}-${focusIndex}-altId`)?.focus();
    setFocusIndex(null);
  }, [focusIndex, idPrefix]);

  function uploadError(error: string | undefined, limit: UploadResponse["limit"]): string {
    const messages = uploadLabels.errors as Record<string, string>;
    const template = (error && messages[error]) || messages.failed;
    const values: Record<string, number | string> = {};
    for (const [name, value] of Object.entries(limit ?? {})) {
      values[name] = Array.isArray(value) ? value.join(", ") : value;
    }
    return fillTemplate(template, values);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || full) return;
    setUploading(true);
    setUploadProblem(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/admin/api/uploads", { method: "POST", body });
      const result = (await response.json().catch(() => ({}))) as UploadResponse;
      if ((response.status === 200 || response.status === 201) && result.url) {
        onChange([
          ...images,
          {
            url: result.url,
            width: result.width ?? 0,
            height: result.height ?? 0,
            orientation: result.orientation ?? "square",
            altId: "",
            altEn: "",
          },
        ]);
        setFocusIndex(images.length);
      } else if (response.status === 401) {
        setUploadProblem({ text: uploadLabels.errors.unauthorized, signIn: true });
      } else {
        setUploadProblem({ text: uploadError(result.error, result.limit), signIn: false });
      }
    } catch {
      setUploadProblem({ text: uploadLabels.errors.failed, signIn: false });
    } finally {
      setUploading(false);
      // Cleared so choosing the same file again still fires a change event.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function update(index: number, patch: Partial<ProductImageValue>) {
    onChange(images.map((image, i) => (i === index ? { ...image, ...patch } : image)));
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const listErrors = errors.images ?? [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 text-sm" aria-live="polite">
        {fillTemplate(labels.count, { count: images.length, max: MAX_PRODUCT_IMAGES })}
      </p>
      {listErrors.length > 0 && (
        <div id={`${idPrefix}-error`} className="flex flex-col gap-1">
          {listErrors.map((message) => (
            <p key={message} className={errorClass}>
              <span aria-hidden="true">!</span> {message}
            </p>
          ))}
        </div>
      )}

      {images.length === 0 ? (
        <p className="border-border text-ink-3 rounded-md border border-dashed px-3 py-6 text-center text-sm">
          {labels.empty}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {images.map((image, index) => {
            const position = index + 1;
            const base = `${idPrefix}-${index}`;
            const imageErrors = errors[`images.${index}`] ?? [];
            const altIdErrors = errors[`images.${index}.altId`] ?? [];
            const altEnErrors = errors[`images.${index}.altEn`] ?? [];
            return (
              <li
                key={`${image.url}-${index}`}
                className="border-border bg-surface flex flex-col gap-3 rounded-lg border p-3 sm:flex-row"
              >
                <div className="flex shrink-0 flex-col items-start gap-2">
                  <Image
                    src={image.url}
                    alt={fillTemplate(labels.preview, { index: position })}
                    width={96}
                    height={96}
                    sizes="96px"
                    className="bg-surface-muted h-24 w-24 rounded-md object-contain"
                  />
                  <span className="text-ink-3 text-sm tabular-nums">
                    {image.width}×{image.height}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  {imageErrors.map((message) => (
                    <p key={message} id={`${base}-error`} className={errorClass}>
                      <span aria-hidden="true">!</span> {message}
                    </p>
                  ))}
                  {(
                    [
                      ["altId", labels.altId, altIdErrors],
                      ["altEn", labels.altEn, altEnErrors],
                    ] as const
                  ).map(([field, label, fieldErrors]) => (
                    <div key={field} className="flex flex-col gap-1">
                      <label htmlFor={`${base}-${field}`} className={labelClass}>
                        {label}
                      </label>
                      <input
                        id={`${base}-${field}`}
                        className={inputClass}
                        maxLength={200}
                        required
                        value={image[field]}
                        aria-invalid={fieldErrors.length > 0 || undefined}
                        aria-describedby={
                          fieldErrors.length > 0 ? `${base}-${field}-error` : undefined
                        }
                        onChange={(event) => update(index, { [field]: event.target.value })}
                      />
                      {fieldErrors.length > 0 && (
                        <div id={`${base}-${field}-error`}>
                          {fieldErrors.map((message) => (
                            <p key={message} className={errorClass}>
                              <span aria-hidden="true">!</span> {message}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      disabled={index === 0}
                      aria-label={`${labels.moveUp} — ${fillTemplate(labels.preview, { index: position })}`}
                      onClick={() => move(index, -1)}
                    >
                      {labels.moveUp}
                    </button>
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      disabled={index === images.length - 1}
                      aria-label={`${labels.moveDown} — ${fillTemplate(labels.preview, { index: position })}`}
                      onClick={() => move(index, 1)}
                    >
                      {labels.moveDown}
                    </button>
                    <button
                      type="button"
                      className={buttonClass.ghost}
                      aria-label={`${labels.remove} — ${fillTemplate(labels.preview, { index: position })}`}
                      onClick={() => onChange(images.filter((_, i) => i !== index))}
                    >
                      {labels.remove}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${idPrefix}-upload`} className={labelClass}>
          {uploadLabels.label}
        </label>
        <input
          ref={fileInput}
          id={`${idPrefix}-upload`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className={`${inputClass} file:text-primary h-auto min-h-11 py-2 file:mr-3 file:border-0 file:bg-transparent file:font-semibold`}
          disabled={full || uploading}
          aria-busy={uploading || undefined}
          aria-invalid={uploadProblem ? true : undefined}
          aria-describedby={
            uploadProblem
              ? `${idPrefix}-upload-help ${idPrefix}-upload-error`
              : `${idPrefix}-upload-help`
          }
          onChange={upload}
        />
        <p id={`${idPrefix}-upload-help`} className={helpClass}>
          {full ? uploadLabels.full : uploadLabels.help}
        </p>
        <p className="text-ink-2 text-sm" aria-live="polite">
          {uploading ? uploadLabels.uploading : ""}
        </p>
        {uploadProblem && (
          <div
            id={`${idPrefix}-upload-error`}
            role="alert"
            className="flex flex-col items-start gap-1"
          >
            <p className={errorClass}>
              <span aria-hidden="true">!</span> {uploadProblem.text}
            </p>
            {uploadProblem.signIn && (
              <a href="/admin/login" target="_blank" rel="noopener" className={buttonClass.link}>
                {signInLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
