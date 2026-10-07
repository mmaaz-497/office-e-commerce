import type { ProductInput } from "./product-schema";

/**
 * Sample products (005 US1, US5; research R-411, R-412, R-414). Pure: no
 * Prisma, no Next (ESLint domain rule). The seed and cleanup commands read
 * the database, hand the state to these functions, and act only on what they
 * return, so every refusal and every keep is decided here and unit-tested.
 */

type SampleTranslation = { name: string; shortDescription: string; longDescription: string };

/** One of the 10 fixed samples in prisma/samples/definitions.ts. */
export interface SampleDefinition {
  slug: string;
  id: SampleTranslation;
  en: SampleTranslation;
  /** Public-relative path of its own 1200×1200 placeholder PNG. */
  image: string;
  /** The placeholder's flat background, from the brand palette. */
  tint: string;
}

/** Every placeholder is a 1200×1200 square PNG (R-413). */
export const SAMPLE_IMAGE_SIZE = 1200;

/** The data-model "Sample product" alt texts. */
export function sampleImageAlts(definition: SampleDefinition): { altId: string; altEn: string } {
  return {
    altId: `Gambar sementara – ${definition.id.name}`,
    altEn: `Placeholder image – ${definition.en.name}`,
  };
}

/**
 * The ProductInput a sample is created as: COMING_SOON, no price, SKU or
 * video, its one placeholder image. Validated with productInputSchema by the
 * unit tests and again at seed time (R-411).
 */
export function sampleProductInput(definition: SampleDefinition): ProductInput {
  const translation = (t: SampleTranslation) => ({
    name: t.name,
    shortDescription: t.shortDescription,
    longDescription: t.longDescription,
    highlights: [],
    specs: [],
    seoTitle: null,
    seoDescription: null,
    videoAlt: null,
  });
  return {
    slug: definition.slug,
    sku: null,
    status: "COMING_SOON",
    priceIDR: null,
    compareAtPriceIDR: null,
    images: [
      {
        url: definition.image,
        width: SAMPLE_IMAGE_SIZE,
        height: SAMPLE_IMAGE_SIZE,
        orientation: "square",
        ...sampleImageAlts(definition),
      },
    ],
    video: null,
    translations: { id: translation(definition.id), en: translation(definition.en) },
  };
}

export interface SampleSeedState {
  /** ACTIVE products with isSample = false. */
  activeRealProducts: Array<{ id: string; categoryId: string; updatedAt: Date }>;
  /** Existing products holding any of the definitions' slugs. */
  existing: Array<{ slug: string; isSample: boolean }>;
  /** The highest position of any product, or -1 with none. */
  maxPosition: number;
}

export type SampleSeedPlan =
  | { kind: "refuse"; reason: "activeCount"; count: number }
  | { kind: "refuse"; reason: "slugTaken"; slug: string }
  | {
      kind: "plan";
      categoryId: string;
      create: Array<{ definition: SampleDefinition; position: number }>;
      skip: string[];
    };

/**
 * The seed plan (R-412, contracts/operator-commands.md). It refuses unless
 * exactly one ACTIVE real product exists, and refuses when any slug belongs
 * to a real product, before anything would be created. Otherwise an existing
 * sample is skipped (owner edits survive) and a missing slug is created after
 * every existing position, in definition order.
 */
export function planSampleSeed(
  state: SampleSeedState,
  definitions: readonly SampleDefinition[],
): SampleSeedPlan {
  if (state.activeRealProducts.length !== 1) {
    return { kind: "refuse", reason: "activeCount", count: state.activeRealProducts.length };
  }
  const bySlug = new Map(state.existing.map((row) => [row.slug, row]));
  const taken = definitions.find((definition) => bySlug.get(definition.slug)?.isSample === false);
  if (taken) return { kind: "refuse", reason: "slugTaken", slug: taken.slug };

  const missing = definitions.filter((definition) => !bySlug.has(definition.slug));
  return {
    kind: "plan",
    categoryId: state.activeRealProducts[0].categoryId,
    create: missing.map((definition, index) => ({
      definition,
      position: state.maxPosition + 1 + index,
    })),
    skip: definitions
      .filter((definition) => bySlug.has(definition.slug))
      .map((definition) => definition.slug),
  };
}

/** Why cleanup keeps a sample, in check order (R-414). */
export type SampleKeepReason =
  "active" | "hasOrders" | "hasReviews" | "hasStockHistory" | "hasStock";

export interface SampleCleanupFacts {
  status: "ACTIVE" | "COMING_SOON" | "DRAFT";
  orders: number;
  reviews: number;
  stockChanges: number;
  /** null when the product has no StockLevel row. */
  stockQuantity: number | null;
}

/**
 * `cleanup:samples` deletes a sample only when it carries nothing worth
 * keeping (data-model "Cleanup eligibility", R-414): not ACTIVE, and no
 * orders, reviews, stock history or stock. Each keep is defensive — a sample
 * cannot be ordered or stocked through the admin — so a reported keep means
 * data was written outside it and the operator should look. When several
 * reasons hold, the first in this order is reported.
 */
export function classifySampleForCleanup(
  facts: SampleCleanupFacts,
): { kind: "delete" } | { kind: "keep"; reason: SampleKeepReason } {
  if (facts.status === "ACTIVE") return { kind: "keep", reason: "active" };
  if (facts.orders > 0) return { kind: "keep", reason: "hasOrders" };
  if (facts.reviews > 0) return { kind: "keep", reason: "hasReviews" };
  if (facts.stockChanges > 0) return { kind: "keep", reason: "hasStockHistory" };
  if (facts.stockQuantity !== null && facts.stockQuantity > 0) {
    return { kind: "keep", reason: "hasStock" };
  }
  return { kind: "delete" };
}
