import type { ProductStatus } from "./status";

/**
 * What a product card shows (data-model.md §ProductCardState, research R-504).
 * DRAFT never reaches this function: the storefront readers never list it.
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export type ProductCardState =
  | { kind: "comingSoon" }
  | {
      kind: "active";
      priceIDR: number;
      /** Only when it is greater than priceIDR. */
      compareAtPriceIDR: number | null;
      /** Rounded down, so a discount is never overstated; null below 1 %. */
      discountPercent: number | null;
      outOfStock: boolean;
    };

export type CardBadge = "outOfStock" | "discount" | "comingSoon";

/** The Design System allows at most two badges on a card. */
const MAX_BADGES = 2;

/**
 * `stock === null` means unknown and is not treated as out of stock. It does
 * not occur for ACTIVE products, because getStockLevels always supplies a number.
 */
export function productCardState(
  product: { status: ProductStatus; priceIDR: number | null; compareAtPriceIDR: number | null },
  stock: number | null,
): ProductCardState {
  if (product.status === "COMING_SOON") return { kind: "comingSoon" };

  const priceIDR = product.priceIDR ?? 0;
  const compareAt = product.compareAtPriceIDR;
  let compareAtPriceIDR: number | null = null;
  let discountPercent: number | null = null;
  if (compareAt !== null && compareAt > priceIDR) {
    compareAtPriceIDR = compareAt;
    const percent = Math.floor(((compareAt - priceIDR) / compareAt) * 100);
    discountPercent = percent >= 1 ? percent : null;
  }

  return {
    kind: "active",
    priceIDR,
    compareAtPriceIDR,
    discountPercent,
    outOfStock: stock !== null && stock <= 0,
  };
}

/** Badge order: comingSoon or outOfStock first, then discount; at most two. */
export function cardBadges(state: ProductCardState): CardBadge[] {
  if (state.kind === "comingSoon") return ["comingSoon"];
  const badges: CardBadge[] = [];
  if (state.outOfStock) badges.push("outOfStock");
  if (state.discountPercent !== null) badges.push("discount");
  return badges.slice(0, MAX_BADGES);
}
