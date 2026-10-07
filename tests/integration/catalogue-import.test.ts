import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  buildImportSource,
  CatalogueImportConflictError,
  importCatalogue,
} from "@/infrastructure/db/catalogue-import";
import { SOLD_COUNT_BASELINE_KEY } from "@/domain/settings";
import { resetDb, seedProduct, testOrderData } from "./helpers/db";

/**
 * T012 — US3: the existing product moves over intact (FR-008…FR-010, SC-003).
 * Every case drives the real import, exactly as the deploy step runs it.
 */
function runImport() {
  return prisma.$transaction((tx) => importCatalogue(tx, buildImportSource()));
}

async function snapshot() {
  const [categories, products, translations, images, stock, orders, changes, reviews, settings] =
    await Promise.all([
      prisma.category.findMany({ orderBy: { slug: "asc" } }),
      prisma.product.findMany({ orderBy: { slug: "asc" } }),
      prisma.productTranslation.findMany({ orderBy: [{ productId: "asc" }, { locale: "asc" }] }),
      prisma.productImage.findMany({ orderBy: [{ productId: "asc" }, { position: "asc" }] }),
      prisma.stockLevel.findMany({ orderBy: { id: "asc" } }),
      prisma.order.findMany({ orderBy: { orderNumber: "asc" } }),
      prisma.stockChange.findMany({ orderBy: { id: "asc" } }),
      prisma.review.findMany({ orderBy: { id: "asc" } }),
      prisma.setting.findMany({ orderBy: { key: "asc" } }),
    ]);
  return { categories, products, translations, images, stock, orders, changes, reviews, settings };
}

