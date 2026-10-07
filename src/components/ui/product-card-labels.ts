import { getTranslations } from "next-intl/server";
import type { ProductCardLabels } from "./ProductCard";

/**
 * The ProductCard labels, resolved on the server for the category page and
 * the homepage. Server-only: it reads next-intl/server, and `discount` is a
 * function, so the result can only be handed to server-rendered cards.
 */
export async function productCardLabels(): Promise<ProductCardLabels> {
  const t = await getTranslations();
  return {
    comingSoonBadge: t("product.comingSoon.badge"),
    comingSoonPrice: t("card.comingSoonPrice"),
    outOfStock: t("card.outOfStock"),
    discount: (n) => t("card.discount", { n }),
    compareAtSr: t("card.compareAtSr"),
  };
}
