"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { saveProduct } from "@/app/actions/admin/products";
import { productInputSchema, type ProductInput } from "@/domain/catalogue/product-schema";
import type { ProductStatus } from "@/domain/catalogue/status";
import { formatIDR } from "@/domain/money";
import { fillTemplate, resolveFieldError, toFieldErrors, type FieldError } from "./form-errors";
import {
  ImageUploader,
  type ImageListLabels,
  type ProductImageValue,
  type UploadLabels,
} from "./ImageUploader";
import {
  alertClass,
  buttonClass,
  errorClass,
  helpClass,
  inputClass,
  labelClass,
  readOnlyInputClass,
  textareaClass,
} from "./styles";

/** The raw admin.productForm message tree, passed down unresolved (see fillTemplate). */
export type ProductFormLabels = (typeof import("@/messages/en.json"))["admin"]["productForm"];
/** The admin.products.unpublish message tree (005 R-404). */
export type UnpublishLabels = (typeof import("@/messages/en.json"))["admin"]["products"]["unpublish"];

export interface ProductFormInitial {
  productId?: string;
  /** ISO; the optimistic-concurrency token for an edit (FR-011). */
  updatedAt?: string;
  categoryId: string;
  position: number;
  product: ProductInput;
}

const MAX_HIGHLIGHTS = 6;
const MAX_SPECS = 20;
const LOCALES = ["id", "en"] as const;
type Locale = (typeof LOCALES)[number];

type TranslationState = {
  name: string;
  shortDescription: string;
  longDescription: string;
  highlights: string[];
  specs: Array<{ label: string; value: string }>;
  seoTitle: string;
  seoDescription: string;
};

type FormState = {
  slug: string;
  sku: string;
  status: ProductStatus;
  categoryId: string;
  position: string;
  priceIDR: string;
  compareAtPriceIDR: string;
  images: ProductImageValue[];
  translations: Record<Locale, TranslationState>;
};

function toState(initial: ProductFormInitial): FormState {
  const p = initial.product;
  const translation = (locale: Locale): TranslationState => {
    const t = p.translations[locale];
    return {
      name: t.name,
      shortDescription: t.shortDescription,
      longDescription: t.longDescription,
      highlights: [...t.highlights],
      specs: t.specs.map((row) => ({ ...row })),
      seoTitle: t.seoTitle ?? "",
      seoDescription: t.seoDescription ?? "",
    };
  };
  return {
    slug: p.slug,
    sku: p.sku ?? "",
    status: p.status,
    categoryId: initial.categoryId,
    position: String(initial.position),
    priceIDR: p.priceIDR === null ? "" : String(p.priceIDR),
    compareAtPriceIDR: p.compareAtPriceIDR === null ? "" : String(p.compareAtPriceIDR),
    images: p.images.map((image) => ({ ...image })),
    translations: { id: translation("id"), en: translation("en") },
  };
}

/** "" → null; anything else → a number, so zod reports a non-number or non-integer itself. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/**
 * The ProductInput the shared schema validates. Video and videoAlt are not
 * editable in 2b, so they are carried over from `initial` unchanged; the server
 * takes them from the stored row regardless.
 */
function toProductInput(state: FormState, initial: ProductInput): ProductInput {
  const translation = (locale: Locale) => {
    const t = state.translations[locale];
    return {
      name: t.name,
      shortDescription: t.shortDescription,
      longDescription: t.longDescription,
      highlights: t.highlights,
      specs: t.specs,
      seoTitle: t.seoTitle.trim() === "" ? null : t.seoTitle,
      seoDescription: t.seoDescription.trim() === "" ? null : t.seoDescription,
      videoAlt: initial.translations[locale].videoAlt,
    };
  };
  return {
    slug: state.slug,
    sku: state.sku.trim() === "" ? null : state.sku.trim(),
    status: state.status,
    priceIDR: toNumber(state.priceIDR),
    compareAtPriceIDR: toNumber(state.compareAtPriceIDR),
    images: state.images,
    video: initial.video,
    translations: { id: translation("id"), en: translation("en") },
  };
}

/** Paths that have a control on this form; errors anywhere else are listed in the summary. */
const RENDERED_PATHS = [
  /^(slug|sku|categoryId|status|position|priceIDR|compareAtPriceIDR)$/,
  /^images(\.\d+(\.(altId|altEn))?)?$/,
  /^translations\.(id|en)\.(name|shortDescription|longDescription|seoTitle|seoDescription)$/,
  /^translations\.(id|en)\.highlights(\.\d+)?$/,
  /^translations\.(id|en)\.specs(\.\d+(\.(label|value))?)?$/,
];

