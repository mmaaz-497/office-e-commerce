import type { Prisma } from "@prisma/client";
import { productInputSchema } from "@/domain/catalogue/product-schema";
import {
  classifySampleForCleanup,
  planSampleSeed,
  sampleProductInput,
  type SampleDefinition,
  type SampleKeepReason,
  type SampleSeedPlan,
  type SampleSeedState,
} from "@/domain/catalogue/samples";

/**
 * The database side of `seed:samples` and `cleanup:samples` (005 US1, US5;
 * research R-412, R-414; contracts/operator-commands.md). The decisions are
 * pure (src/domain/catalogue/samples.ts); this file reads the state they need
 * and carries out what they return, inside the caller's transaction.
 *
 * Operator commands only: no page, component or server action imports this
 * file (tests/unit/admin-no-delete.test.ts), so no route can reach the one
 * place a product is ever deleted.
 */

type Tx = Prisma.TransactionClient;

/** A precondition failed (exit 2, nothing written). */
export class SampleSeedRefusedError extends Error {
  constructor(readonly plan: Extract<SampleSeedPlan, { kind: "refuse" }>) {
    super(
      plan.reason === "activeCount"
        ? `expected exactly one ACTIVE real product, found ${plan.count}`
        : `slug ${plan.slug} belongs to a real product`,
    );
    this.name = "SampleSeedRefusedError";
  }
}

/** A post-check failed after the writes (exit 1); throwing rolls them back. */
export class SamplePostCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SamplePostCheckError";
  }
}

/** What the planner needs, read in the caller's transaction or with plain prisma. */
export async function readSampleSeedState(
  tx: Tx,
  definitions: readonly SampleDefinition[],
): Promise<SampleSeedState> {
  const [activeRealProducts, existing, max] = await Promise.all([
    tx.product.findMany({
      where: { status: "ACTIVE", isSample: false },
      select: { id: true, categoryId: true, updatedAt: true },
      orderBy: { id: "asc" },
    }),
    tx.product.findMany({
      where: { slug: { in: definitions.map((definition) => definition.slug) } },
      select: { slug: true, isSample: true },
    }),
    tx.product.aggregate({ _max: { position: true } }),
  ]);
  return { activeRealProducts, existing, maxPosition: max._max.position ?? -1 };
}

/** The state the post-checks compare against: ACTIVE ids and the existing product's updatedAt. */
export interface SampleSeedBefore {
  activeIds: string[];
  existing: { id: string; updatedAt: Date };
}

export function seedBefore(state: SampleSeedState): SampleSeedBefore {
  const [existing] = state.activeRealProducts;
  return {
    activeIds: state.activeRealProducts.map((product) => product.id),
    existing: { id: existing.id, updatedAt: existing.updatedAt },
  };
}

/**
 * Creates the planned samples (data-model "Sample product"): COMING_SOON,
 * isSample, no price, both translations, one placeholder image. Never a
 * StockLevel, never publishedAt. Each definition is validated with the shared
 * schema first (R-411). Then `beforePostCheck` (a test seam) and the
 * post-checks run; a mismatch throws SamplePostCheckError so the caller's
 * transaction rolls everything back.
 */
export async function seedSamples(
  tx: Tx,
  plan: Extract<SampleSeedPlan, { kind: "plan" }>,
  definitions: readonly SampleDefinition[],
  before: SampleSeedBefore,
  beforePostCheck?: (tx: Tx) => Promise<unknown>,
): Promise<string[]> {
  for (const { definition, position } of plan.create) {
    const input = productInputSchema.parse(sampleProductInput(definition));
    await tx.product.create({
      data: {
        slug: input.slug,
        status: "COMING_SOON",
        isSample: true,
        categoryId: plan.categoryId,
        priceIDR: null,
        compareAtPriceIDR: null,
        sku: null,
        position,
        translations: {
          create: (["id", "en"] as const).map((locale) => {
            const t = input.translations[locale];
            return {
              locale,
              name: t.name,
              shortDescription: t.shortDescription,
              longDescription: t.longDescription,
              highlights: [],
              specs: [],
            };
          }),
        },
        images: {
          create: input.images.map((image, index) => ({ ...image, position: index })),
        },
      },
    });
  }

  await beforePostCheck?.(tx);
  await postCheckSamples(tx, definitions, before);
  return plan.create.map(({ definition }) => definition.slug);
}

async function postCheckSamples(
  tx: Tx,
  definitions: readonly SampleDefinition[],
  before: SampleSeedBefore,
): Promise<void> {
  const samples = await tx.product.count({
    where: { slug: { in: definitions.map((d) => d.slug) }, isSample: true },
  });
  if (samples !== definitions.length) {
    throw new SamplePostCheckError(`expected ${definitions.length} samples, found ${samples}`);
  }
  const active = await tx.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const activeIds = active.map((product) => product.id);
  if (activeIds.join(",") !== [...before.activeIds].sort().join(",")) {
    throw new SamplePostCheckError("the set of ACTIVE products changed");
  }
  const existing = await tx.product.findUniqueOrThrow({
    where: { id: before.existing.id },
    select: { updatedAt: true },
  });
  if (existing.updatedAt.getTime() !== before.existing.updatedAt.getTime()) {
    throw new SamplePostCheckError("the existing product was modified");
  }
}

/** Plans against a state; refuses by throwing, so a transaction rolls back. */
export function planOrRefuse(
  state: SampleSeedState,
  definitions: readonly SampleDefinition[],
): Extract<SampleSeedPlan, { kind: "plan" }> {
  const plan = planSampleSeed(state, definitions);
  if (plan.kind === "refuse") throw new SampleSeedRefusedError(plan);
  return plan;
}

export interface SampleCleanupResult {
  deleted: string[];
  kept: Array<{ slug: string; reason: SampleKeepReason }>;
}

/**
 * Classifies every sample and, with `apply`, deletes the deletable ones
 * (R-414). Only `isSample: true` rows are ever selected, so a real product —
 * including a promoted sample — can never be deleted here. A deleted sample's
 * StockLevel (only ever at 0, or the classifier keeps it) goes first; its
 * translations and images cascade. Files are never touched. The Restrict
 * foreign keys on Order, Review, StockChange and StockLevel are the
 * backstop: a mistaken delete fails and rolls the transaction back.
 */
export async function cleanupSamples(
  tx: Tx,
  { apply }: { apply: boolean },
): Promise<SampleCleanupResult> {
  const samples = await tx.product.findMany({
    where: { isSample: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      slug: true,
      status: true,
      stockLevel: { select: { quantity: true } },
      _count: { select: { orders: true, reviews: true, stockChanges: true } },
    },
  });

  const result: SampleCleanupResult = { deleted: [], kept: [] };
  for (const sample of samples) {
    const verdict = classifySampleForCleanup({
      status: sample.status,
      orders: sample._count.orders,
      reviews: sample._count.reviews,
      stockChanges: sample._count.stockChanges,
      stockQuantity: sample.stockLevel?.quantity ?? null,
    });
    if (verdict.kind === "keep") {
      result.kept.push({ slug: sample.slug, reason: verdict.reason });
      continue;
    }
    if (apply) {
      await tx.stockLevel.deleteMany({ where: { productId: sample.id } });
      await tx.product.delete({ where: { id: sample.id } });
    }
    result.deleted.push(sample.slug);
  }
  return result;
}
