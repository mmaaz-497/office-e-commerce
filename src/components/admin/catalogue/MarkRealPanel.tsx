"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { markProductReal } from "@/app/actions/admin/products";
import { alertClass, buttonClass } from "./styles";

/** The raw admin.products.markReal message tree. */
export type MarkRealLabels = (typeof import("@/messages/en.json"))["admin"]["products"]["markReal"];

/**
 * The sample panel on a sample's edit page (005 spec US3, research R-403).
 * One way only: it turns a sample into an ordinary product, after an inline
 * confirmation (never a browser dialog). The page re-renders after the change
 * and drops the panel; until then this keeps the "done" line on screen.
 */
export function MarkRealPanel({
  productId,
  isSample,
  updatedAt,
  labels,
  errorMessages,
}: {
  productId: string;
  isSample: boolean;
  /** The updatedAt the page rendered with; the action is guarded by it. */
  updatedAt: string;
  labels: MarkRealLabels;
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSample && !done) return null;

  async function onConfirm() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await markProductReal({ productId, expectedUpdatedAt: updatedAt });
      if (result.ok) {
        setConfirming(false);
        setDone(true);
        router.refresh();
        return;
      }
      setError(errorMessages[result.errorKey] ?? errorMessages["errors.validation"]);
    } catch {
      setError(errorMessages["errors.validation"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="border-border bg-surface flex flex-col items-start gap-3 rounded-lg border p-4">
      <p aria-live="polite" className="text-success text-base font-semibold empty:hidden">
        {done ? labels.done : ""}
      </p>
      {!done && !confirming && (
        <button type="button" className={buttonClass.secondary} onClick={() => setConfirming(true)}>
          {labels.button}
        </button>
      )}
      {!done && confirming && (
        <div className="flex flex-col items-start gap-3">
          <h2 className="text-ink text-lg font-semibold">{labels.title}</h2>
          <p className="text-ink-2 text-base">{labels.body}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass.primary}
              onClick={onConfirm}
              disabled={saving}
              aria-busy={saving || undefined}
            >
              {labels.confirm}
            </button>
            <button
              type="button"
              className={buttonClass.ghost}
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={saving}
            >
              {labels.cancel}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div role="alert" className={alertClass}>
          <p>{error}</p>
        </div>
      )}
    </section>
  );
}
