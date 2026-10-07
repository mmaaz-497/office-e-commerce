import { useTranslations } from "next-intl";
import { formatIDR } from "@/domain/money";
import type { PriceBreakdown } from "@/domain/pricing/quote";

/**
 * The total always equals the sum of the displayed lines (FR-012) — it is
 * computed from `breakdown` itself here, never passed in separately, so the
 * two can never drift apart on screen.
 */
export function OrderSummary({ breakdown }: { breakdown: PriceBreakdown }) {
  const t = useTranslations("checkout.summary");
  const lineTotal = breakdown.unitPrice * breakdown.quantity;

  return (
    <dl className="border-cream-dark flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <div className="flex justify-between">
        <dt>{t("subtotal")}</dt>
        <dd>{formatIDR(lineTotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>{t("shipping")}</dt>
        <dd>{formatIDR(breakdown.shippingCost)}</dd>
      </div>
      {breakdown.codFee > 0 && (
        <div className="flex justify-between">
          <dt>{t("codFee")}</dt>
          <dd>{formatIDR(breakdown.codFee)}</dd>
        </div>
      )}
      <div className="border-cream-dark text-brown-dark flex justify-between border-t pt-2 text-base font-bold">
        <dt>{t("total")}</dt>
        <dd>{formatIDR(lineTotal + breakdown.shippingCost + breakdown.codFee)}</dd>
      </div>
    </dl>
  );
}
