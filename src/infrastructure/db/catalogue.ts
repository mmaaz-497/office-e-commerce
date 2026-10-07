import { SEARCH_RESULTS_MAX, escapeLikePattern } from "@/domain/catalogue/search-query";
import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { LEGACY_STOCK_LEVEL_ID } from "./legacy-stock";
import {
  INDEXABLE_STATUSES,
  LISTED_STATUSES,
  SALEABLE_STATUSES,
  isOnSale,
  type ProductStatus,
} from "@/domain/catalogue/status";
import type { AppLocale } from "@/i18n/routing";

/**
 * The storefront's only road to product data (FR-021, contracts/catalogue.md).
 * Pages and components receive locale-resolved ProductViews from here and
 * never query the catalogue tables, read product.json, or translate a
 * catalogue message key themselves.
 *
 * Every read is wrapped in React cache(), so the layout's header and footer
 * and the page beneath them share one query per request.
 */

export type ImageOrientation = "landscape" | "portrait" | "square";

export interface ProductImageView {
  src: string;
  alt: string;
  width: number;
  height: number;
  orientation: ImageOrientation;
}

export interface ProductView {
  id: string;
  slug: string;
  status: ProductStatus;
  categorySlug: string;
  /** null only when the product is not ACTIVE (Product_active_requires_price). */
  priceIDR: number | null;
  compareAtPriceIDR: number | null;
  name: string;
  shortDescription: string;
  longDescription: string;
  highlights: string[];
  specs: Array<{ label: string; value: string }>;
  seoTitle: string | null;
  seoDescription: string | null;
  images: ProductImageView[];
  video: { src: string; poster: string; alt: string } | null;
  soldCountBaseline: number;
  isSample: boolean;
}

export class CatalogueEmptyError extends Error {
  constructor() {
    super("Catalogue is empty: run npm run catalogue:import");
    this.name = "CatalogueEmptyError";
  }
}

const PRODUCT_ORDER: Prisma.ProductOrderByWithRelationInput[] = [
  { position: "asc" },
  { createdAt: "asc" },
];

function includeFor(locale: AppLocale) {
  return {
    category: { select: { slug: true } },
    translations: { where: { locale } },
    images: { orderBy: { position: "asc" } },
  } satisfies Prisma.ProductInclude;
}

type ProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof includeFor> }>;

function isSpecRow(value: unknown): value is { label: string; value: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).label === "string" &&
    typeof (value as Record<string, unknown>).value === "string"
  );
}

function toView(row: ProductRow, locale: AppLocale): ProductView | null {
  const translation = row.translations[0];
  if (!translation) {
    // The schema requires both locales before a product is listed; a row
    // without one is a data defect, logged rather than shown half-translated.
    console.error(`Catalogue: product ${row.slug} has no ${locale} translation; not shown.`);
    return null;
  }

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    categorySlug: row.category.slug,
    priceIDR: row.priceIDR,
    compareAtPriceIDR: row.compareAtPriceIDR,
    name: translation.name,
    shortDescription: translation.shortDescription,
    longDescription: translation.longDescription,
    highlights: translation.highlights,
    specs: Array.isArray(translation.specs) ? translation.specs.filter(isSpecRow) : [],
    seoTitle: translation.seoTitle,
    seoDescription: translation.seoDescription,
    images: row.images.map((image) => ({
      src: image.url,
      alt: locale === "id" ? image.altId : image.altEn,
      width: image.width,
      height: image.height,
      orientation: image.orientation as ImageOrientation,
    })),
    video:
      row.videoUrl && row.videoPosterUrl
        ? { src: row.videoUrl, poster: row.videoPosterUrl, alt: translation.videoAlt ?? "" }
        : null,
    soldCountBaseline: row.soldCountBaseline,
    isSample: row.isSample,
  };
}