type FormProblem =
  | { kind: "fields" }
  | { kind: "message"; errorKey: string }
  | { kind: "changed" }
  | { kind: "unauthorized" }
  /** ACTIVE → off sale was refused until confirmed; `input` is resubmitted as-is (R-404). */
  | { kind: "unpublish"; lastActive: boolean; input: SaveInput };

/** What onSubmit sends to saveProduct, before any unpublish confirmation. */
type SaveInput = {
  productId?: string;
  expectedUpdatedAt?: string;
  categoryId: string;
  position: number;
  product: ProductInput;
};

/**
 * Create and edit form for a product (spec US1, research R-308, R-316). It
 * validates with the same productInputSchema as the server before calling
 * saveProduct, shows each issue beside its field, and keeps every entered
 * value on any failure — including an expired session, where it links to
 * sign-in in a new tab instead of navigating away.
 */
export function ProductForm({
  initial,
  categories,
  allowedStatuses,
  slugLocked,
  isSample = false,
  statusLabels,
  labels,
  unpublishLabels,
  uploadLabels,
  errorMessages,
}: {
  initial: ProductFormInitial;
  categories: Array<{ id: string; name: string }>;
  allowedStatuses: readonly ProductStatus[];
  slugLocked: boolean;
  /** A sample's status is fixed at COMING_SOON until it is marked real (005 R-402). */
  isSample?: boolean;
  statusLabels: Record<ProductStatus, string>;
  labels: ProductFormLabels;
  unpublishLabels: UnpublishLabels;
  uploadLabels: UploadLabels;
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const formId = useId();
  const [state, setState] = useState<FormState>(() => toState(initial));
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  // Marking the sample real (MarkRealPanel) advances the stored updatedAt and
  // refreshes the page; only that change flips isSample, so adopt the new
  // value then, or the next save would be refused as changed elsewhere.
  const [renderedSample, setRenderedSample] = useState(isSample);
  if (isSample !== renderedSample) {
    setRenderedSample(isSample);
    setUpdatedAt(initial.updatedAt);
  }
  const [fieldErrors, setFieldErrors] = useState<Record<string, FieldError[]>>({});
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fieldMessages = labels.errors as Record<string, string>;
  const messagesFor = (path: string) =>
    (fieldErrors[path] ?? []).map((err) => resolveFieldError(err, fieldMessages));
  const idFor = (path: string) => `${formId}-${path.replace(/\./g, "-")}`;

  function edit(patch: Partial<FormState>) {
    setState((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

  function editTranslation(locale: Locale, patch: Partial<TranslationState>) {
    setState((current) => ({
      ...current,
      translations: {
        ...current.translations,
        [locale]: { ...current.translations[locale], ...patch },
      },
    }));
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaved(false);
    setProblem(null);

    const product = toProductInput(state, initial.product);
    const local = productInputSchema.safeParse(product);
    const position = toNumber(state.position);
    if (!local.success) {
      setFieldErrors(toFieldErrors(local.error.issues));
      setProblem({ kind: "fields" });
      return;
    }

    await save({
      productId: initial.productId,
      expectedUpdatedAt: updatedAt,
      categoryId: state.categoryId,
      position: position ?? Number.NaN,
      product,
    });
  }

  /**
   * Sends one save. Taking a product off sale is refused until confirmed
   * (R-404); the panel then resends the same input with confirmUnpublish.
   */
  async function save(input: SaveInput, confirmUnpublish?: true) {
    setSaving(true);
    setProblem(null);
    try {
      const result = await saveProduct({ ...input, confirmUnpublish });
      if (result.ok) {
        // A created product continues on its own edit page (spec US4).
        if (!initial.productId) {
          router.push(`/admin/products/${result.productId}`);
          return;
        }
        setFieldErrors({});
        setUpdatedAt(result.updatedAt);
        setSaved(true);
        router.refresh();
        return;
      }
      setFieldErrors(result.fieldErrors ?? {});
      if (result.errorKey === "errors.unpublishNeedsConfirmation") {
        setProblem({
          kind: "unpublish",
          lastActive: result.confirm?.lastActive ?? false,
          input,
        });
      } else if (result.errorKey === "errors.productChanged") setProblem({ kind: "changed" });
      else if (result.errorKey === "errors.unauthorized") setProblem({ kind: "unauthorized" });
      else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
        setProblem({ kind: "fields" });
      } else setProblem({ kind: "message", errorKey: result.errorKey });
    } catch {
      setProblem({ kind: "message", errorKey: "errors.validation" });
    } finally {
      setSaving(false);
    }
  }

  const unplaced = Object.keys(fieldErrors).filter(
    (path) => !RENDERED_PATHS.some((pattern) => pattern.test(path)),
  );
  const imageErrors: Record<string, string[]> = {};
  for (const path of Object.keys(fieldErrors)) {
    if (path.startsWith("images")) imageErrors[path] = messagesFor(path);
  }

  function field(
    path: string,
    label: string,
    control: (props: {
      id: string;
      "aria-invalid": true | undefined;
      "aria-describedby": string | undefined;
    }) => ReactNode,
    options: { help?: string; optional?: boolean } = {},
  ) {
    const id = idFor(path);
    const messages = messagesFor(path);
    const describedBy =
      [options.help ? `${id}-help` : null, messages.length > 0 ? `${id}-error` : null]
        .filter(Boolean)
        .join(" ") || undefined;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={id} className={labelClass}>
          {label}
          {options.optional && <span className="text-ink-3 font-normal"> {labels.optional}</span>}
        </label>
        {control({
          id,
          "aria-invalid": messages.length > 0 || undefined,
          "aria-describedby": describedBy,
        })}
        {options.help && (
          <p id={`${id}-help`} className={helpClass}>
            {options.help}
          </p>
        )}
        {messages.length > 0 && (
          <div id={`${id}-error`} className="flex flex-col gap-1">
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

  function counter(value: string, max: number) {
    return fillTemplate(labels.counter, { count: value.length, max });
  }

  const pricePreview = (value: string) => {
    const amount = toNumber(value);
    return amount !== null && Number.isInteger(amount) && amount > 0
      ? fillTemplate(labels.pricePreview, { price: formatIDR(amount) })
      : undefined;
  };

  const sectionClass = "flex flex-col gap-4 rounded-lg border border-border bg-surface p-4";
  const legendClass = "px-1 text-lg font-semibold text-ink";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 pb-24">
      {problem && problem.kind !== "unpublish" && (
        <div role="alert" className={alertClass}>
          {problem.kind === "fields" && (
            <>
              <p>{labels.errorSummary}</p>
              {unplaced.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {unplaced.flatMap((path) =>
                    messagesFor(path).map((message) => (
                      <li key={`${path}-${message}`}>
                        <span className="font-semibold">{path}</span>: {message}
                      </li>
                    )),
                  )}
                </ul>
              )}
            </>
          )}
          {problem.kind === "message" && (
            <p>{errorMessages[problem.errorKey] ?? errorMessages["errors.validation"]}</p>
          )}
          {problem.kind === "changed" && (
            <div className="flex flex-col items-start gap-2">
              <p>{errorMessages["errors.productChanged"]}</p>
              <button
                type="button"
                className={buttonClass.secondary}
                onClick={() => window.location.reload()}
              >
                {labels.reload}
              </button>
            </div>
          )}
          {problem.kind === "unauthorized" && (
            <div className="flex flex-col items-start gap-2">
              <p>{errorMessages["errors.unauthorized"]}</p>
              <a href="/admin/login" target="_blank" rel="noopener" className={buttonClass.link}>
                {labels.signInAgain}
              </a>
            </div>
          )}
        </div>
      )}

      <fieldset className={sectionClass}>
        <legend className={legendClass}>{labels.sections.basics}</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {field(
            "slug",
            labels.slug,
            (props) => (
              <input
                {...props}
                className={slugLocked ? readOnlyInputClass : inputClass}
                value={state.slug}
                readOnly={slugLocked}
                maxLength={80}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(event) => edit({ slug: event.target.value })}
              />
            ),
            { help: slugLocked ? labels.slugLockedHelp : labels.slugHelp },
          )}
          {field(
            "sku",
            labels.sku,
            (props) => (
              <input
                {...props}
                className={inputClass}
                value={state.sku}
                maxLength={32}
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => edit({ sku: event.target.value.toUpperCase() })}
              />
            ),
            { help: labels.skuHelp, optional: true },
          )}
          {field("categoryId", labels.category, (props) => (
            <select
              {...props}
              className={inputClass}
              value={state.categoryId}
              onChange={(event) => edit({ categoryId: event.target.value })}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          ))}
          {allowedStatuses.length === 1
            ? field(
                "status",
                labels.status,
                (props) => (
                  <input
                    {...props}
                    className={readOnlyInputClass}
                    readOnly
                    value={statusLabels[allowedStatuses[0]]}
                  />
                ),
                { help: isSample ? labels.sampleStatusHelp : labels.statusFixedHelp },
              )
            : field("status", labels.status, (props) => (
                <select
                  {...props}
                  className={inputClass}
                  value={state.status}
                  onChange={(event) => edit({ status: event.target.value as ProductStatus })}
                >
                  {allowedStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              ))}
          {field(
            "position",
            labels.position,
            (props) => (
              <input
                {...props}
                className={inputClass}
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                step={1}
                value={state.position}
                onChange={(event) => edit({ position: event.target.value })}
              />
            ),
            { help: labels.positionHelp },
          )}
        </div>
      </fieldset>

      <fieldset className={sectionClass}>
        <legend className={legendClass}>{labels.sections.price}</legend>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {field(
            "priceIDR",
            labels.priceIDR,
            (props) => (
              <input
                {...props}
                className={`${inputClass} tabular-nums`}
                type="number"
                inputMode="numeric"
                min={1000}
                step={1}
                value={state.priceIDR}
                onChange={(event) => edit({ priceIDR: event.target.value })}
              />
            ),
            {
              help: pricePreview(state.priceIDR) ?? labels.priceHelp,
              optional: state.status !== "ACTIVE",
            },
          )}
          {field(
            "compareAtPriceIDR",
            labels.compareAtPriceIDR,
            (props) => (
              <input
                {...props}
                className={`${inputClass} tabular-nums`}
                type="number"
                inputMode="numeric"
                min={1000}
                step={1}
                value={state.compareAtPriceIDR}
                onChange={(event) => edit({ compareAtPriceIDR: event.target.value })}
              />
            ),
            {
              help: pricePreview(state.compareAtPriceIDR) ?? labels.compareAtHelp,
              optional: true,
            },
          )}
        </div>
      </fieldset>

      <fieldset className={sectionClass}>
        <legend className={legendClass}>{labels.sections.images}</legend>
        <ImageUploader
          images={state.images}
          onChange={(images) => edit({ images })}
          labels={labels.imageList as ImageListLabels}
          uploadLabels={uploadLabels}
          signInLabel={labels.signInAgain}
          errors={imageErrors}
          idPrefix={`${formId}-images`}
        />
      </fieldset>

      {LOCALES.map((locale) => {
        const t = state.translations[locale];
        const base = `translations.${locale}`;
        return (
          <fieldset key={locale} className={sectionClass} lang={locale}>
            <legend className={legendClass}>{labels.sections[locale]}</legend>
            {field(`${base}.name`, labels.name, (props) => (
              <input
                {...props}
                className={inputClass}
                maxLength={120}
                value={t.name}
                onChange={(event) => editTranslation(locale, { name: event.target.value })}
              />
            ))}
            {field(
              `${base}.shortDescription`,
              labels.shortDescription,
              (props) => (
                <input
                  {...props}
                  className={inputClass}
                  maxLength={200}
                  value={t.shortDescription}
                  onChange={(event) =>
                    editTranslation(locale, { shortDescription: event.target.value })
                  }
                />
              ),
              { help: labels.shortDescriptionHelp },
            )}
            {field(
              `${base}.longDescription`,
              labels.longDescription,
              (props) => (
                <textarea
                  {...props}
                  className={textareaClass}
                  maxLength={5000}
                  rows={6}
                  value={t.longDescription}
                  onChange={(event) =>
                    editTranslation(locale, { longDescription: event.target.value })
                  }
                />
              ),
              { optional: true },
            )}

            <div className="flex flex-col gap-2">
              <p className={labelClass}>
                {labels.highlights}
                <span className="text-ink-3 font-normal"> {labels.optional}</span>
              </p>
              <p className={helpClass}>{labels.highlightsHelp}</p>
              {messagesFor(`${base}.highlights`).map((message) => (
                <p key={message} className={errorClass}>
                  <span aria-hidden="true">!</span> {message}
                </p>
              ))}
              {t.highlights.map((highlight, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    {field(
                      `${base}.highlights.${index}`,
                      fillTemplate(labels.highlightLabel, { index: index + 1 }),
                      (props) => (
                        <input
                          {...props}
                          className={inputClass}
                          maxLength={80}
                          value={highlight}
                          onChange={(event) =>
                            editTranslation(locale, {
                              highlights: t.highlights.map((h, i) =>
                                i === index ? event.target.value : h,
                              ),
                            })
                          }
                        />
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    className={buttonClass.ghost}
                    onClick={() =>
                      editTranslation(locale, {
                        highlights: t.highlights.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {fillTemplate(labels.removeHighlight, { index: index + 1 })}
                  </button>
                </div>
              ))}
              {t.highlights.length < MAX_HIGHLIGHTS && (
                <button
                  type="button"
                  className={`${buttonClass.secondary} self-start`}
                  onClick={() => editTranslation(locale, { highlights: [...t.highlights, ""] })}
                >
                  {labels.addHighlight}
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className={labelClass}>
                {labels.specs}
                <span className="text-ink-3 font-normal"> {labels.optional}</span>
              </p>
              <p className={helpClass}>{labels.specsHelp}</p>
              {messagesFor(`${base}.specs`).map((message) => (
                <p key={message} className={errorClass}>
                  <span aria-hidden="true">!</span> {message}
                </p>
              ))}
              {t.specs.map((row, index) => (
                <div
                  key={index}
                  className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]"
                >
                  {field(
                    `${base}.specs.${index}.label`,
                    fillTemplate(labels.specLabel, { index: index + 1 }),
                    (props) => (
                      <input
                        {...props}
                        className={inputClass}
                        maxLength={40}
                        value={row.label}
                        onChange={(event) =>
                          editTranslation(locale, {
                            specs: t.specs.map((s, i) =>
                              i === index ? { ...s, label: event.target.value } : s,
                            ),
                          })
                        }
                      />
                    ),
                  )}
                  {field(
                    `${base}.specs.${index}.value`,
                    fillTemplate(labels.specValue, { index: index + 1 }),
                    (props) => (
                      <input
                        {...props}
                        className={inputClass}
                        maxLength={200}
                        value={row.value}
                        onChange={(event) =>
                          editTranslation(locale, {
                            specs: t.specs.map((s, i) =>
                              i === index ? { ...s, value: event.target.value } : s,
                            ),
                          })
                        }
                      />
                    ),
                  )}
                  <button
                    type="button"
                    className={buttonClass.ghost}
                    onClick={() =>
                      editTranslation(locale, { specs: t.specs.filter((_, i) => i !== index) })
                    }
                  >
                    {fillTemplate(labels.removeSpec, { index: index + 1 })}
                  </button>
                </div>
              ))}
              {t.specs.length < MAX_SPECS && (
                <button
                  type="button"
                  className={`${buttonClass.secondary} self-start`}
                  onClick={() =>
                    editTranslation(locale, { specs: [...t.specs, { label: "", value: "" }] })
                  }
                >
                  {labels.addSpec}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field(
                `${base}.seoTitle`,
                labels.seoTitle,
                (props) => (
                  <input
                    {...props}
                    className={inputClass}
                    maxLength={60}
                    value={t.seoTitle}
                    onChange={(event) => editTranslation(locale, { seoTitle: event.target.value })}
                  />
                ),
                { help: counter(t.seoTitle, 60), optional: true },
              )}
              {field(
                `${base}.seoDescription`,
                labels.seoDescription,
                (props) => (
                  <textarea
                    {...props}
                    className={textareaClass}
                    maxLength={160}
                    rows={3}
                    value={t.seoDescription}
                    onChange={(event) =>
                      editTranslation(locale, { seoDescription: event.target.value })
                    }
                  />
                ),
                { help: counter(t.seoDescription, 160), optional: true },
              )}
            </div>
          </fieldset>
        );
      })}

      {problem?.kind === "unpublish" && (
        <div role="alert" className={`${alertClass} flex flex-col gap-2`}>
          <h2 className="text-ink text-lg font-semibold">{unpublishLabels.title}</h2>
          <p>{unpublishLabels.body}</p>
          {problem.lastActive && <p className="font-semibold">{unpublishLabels.lastActive}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass.danger}
              disabled={saving}
              aria-busy={saving || undefined}
              onClick={() => void save(problem.input, true)}
            >
              {unpublishLabels.confirm}
            </button>
            {/* Cancel only closes the panel; the chosen status stays selected. */}
            <button
              type="button"
              className={buttonClass.ghost}
              disabled={saving}
              onClick={() => setProblem(null)}
            >
              {unpublishLabels.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Sticky form footer (CLAUDE.md Admin): Save stays reachable on a long form. */}
      <div className="border-border bg-surface sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 shadow-[0_8px_24px_-8px_rgb(46_27_16/0.18)] sm:mx-0 sm:rounded-lg sm:border">
        <button
          type="submit"
          className={`${buttonClass.primaryLg} w-full sm:w-auto sm:min-w-32`}
          disabled={saving}
          aria-busy={saving || undefined}
        >
          {saving && (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
            />
          )}
          {saving ? labels.saving : labels.save}
        </button>
        <p aria-live="polite" className="text-success text-base font-semibold">
          {saved ? labels.saved : ""}
        </p>
      </div>
    </form>
  );
}
