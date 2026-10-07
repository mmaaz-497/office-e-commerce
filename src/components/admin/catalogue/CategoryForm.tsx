"use client";

import { useRouter } from "next/navigation";
import { Fragment, useId, useState } from "react";
import { saveCategory } from "@/app/actions/admin/categories";
import { resolveFieldError, type FieldError } from "./form-errors";
import { alertClass, buttonClass, errorClass, inputClass, labelClass } from "./styles";

/** The raw admin.categories message tree, passed down unresolved (see fillTemplate). */
export type CategoryLabels = (typeof import("@/messages/en.json"))["admin"]["categories"];

export interface CategoryValues {
  categoryId?: string;
  slug: string;
  nameId: string;
  nameEn: string;
  position: number;
}

export interface CategoryRow extends Required<CategoryValues> {
  productCount: number;
}

type Problem = { kind: "fields" } | { kind: "message"; errorKey: string };

const EMPTY: CategoryValues = { slug: "", nameId: "", nameEn: "", position: 0 };

/**
 * Creates or edits one category (spec US6). Field errors sit beside their
 * field and the summary is an alert, as on the product form (T027). Without
 * `initial` it is the "New category" form and clears itself after a save.
 */
export function CategoryForm({
  initial,
  labels,
  errorMessages,
  onCancel,
  onSaved,
}: {
  initial?: CategoryValues;
  labels: CategoryLabels;
  errorMessages: Record<string, string>;
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const start = initial ?? EMPTY;
  const [slug, setSlug] = useState(start.slug);
  const [nameId, setNameId] = useState(start.nameId);
  const [nameEn, setNameEn] = useState(start.nameEn);
  const [position, setPosition] = useState(String(start.position));
  const [fieldErrors, setFieldErrors] = useState<Record<string, FieldError[]>>({});
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setProblem(null);
    try {
      const result = await saveCategory({
        categoryId: initial?.categoryId,
        slug: slug.trim(),
        nameId,
        nameEn,
        position: position.trim() === "" ? Number.NaN : Number(position),
      });
      if (result.ok) {
        setFieldErrors({});
        if (!initial) {
          setSlug("");
          setNameId("");
          setNameEn("");
          setPosition("0");
        }
        setSaved(true);
        onSaved?.();
        router.refresh();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      setProblem(
        result.fieldErrors && Object.keys(result.fieldErrors).length > 0
          ? { kind: "fields" }
          : { kind: "message", errorKey: result.errorKey },
      );
    } catch {
      setProblem({ kind: "message", errorKey: "errors.validation" });
    } finally {
      setSaving(false);
    }
  }

  function field(
    name: keyof Omit<CategoryValues, "categoryId">,
    value: string,
    setValue: (value: string) => void,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) {
    const inputId = `${id}-${name}`;
    const messages = (fieldErrors[name] ?? []).map((err) =>
      resolveFieldError(err, labels.errors as Record<string, string>),
    );
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={inputId} className={labelClass}>
          {labels[name]}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={messages.length > 0 ? `${inputId}-error` : undefined}
          className={inputClass}
          {...extra}
        />
        {messages.length > 0 && (
          <div id={`${inputId}-error`} className="flex flex-col gap-1">
            {messages.map((message) => (
              <p key={message} className={errorClass}>
                <span aria-hidden="true">!</span> {message}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={initial ? `${labels.edit}: ${initial.nameEn}` : labels.new}
      className="flex flex-col gap-4"
    >
      {problem && (
        <div role="alert" className={alertClass}>
          {problem.kind === "fields"
            ? labels.errorSummary
            : (errorMessages[problem.errorKey] ?? errorMessages["errors.validation"])}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {field("nameId", nameId, setNameId, { maxLength: 60 })}
        {field("nameEn", nameEn, setNameEn, { maxLength: 60 })}
        {field("slug", slug, setSlug, { maxLength: 80, autoCapitalize: "none", spellCheck: false })}
        {field("position", position, setPosition, {
          type: "number",
          inputMode: "numeric",
          min: 0,
          max: 9999,
          step: 1,
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          aria-busy={saving || undefined}
          className={`${buttonClass.primary} w-full sm:w-auto`}
        >
          {saving ? labels.saving : labels.save}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonClass.ghost}>
            {labels.cancel}
          </button>
        )}
        <p aria-live="polite" className="text-success text-base font-semibold">
          {saved ? labels.saved : ""}
        </p>
      </div>
    </form>
  );
}

/**
 * The categories table body. Each row's "Edit" opens its CategoryForm in a
 * full-width row beneath it, so the table itself never needs to widen.
 */
export function CategoryRows({
  rows,
  labels,
  errorMessages,
}: {
  rows: CategoryRow[];
  labels: CategoryLabels;
  errorMessages: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <tbody>
      {rows.map((row) => (
        <Fragment key={row.categoryId}>
          <tr className="border-border h-11 border-t">
            <td className="text-ink px-3 py-2">{row.nameId}</td>
            <td className="text-ink px-3 py-2">{row.nameEn}</td>
            <td className="text-ink-2 px-3 py-2">{row.slug}</td>
            <td className="text-ink px-3 py-2 text-right tabular-nums">{row.position}</td>
            <td className="text-ink px-3 py-2 text-right tabular-nums">{row.productCount}</td>
            <td className="px-3 py-2 text-right">
              <div className="flex items-center justify-end gap-2">
                <span aria-live="polite" className="text-success text-sm font-semibold">
                  {savedId === row.categoryId ? labels.saved : ""}
                </span>
                {editing !== row.categoryId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(row.categoryId);
                      setSavedId(null);
                    }}
                    aria-label={`${labels.edit}: ${row.nameEn}`}
                    className={buttonClass.ghost}
                  >
                    {labels.edit}
                  </button>
                )}
              </div>
            </td>
          </tr>
          {editing === row.categoryId && (
            <tr className="bg-surface-muted">
              <td colSpan={6} className="px-3 py-4">
                {/* The table is wider than a phone and scrolls in its wrapper;
                    the form stays pinned to the visible part of it. */}
                <div className="sticky left-3 max-w-[calc(100vw-4rem)]">
                  <CategoryForm
                    initial={row}
                    labels={labels}
                    errorMessages={errorMessages}
                    onCancel={() => setEditing(null)}
                    onSaved={() => {
                      setEditing(null);
                      setSavedId(row.categoryId);
                    }}
                  />
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      ))}
    </tbody>
  );
}