/** Every listed product (ACTIVE and COMING_SOON), in storefront order. */
export const listListedProducts = cache(async (locale: AppLocale): Promise<ProductView[]> => {
  const rows = await prisma.product.findMany({
    where: { status: { in: [...LISTED_STATUSES] } },
    orderBy: PRODUCT_ORDER,
    include: includeFor(locale),
  });
  return rows.flatMap((row) => toView(row, locale) ?? []);
});

/**
 * The header search (007 FR-006, research R-704): listed products whose name
 * or short description in this language contains the query, case-insensitively
 * and literally — LIKE's wildcards are escaped, so "50%" matches only "50%".
 * DRAFT is never listed, so never found. The query arrives already parsed by
 * parseSearchQuery (trimmed, capped at 80 characters, non-empty).
 */
export const searchListedProducts = cache(
  async (q: string, locale: AppLocale): Promise<ProductView[]> => {
    const contains = { contains: escapeLikePattern(q), mode: "insensitive" as const };
    const rows = await prisma.product.findMany({
      where: {
        status: { in: [...LISTED_STATUSES] },
        translations: {
          some: { locale, OR: [{ name: contains }, { shortDescription: contains }] },
        },
      },
      orderBy: PRODUCT_ORDER,
      take: SEARCH_RESULTS_MAX,
      include: includeFor(locale),
    });
    return rows.flatMap((row) => toView(row, locale) ?? []);
  },
);

/** The product page's lookup. null for an unknown or DRAFT slug. */
export const getListedProductBySlug = cache(
  async (slug: string, locale: AppLocale): Promise<ProductView | null> => {
    const row = await prisma.product.findFirst({
      where: { slug, status: { in: [...LISTED_STATUSES] } },
      include: includeFor(locale),
    });
    return row ? toView(row, locale) : null;
  },
);

/**
 * The featured product behind the header, footer, homepage CTAs and the order
 * confirmation link: the first product on sale, so a Coming Soon product
 * placed first never takes the buy links. Only when nothing is on sale is it
 * the first listed (Coming Soon) product, whose display flags then hide every
 * purchase element; DRAFT is never listed, so never featured (005 R-407).
 * Never throws — for the layout's header and footer, whose errors the
 * segment's error.tsx cannot catch (/sp.analyze H4).
 */
export const getFeaturedProductOrNull = cache(
  async (locale: AppLocale): Promise<ProductView | null> => {
    const products = await listListedProducts(locale);
    return products.find(isOnSale) ?? products[0] ?? null;
  },
);

/** The first listed product, for pages: an empty catalogue reaches error.tsx. */
export async function getFeaturedProduct(locale: AppLocale): Promise<ProductView> {
  const featured = await getFeaturedProductOrNull(locale);
  if (!featured) {
    const error = new CatalogueEmptyError();
    console.error(error.message);
    throw error;
  }
  return featured;
}

/** ACTIVE products only, for the sitemap (FR-012 "Indexed"). */
export const listIndexableProducts = cache(
  async (): Promise<Array<{ slug: string; updatedAt: Date }>> => {
    return prisma.product.findMany({
      where: { status: { in: [...INDEXABLE_STATUSES] } },
      orderBy: PRODUCT_ORDER,
      select: { slug: true, updatedAt: true },
    });
  },
);

export type CheckoutProductResolution =
  | { kind: "ok"; product: ProductView }
  | { kind: "redirectToProduct"; slug: string }
  | { kind: "notFound" }
  | { kind: "redirectHome" };

/**
 * The products on sale: ACTIVE with a price (isOnSale). The checkout's
 * "no product named" fallback buys the only one, so links that predate the
 * `product` parameter keep working while exactly one product is for sale.
 */
const listOnSaleProducts = cache(async (locale: AppLocale): Promise<ProductView[]> => {
  const rows = await prisma.product.findMany({
    where: { status: { in: [...SALEABLE_STATUSES] } },
    orderBy: PRODUCT_ORDER,
    include: includeFor(locale),
  });
  return rows.flatMap((row) => (isOnSale(row) ? (toView(row, locale) ?? []) : []));
});

