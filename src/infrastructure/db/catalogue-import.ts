import type { Prisma } from "@prisma/client";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import id from "@/messages/id.json";
import en from "@/messages/en.json";
import { productInputSchema, type ProductInput } from "@/domain/catalogue/product-schema";
import { isOnSale } from "@/domain/catalogue/status";
import { SOLD_COUNT_BASELINE_KEY } from "@/domain/settings";
import { LEGACY_STOCK_LEVEL_ID } from "./legacy-stock";

/**
 * The one-way move of the repository catalogue into the database (FR-008…FR-010,
 * research R-206, ADR-0004). It is run by `npm run catalogue:import` on every
 * deploy and by the integration-test helpers, so test data is exactly what
 * production gets.
 *
 * Safety properties, each relied on by the deploy:
 * - It runs inside the caller's transaction: all or nothing.
 * - It never overwrites. An existing category or product is skipped, so the
 *   owner's later edits survive every re-run.
 * - Its only UPDATEs fill in a NULL productId (and link the 'default' stock
 *   row, which is also a NULL fill). It never deletes, and never touches a
 *   price, quantity or status.
 * - It aborts (CatalogueImportConflictError) when the 'default' stock row is
 *   already linked to a different product — a state it cannot reason about.
 *
 * This file is the only runtime reader of src/data/product.json and of the
 * product.* message values (Constitution v2.0.0 Principle III; enforced by
 * tests/unit/catalogue-runtime-readers.test.ts).
 */

export class CatalogueImportConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogueImportConflictError";
  }
}

export interface ImportSource {
  category: { slug: string; nameId: string; nameEn: string };
  /** The first product is the legacy product: the one the 'default' stock row belongs to. */
  products: ProductInput[];
}

export interface ImportSummary {
  category: { created: number };
  product: { created: number; skipped: number };
  imageSize: { corrected: number };
  stockLink: { created: number; linked: number };
  backfill: { orders: number; stockChanges: number; reviews: number };
  baselineCopied: number;
}

