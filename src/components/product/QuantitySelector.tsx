"use client";

import { useTranslations } from "next-intl";
import { MAX_ORDER_QUANTITY } from "@/domain/catalogue/purchase-limits";

const MIN_QTY = 1;

const STEP =
  "border-border-strong text-ink hover:bg-surface-muted disabled:bg-disabled-bg disabled:text-disabled-fg flex h-11 w-11 items-center justify-center rounded-md border text-lg transition-colors duration-150 ease-out disabled:cursor-not-allowed";

/**
 * Whole-number quantity between 1 and `max` — the lower of 10 and current
 * stock, from maxOrderQuantity (007 FR-016, research R-703). Checkout still
 * re-checks stock on its own. Checkout passes no `max` and keeps its schema
 * limit of 10, unchanged.
 */
export function QuantitySelector({
  value,
  onChange,
  max = MAX_ORDER_QUANTITY,
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
}) {
  const t = useTranslations("product");

  const clamp = (next: number): number => {
    if (!Number.isFinite(next)) return MIN_QTY;
    return Math.min(max, Math.max(MIN_QTY, Math.trunc(next)));
  };

  function handleInputChange(raw: string) {
    if (raw === "") {
      onChange(MIN_QTY);
      return;
    }
    if (!/^\d+$/.test(raw)) {
      // Rejects paste/typing of anything but whole digits — no decimals, no
      // minus sign, no letters.
      return;
    }
    onChange(clamp(Number(raw)));
  }

  return (
    <div className="inline-flex items-center gap-2" role="group" aria-label={t("quantity.label")}>
      <button
        type="button"
        aria-label={t("quantity.decrease")}
        className={STEP}
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= MIN_QTY}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="\d*"
        aria-label={t("quantity.label")}
        className="border-border-strong bg-surface text-ink hover:border-ink-3 focus:border-primary h-11 w-14 rounded-md border text-center text-base tabular-nums transition-colors duration-150 ease-out"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!/^\d+$/.test(pasted)) {
            e.preventDefault();
          }
        }}
      />
      <button
        type="button"
        aria-label={t("quantity.increase")}
        className={STEP}
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
      >
        +
      </button>
    </div>
  );
}