/**
 * The product a checkout is for (contracts/checkout.md). Shared by the
 * checkout page, which turns each kind into a render, redirect or 404, and by
 * submitCheckout, which refuses anything but `ok` — so the page and the server
 * action cannot disagree about what is for sale.
 */
export const resolveCheckoutProduct = cache(
  async (slug: string | undefined, locale: AppLocale): Promise<CheckoutProductResolution> => {
    if (slug === undefined) {
      const onSale = await listOnSaleProducts(locale);
      return onSale.length === 1 ? { kind: "ok", product: onSale[0] } : { kind: "redirectHome" };
    }

    const product = await getListedProductBySlug(slug, locale);
    if (!product) return { kind: "notFound" };
    if (!isOnSale(product)) return { kind: "redirectToProduct", slug: product.slug };
    return { kind: "ok", product };
  },
);

/**
 * The legacy product: the one the original 'default' stock row is linked to
 * (R-203). Admin screens that are not yet product-aware act on it, and rows
 * with no productId belong to it (R-202). null before the import has run.
 */
export const getLegacyProductId = cache(async (): Promise<string | null> => {
  const stock = await prisma.stockLevel.findUnique({
    where: { id: LEGACY_STOCK_LEVEL_ID },
    select: { productId: true },
  });
  return stock?.productId ?? null;
});

/**
 * The Prisma filter for "rows belonging to this product" — including the
 * unattributed rows when it is the legacy product (data-model.md, R-202).
 */
export function productScope(
  productId: string,
  legacyProductId: string | null,
): { OR: Array<{ productId: string | null }> } {
  return {
    OR: productId === legacyProductId ? [{ productId }, { productId: null }] : [{ productId }],
  };
}

/** A product's stock. A missing row is zero stock, logged, as checkout always treated it. */
export async function getProductStock(productId: string): Promise<number> {
  const stock = await prisma.stockLevel.findUnique({ where: { productId } });
  if (!stock) {
    console.error(`StockLevel for product ${productId} is missing; treating as out of stock.`);
    return 0;
  }
  return stock.quantity;
}

/** A category as the storefront shows it: only while it has a listed product (006 R-506). */
export interface StorefrontCategory {
  slug: string;
  name: string;
}

/**
 * The categories with at least one ACTIVE or COMING_SOON product, in admin
 * order. DRAFT-only and empty categories drop out here, once, for the header,
 * footer, homepage tiles and category page alike (FR-014, FR-022b).
 */
export const listStorefrontCategories = cache(
  async (locale: AppLocale): Promise<StorefrontCategory[]> => {
    const rows = await prisma.category.findMany({
      where: { products: { some: { status: { in: [...LISTED_STATUSES] } } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { slug: true, nameId: true, nameEn: true },
    });
    return rows.map((row) => ({
      slug: row.slug,
      name: locale === "id" ? row.nameId : row.nameEn,
    }));
  },
);

/** The category page's lookup: null for an unknown, DRAFT-only or empty category. */
export const getStorefrontCategory = cache(
  async (slug: string, locale: AppLocale): Promise<StorefrontCategory | null> => {
    const categories = await listStorefrontCategories(locale);
    return categories.find((category) => category.slug === slug) ?? null;
  },
);

/**
 * Stock for the product cards on a page, in one query (006 R-505). A missing
 * row is zero stock, logged, the same rule as getProductStock.
 */
export const getStockLevels = cache(
  async (productIds: readonly string[]): Promise<Map<string, number>> => {
    const levels = new Map<string, number>();
    if (productIds.length === 0) return levels;

    const rows = await prisma.stockLevel.findMany({
      where: { productId: { in: [...productIds] } },
      select: { productId: true, quantity: true },
    });
    for (const row of rows) {
      if (row.productId !== null) levels.set(row.productId, row.quantity);
    }
    for (const id of productIds) {
      if (!levels.has(id)) {
        console.error(`StockLevel for product ${id} is missing; treating as out of stock.`);
        levels.set(id, 0);
      }
    }
    return levels;
  },
);