describe("catalogue:import (integration, US3)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  async function seedPreCatalogueStore() {
    await prisma.stockLevel.create({ data: { id: "default", quantity: 7 } });
    const paid = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-IMPORT-00001", status: "COMPLETED", quantity: 2 }),
    });
    await prisma.order.create({ data: testOrderData({ orderNumber: "TKS-IMPORT-00002" }) });
    await prisma.stockChange.create({
      data: { delta: -2, resultingQuantity: 7, reason: "ORDER_PAID", orderId: paid.id },
    });
    await prisma.review.create({
      data: {
        orderId: paid.id,
        origin: "VERIFIED_PURCHASE",
        rating: 5,
        reviewerName: "Sari",
        published: true,
        reviewedAt: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        origin: "OWNER_ENTERED",
        rating: 4,
        reviewerName: "Budi",
        published: true,
        reviewedAt: new Date(),
      },
    });
    await prisma.setting.create({ data: { key: SOLD_COUNT_BASELINE_KEY, value: "40" } });
  }

  it("(a) creates the category and product, links stock, attributes history, copies the baseline", async () => {
    await seedPreCatalogueStore();
    const settingBefore = await prisma.setting.findUniqueOrThrow({
      where: { key: SOLD_COUNT_BASELINE_KEY },
    });

    const summary = await runImport();

    const category = await prisma.category.findUniqueOrThrow({ where: { slug: "sandal" } });
    expect(category).toMatchObject({ nameId: "Sandal", nameEn: "Sandals" });

    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: "slippers-gemoy" },
      include: { images: true, translations: true },
    });
    expect(product).toMatchObject({
      status: "ACTIVE",
      priceIDR: 169999,
      categoryId: category.id,
      isSample: false,
      soldCountBaseline: 40,
      videoUrl: "/videos/slippers-gemoy.mp4",
      videoPosterUrl: "/videos/slippers-gemoy-poster.jpg",
    });
    expect(product.images).toHaveLength(6);
    expect(product.translations.map((t) => t.locale).sort()).toEqual(["en", "id"]);

    const stock = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(stock).toMatchObject({ quantity: 7, productId: product.id });

    expect(await prisma.order.count({ where: { productId: null } })).toBe(0);
    expect(await prisma.stockChange.count({ where: { productId: null } })).toBe(0);
    expect(await prisma.review.count({ where: { productId: null } })).toBe(0);
    expect(await prisma.order.count({ where: { productId: product.id } })).toBe(2);

    // The store-wide setting is copied, never written.
    expect(
      await prisma.setting.findUniqueOrThrow({ where: { key: SOLD_COUNT_BASELINE_KEY } }),
    ).toEqual(settingBefore);

    expect(summary).toEqual({
      category: { created: 1 },
      product: { created: 1, skipped: 0 },
      imageSize: { corrected: 0 },
      stockLink: { created: 0, linked: 1 },
      backfill: { orders: 2, stockChanges: 1, reviews: 2 },
      baselineCopied: 1,
    });
  });

  it("(b) a second run writes nothing", async () => {
    await seedPreCatalogueStore();
    await runImport();
    const before = await snapshot();

    const summary = await runImport();

    expect(summary).toEqual({
      category: { created: 0 },
      product: { created: 0, skipped: 1 },
      imageSize: { corrected: 0 },
      stockLink: { created: 0, linked: 0 },
      backfill: { orders: 0, stockChanges: 0, reviews: 0 },
      baselineCopied: 0,
    });
    expect(await snapshot()).toEqual(before);
  });

  it("(c) preserves the owner's edits to an existing product", async () => {
    await seedPreCatalogueStore();
    await runImport();
    await prisma.product.update({
      where: { slug: "slippers-gemoy" },
      data: { priceIDR: 159000, soldCountBaseline: 55 },
    });
    await prisma.productTranslation.updateMany({
      where: { locale: "id" },
      data: { name: "Sandal Gemoy Baru" },
    });

    await runImport();

    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: "slippers-gemoy" },
      include: { translations: { where: { locale: "id" } } },
    });
    expect(product.priceIDR).toBe(159000);
    expect(product.soldCountBaseline).toBe(55);
    expect(product.translations[0].name).toBe("Sandal Gemoy Baru");
  });

  it("(c2) corrects stale image sizes on an existing product, and nothing else", async () => {
    await seedPreCatalogueStore();
    await runImport();
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
    // The sizes the import wrote while they were declared per orientation.
    await prisma.productImage.updateMany({
      where: { productId: product.id, url: "/images/product/banner-hadiah-landscape.png" },
      data: { width: 1740, height: 904 },
    });
    await prisma.productImage.updateMany({
      where: { productId: product.id, url: "/images/product/banner-collage-portrait.png" },
      data: { width: 1086, height: 1448, altId: "Diubah pemilik" },
    });

    const summary = await runImport();

    expect(summary.imageSize).toEqual({ corrected: 2 });
    const images = await prisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { position: "asc" },
    });
    expect(images.map(({ url, width, height }) => ({ url, width, height }))).toEqual(
      buildImportSource().products[0].images.map(({ url, width, height }) => ({
        url,
        width,
        height,
      })),
    );
    expect(images.find((image) => image.url.includes("hadiah"))).toMatchObject({
      width: 1742,
      height: 903,
    });
    // Only the size is corrected; the owner's other edits stay.
    expect(images.find((image) => image.url.includes("collage"))).toMatchObject({
      width: 1024,
      height: 1536,
      altId: "Diubah pemilik",
    });
    expect((await runImport()).imageSize).toEqual({ corrected: 0 });
  });

  it("(d) attributes a row created after the first run, and nothing else", async () => {
    await seedPreCatalogueStore();
    await runImport();
    // A pre-catalogue release taking an order during a rollback window (R-202).
    await prisma.order.create({ data: testOrderData({ orderNumber: "TKS-IMPORT-00003" }) });

    const summary = await runImport();

    expect(summary.backfill).toEqual({ orders: 1, stockChanges: 0, reviews: 0 });
    expect(await prisma.order.count({ where: { productId: null } })).toBe(0);
  });

  it("(e) aborts without writing when the default stock row belongs to another product", async () => {
    await seedPreCatalogueStore();
    const other = await seedProduct({ slug: "other-sandal", status: "DRAFT", priceIDR: null });
    await prisma.stockLevel.update({ where: { id: "default" }, data: { productId: other.id } });
    const before = await snapshot();

    await expect(runImport()).rejects.toBeInstanceOf(CatalogueImportConflictError);

    expect(await snapshot()).toEqual(before);
  });

  it("(f) creates and links the default stock row when it is missing", async () => {
    const summary = await runImport();

    const product = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
    const stock = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(stock).toMatchObject({ quantity: 0, productId: product.id });
    expect(summary.stockLink).toEqual({ created: 1, linked: 0 });
    expect(product.soldCountBaseline).toBe(0);
  });
});
