"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { setProductStock } from "@/app/actions/admin/stock";
import { fillTemplate } from "./form-errors";
import { badgeClass, buttonClass, errorClass, inputClass, labelClass } from "./styles";

/** The raw admin.stockInline message tree, passed down unresolved (see fillTemplate). */
export type InlineStockLabels = (typeof import("@/messages/en.json"))["admin"]["stockInline"];

const LOW_STOCK = 5;

/**
 * The per-product stock cell on /admin/products (spec US3, research R-313).
 * The owner types the quantity they counted, with a reason; the action turns
 * it into a delta against the value this cell rendered with, so an order
 * placed in between is reported back instead of overwritten.
 */
export function InlineStockEditor({
  productId,
  productName,
  quantity,
  emptyLabel,
  labels,
  errorMessages,
  stockChangedTemplate,
}: {
  productId: string;
  productName: string;
  /** Null when the product has no stock row yet; the first save opens one. */
  quantity: number | null;
  emptyLabel: string;
  labels: InlineStockLabels;
  errorMessages: Record<string, string>;
  /** errors.stockChanged, unresolved, so {current} can be filled here. */
  stockChangedTemplate: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [expected, setExpected] = useState(quantity ?? 0);
  const [target, setTarget] = useState(String(quantity ?? 0));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A refresh after a save, or after another tab's change, re-renders this
  // cell with the new value; the editor follows it while closed.
  const [renderedWith, setRenderedWith] = useState(quantity);
  if (quantity !== renderedWith) {
    setRenderedWith(quantity);
    if (!open) {
      setExpected(quantity ?? 0);
      setTarget(String(quantity ?? 0));
    }
  }

  function openEditor() {
    setOpen(true);
    setSaved(false);
    setError(null);
  }

  function cancel() {
    setOpen(false);
    setError(null);
    setNote("");
    setTarget(String(expected));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const result = await setProductStock({
      productId,
      expectedQuantity: expected,
      targetQuantity: Number(target),
      note,
    });

    setSaving(false);
    if (!result.ok) {
      if (result.errorKey === "errors.stockChanged" && result.currentQuantity !== undefined) {
        setExpected(result.currentQuantity);
        setError(fillTemplate(stockChangedTemplate, { current: result.currentQuantity }));
      } else {
        setError(errorMessages[result.errorKey] ?? result.errorKey);
      }
      return;
    }
    setExpected(result.quantity);
    setTarget(String(result.quantity));
    setNote("");
    setOpen(false);
    setSaved(true);
    router.refresh();
  }

  const shown = open ? expected : (quantity ?? null);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-ink tabular-nums">{shown === null ? emptyLabel : shown}</span>
        {shown === 0 && <span className={badgeClass.neutral}>{labels.out}</span>}
        {shown !== null && shown > 0 && shown <= LOW_STOCK && (
          <span className={badgeClass.warning}>{fillTemplate(labels.low, { count: shown })}</span>
        )}
        {!open && (
          <button
            type="button"
            onClick={openEditor}
            className={buttonClass.ghost}
            aria-label={`${labels.edit}: ${fillTemplate(labels.label, { name: productName })}`}
          >
            {labels.edit}
          </button>
        )}
      </div>

      {open && (
        <form
          onSubmit={handleSubmit}
          aria-label={fillTemplate(labels.label, { name: productName })}
          className="flex w-64 flex-col gap-2 text-left"
        >
          <label htmlFor={`${id}-target`} className={labelClass}>
            {labels.target}
          </label>
          <input
            id={`${id}-target`}
            type="number"
            inputMode="numeric"
            required
            min={0}
            max={1_000_000}
            step={1}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
          <label htmlFor={`${id}-note`} className={labelClass}>
            {labels.note}
          </label>
          <input
            id={`${id}-note`}
            required
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={inputClass}
          />
          {error && (
            <p id={`${id}-error`} role="alert" className={errorClass}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              aria-busy={saving || undefined}
              className={buttonClass.primary}
            >
              {saving ? labels.saving : labels.save}
            </button>
            <button type="button" onClick={cancel} className={buttonClass.ghost}>
              {labels.cancel}
            </button>
          </div>
        </form>
      )}

      <p aria-live="polite" className="text-success text-sm font-semibold">
        {saved ? labels.saved : ""}
      </p>
    </div>
  );
}
