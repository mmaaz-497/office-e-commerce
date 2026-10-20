import { isOnSale, type CatalogueProductLike } from "./status";

/**
 * The all-products page's rules (/produk, /en/products): which sorts exist,
 * how the query string is read, how listed products are ordered and how they
 * are split into pages. The sort and page cross a server boundary, so an
 * unknown or malformed value falls back to the default rather than erroring
 * (Constitution IX).
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export const PRODUCT_SORTS = ["newest", "price-asc", "price-desc"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];
export const DEFAULT_PRODUCT_SORT: ProductSort = "newest";

/** Divisible by the grid's 2, 3 and 4 columns, so no page ends on a ragged row. */
export const PRODUCTS_PER_PAGE = 24;

export interface ProductListingQuery {
  sort: ProductSort;
  page: number;
}

function first(raw: unknown): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value : undefined;
}

function isProductSort(value: string | undefined): value is ProductSort {
  return (PRODUCT_SORTS as readonly string[]).includes(value ?? "");
}

export function parseProductListingQuery(raw: {
  sort?: unknown;
  page?: unknown;
}): ProductListingQuery {
  const sort = first(raw.sort);
  const page = first(raw.page);
  return {
    sort: isProductSort(sort) ? sort : DEFAULT_PRODUCT_SORT,
    // Digits only, so "2.5", "1e3" and "-1" are page 1, not a parsed surprise.
    page: page !== undefined && /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1,
  };
}

export interface ListableProduct extends CatalogueProductLike {
  createdAt: Date;
}

/**
 * Newest first by creation date. The price sorts rank only products on sale;
 * the rest (Coming Soon) follow in their incoming catalogue order, so a stored
 * price the storefront never shows cannot decide their position (R-408).
 * Array.prototype.sort is stable, so ties keep catalogue order.
 */
export function sortListedProducts<P extends ListableProduct>(
  products: readonly P[],
  sort: ProductSort,
): P[] {
  if (sort === "newest") {
    return [...products].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  const direction = sort === "price-asc" ? 1 : -1;
  const onSale = products.filter(isOnSale);
  const rest = products.filter((product) => !isOnSale(product));
  onSale.sort((a, b) => direction * ((a.priceIDR ?? 0) - (b.priceIDR ?? 0)));
  return [...onSale, ...rest];
}

export interface ProductPage<P> {
  items: P[];
  page: number;
  pageCount: number;
  total: number;
}

/**
 * One page of items. A page past the last is the last page: the page route
 * streams behind its loading.tsx, so it could only answer a soft 404, and a
 * link kept from a larger catalogue should still land on products. An empty
 * list is one empty page.
 */
export function paginate<P>(items: readonly P[], requested: number): ProductPage<P> {
  const pageCount = Math.max(1, Math.ceil(items.length / PRODUCTS_PER_PAGE));
  const page = Math.min(requested, pageCount);
  const start = (page - 1) * PRODUCTS_PER_PAGE;
  return {
    items: items.slice(start, start + PRODUCTS_PER_PAGE),
    page,
    pageCount,
    total: items.length,
  };
}
