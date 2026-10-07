import { getTranslations } from "next-intl/server";
import { stockBadge } from "@/domain/catalogue/purchase-limits";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";

/**
 * The buy box's stock state (007 FR-015, research R-703): "Stok tersedia",
 * "Sisa N" at ≤ 5, or "Stok habis". The count is the real stock level, never a
 * manufactured "only a few left". Unknown stock (null) shows nothing.
 */
export async function StockBadge({ stock }: { stock: number | null }) {
  if (stock === null) return null;
  const t = await getTranslations("product.stock");
  const state = stockBadge(stock);
  const [variant, label]: [BadgeVariant, string] =
    state.kind === "out"
      ? ["neutral", t("out")]
      : state.kind === "low"
        ? ["warning", t("low", { count: state.remaining })]
        : ["success", t("inStock")];
  return <Badge variant={variant}>{label}</Badge>;
}