function message(messages: Record<string, unknown>, key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => {
    return node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
  }, messages);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Catalogue import: message "${key}" is missing or empty`);
  }
  return value;
}

/** Maps product.json plus the product.* messages exactly as research R-207 specifies. */
export function buildImportSource(): ImportSource {
  const products = (catalogue as Product[]).map((product): ProductInput => {
    const translation = (messages: Record<string, unknown>) => {
      const highlights = product.benefitKeys.map((key) => message(messages, key));
      return {
        name: message(messages, product.nameKey),
        shortDescription: highlights.join(" · "),
        longDescription: "",
        highlights,
        specs: [],
        seoTitle: message(messages, "product.metadata.title"),
        seoDescription: message(messages, "product.metadata.description"),
        videoAlt: product.video ? message(messages, product.video.altKey) : null,
      };
    };

    return {
      slug: product.slug,
      sku: null,
      status: "ACTIVE",
      priceIDR: product.priceIDR,
      compareAtPriceIDR: null,
      images: product.images.map((image) => ({
        url: image.src,
        width: image.width,
        height: image.height,
        orientation: image.orientation,
        altId: message(id, image.altKey),
        altEn: message(en, image.altKey),
      })),
      video: product.video ? { url: product.video.src, posterUrl: product.video.poster } : null,
      translations: { id: translation(id), en: translation(en) },
    };
  });

  return { category: { slug: "sandal", nameId: "Sandal", nameEn: "Sandals" }, products };
}

/**
 * An existing product is otherwise left alone (the owner's edits win), but a
 * catalogue image's size is a fact about the file under public/, not an edit:
 * rows written while sizes were declared per orientation carry the wrong one.
 * Matches by url, so images the owner added or removed are untouched.
 */
async function correctImageSizes(
  tx: Prisma.TransactionClient,
  productId: string,
  images: readonly { url: string; width: number; height: number }[],
): Promise<number> {
  let corrected = 0;
  for (const { url, width, height } of images) {
    const { count } = await tx.productImage.updateMany({
      where: { productId, url, NOT: { width, height } },
      data: { width, height },
    });
    corrected += count;
  }
  return corrected;
}

async function readSoldCountBaseline(tx: Prisma.TransactionClient): Promise<number> {
  const setting = await tx.setting.findUnique({ where: { key: SOLD_COUNT_BASELINE_KEY } });
  const parsed = setting ? parseInt(setting.value, 10) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function importCatalogue(
  tx: Prisma.TransactionClient,
  source: ImportSource,
): Promise<ImportSummary> {
  if (source.products.length === 0) {
    throw new Error("Catalogue import: the source holds no products");
  }

  const summary: ImportSummary = {
    category: { created: 0 },
    product: { created: 0, skipped: 0 },
    imageSize: { corrected: 0 },
    stockLink: { created: 0, linked: 0 },
    backfill: { orders: 0, stockChanges: 0, reviews: 0 },
    baselineCopied: 0,
  };

  let category = await tx.category.findUnique({ where: { slug: source.category.slug } });
  if (!category) {
    category = await tx.category.create({ data: source.category });
    summary.category.created += 1;
  }

  const productIds: string[] = [];
  for (const [position, raw] of source.products.entries()) {
    const input = productInputSchema.parse(raw);
    const existing = await tx.product.findUnique({ where: { slug: input.slug } });
    if (existing) {
      productIds.push(existing.id);
      summary.product.skipped += 1;
      summary.imageSize.corrected += await correctImageSizes(tx, existing.id, input.images);
      continue;
    }

    // Only the legacy product inherits the store-wide baseline (spec Assumptions).
    const soldCountBaseline = position === 0 ? await readSoldCountBaseline(tx) : 0;
    const created = await tx.product.create({
      data: {
        slug: input.slug,
        sku: input.sku,
        status: input.status,
        categoryId: category.id,
        priceIDR: input.priceIDR,
        compareAtPriceIDR: input.compareAtPriceIDR,
        position,
        videoUrl: input.video?.url ?? null,
        videoPosterUrl: input.video?.posterUrl ?? null,
        soldCountBaseline,
        publishedAt: isOnSale(input) ? new Date() : null,
        translations: {
          create: (["id", "en"] as const).map((locale) => ({
            locale,
            ...input.translations[locale],
          })),
        },
        images: {
          create: input.images.map((image, imagePosition) => ({
            ...image,
            position: imagePosition,
          })),
        },
      },
    });
    productIds.push(created.id);
    summary.product.created += 1;
    if (position === 0) summary.baselineCopied += 1;
  }

  const legacyProductId = productIds[0];

  const stock = await tx.stockLevel.findUnique({ where: { id: LEGACY_STOCK_LEVEL_ID } });
  if (!stock) {
    // Same opening rule as prisma/seed.production.ts: zero until the owner counts.
    await tx.stockLevel.create({
      data: { id: LEGACY_STOCK_LEVEL_ID, quantity: 0, productId: legacyProductId },
    });
    summary.stockLink.created += 1;
  } else if (stock.productId === null) {
    // Raw SQL so the link does not bump updatedAt: the quantity did not change.
    await tx.$executeRaw`
      UPDATE "StockLevel" SET "productId" = ${legacyProductId}
      WHERE id = ${LEGACY_STOCK_LEVEL_ID} AND "productId" IS NULL
    `;
    summary.stockLink.linked += 1;
  } else if (stock.productId !== legacyProductId) {
    throw new CatalogueImportConflictError(
      `StockLevel '${LEGACY_STOCK_LEVEL_ID}' is linked to product ${stock.productId}, ` +
        `not to the legacy product ${legacyProductId}. Nothing was written.`,
    );
  }

  // Attribute pre-catalogue history to the legacy product (R-202). Raw SQL so
  // Order.updatedAt is not bumped — the order itself did not change.
  summary.backfill.orders = await tx.$executeRaw`
    UPDATE "Order" SET "productId" = ${legacyProductId} WHERE "productId" IS NULL
  `;
  summary.backfill.stockChanges = await tx.$executeRaw`
    UPDATE "StockChange" SET "productId" = ${legacyProductId} WHERE "productId" IS NULL
  `;
  summary.backfill.reviews = await tx.$executeRaw`
    UPDATE "Review" SET "productId" = ${legacyProductId} WHERE "productId" IS NULL
  `;

  return summary;
}

export function isNothingToDo(summary: ImportSummary): boolean {
  return (
    summary.category.created === 0 &&
    summary.product.created === 0 &&
    summary.imageSize.corrected === 0 &&
    summary.stockLink.created === 0 &&
    summary.stockLink.linked === 0 &&
    summary.backfill.orders === 0 &&
    summary.backfill.stockChanges === 0 &&
    summary.backfill.reviews === 0 &&
    summary.baselineCopied === 0
  );
}
