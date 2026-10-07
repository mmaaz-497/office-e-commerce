/**
 * The product status rules — FR-012, defined once and used everywhere: the
 * storefront (what is listed), SEO (what is indexed), checkout (what may be
 * bought) and, from Phase 2b, the admin product form. A status comparison
 * written anywhere else is a second definition waiting to drift (T048).
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule, ADR-0001).
 */

export type ProductStatus = "ACTIVE" | "COMING_SOON" | "DRAFT";

/** The minimum a rule needs — satisfied by a Prisma row and by a ProductView alike. */
export interface CatalogueProductLike {
  status: ProductStatus;
  priceIDR: number | null;
}

/**
 * The same rules as status lists, for database queries that must filter before
 * loading. Derived from the predicates below so the two cannot disagree.
 */
const ALL_STATUSES: readonly ProductStatus[] = ["ACTIVE", "COMING_SOON", "DRAFT"];
export const LISTED_STATUSES: readonly ProductStatus[] = ALL_STATUSES.filter((status) =>
  isListed({ status, priceIDR: null }),
);
export const INDEXABLE_STATUSES: readonly ProductStatus[] = ALL_STATUSES.filter((status) =>
  isIndexable({ status, priceIDR: null }),
);
/** Statuses that can be on sale; the price is still checked per row with isOnSale. */
export const SALEABLE_STATUSES: readonly ProductStatus[] = ALL_STATUSES.filter((status) =>
  isOnSale({ status, priceIDR: 1 }),
);

/** Shown on the storefront. A DRAFT product is not found. */
export function isListed(product: CatalogueProductLike): boolean {
  return product.status !== "DRAFT";
}

/** Eligible for the sitemap and product structured data. */
export function isIndexable(product: CatalogueProductLike): boolean {
  return product.status === "ACTIVE";
}

/**
 * Status and price allow a sale. Stock is checked separately, because a
 * shortfall keeps its own "insufficient stock" refusal (FR-015). The price
 * check is the application-level twin of the Product_active_requires_price
 * CHECK constraint, not a substitute for it.
 */
export function isOnSale(product: CatalogueProductLike): boolean {
  return product.status === "ACTIVE" && product.priceIDR !== null && product.priceIDR > 0;
}

/** On sale and stock covers a whole, positive quantity. */
export function isPurchasable(
  product: CatalogueProductLike,
  stock: number,
  quantity: number,
): boolean {
  return isOnSale(product) && Number.isInteger(quantity) && quantity >= 1 && stock >= quantity;
}

/** Announced but not yet sold: listed with a badge, no price or purchase. */
export function isComingSoon(product: CatalogueProductLike): boolean {
  return product.status === "COMING_SOON";
}

/** What the storefront may show for one product — the product page and the showcase read this. */
export interface StorefrontDisplay {
  onSale: boolean;
  comingSoon: boolean;
  showPrice: boolean;
  showPurchase: boolean;
  showSocialProof: boolean;
  indexable: boolean;
}

/**
 * Research R-408: price, purchase elements and social proof all follow
 * isOnSale, so a COMING_SOON product with a stored price still shows none of
 * them. One function, so a page cannot gate the price and forget the reviews.
 */
export function storefrontDisplay(product: CatalogueProductLike): StorefrontDisplay {
  const onSale = isOnSale(product);
  return {
    onSale,
    comingSoon: isComingSoon(product),
    showPrice: onSale,
    showPurchase: onSale,
    showSocialProof: onSale,
    indexable: isIndexable(product),
  };
}
