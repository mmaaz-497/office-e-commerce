import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  getFeaturedProductOrNull,
  listIndexableProducts,
  listListedProducts,
} from "@/infrastructure/db/catalogue";
import { run } from "../../prisma/seed.samples";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";

/**
 * T038 (005 US1, R-412, contracts/operator-commands.md): `seed:samples`
 * through its exported run(). Dry-run writes nothing; apply creates exactly
 * the 10 samples and leaves the existing product untouched; a second apply is
 * a no-op that keeps owner edits; every refusal and failure writes nothing.
 */
const EXISTING = "slippers-gemoy";
const SLUGS = SAMPLE_DEFINITIONS.map((d) => d.slug);

let output: string[];

async function counts() {
  const [products, translations, images, stock] = await Promise.all([
    prisma.product.count(),
    prisma.productTranslation.count(),
    prisma.productImage.count(),
    prisma.stockLevel.count(),
  ]);
  return { products, translations, images, stock };
}

async function existingRow() {
  return prisma.product.findUniqueOrThrow({ where: { slug: EXISTING } });
}

async function sampleRows() {
  return prisma.product.findMany({
    where: { isSample: true },
    include: { translations: { orderBy: { locale: "asc" } }, images: true, stockLevel: true },
    orderBy: { position: "asc" },
  });
}

describe("seed:samples (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
    output = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
  });

  it("(a) dry-run writes nothing and reports would create 10", async () => {
    const before = await counts();

    expect(await run([])).toBe(0);

    expect(await counts()).toEqual(before);
    expect(output.join("\n")).toContain("would create 10");
    expect(output.join("\n")).toContain("dry-run");
  });

  it("(b) apply creates the 10 samples and leaves the existing product untouched", async () => {
    const existingBefore = await existingRow();

    expect(await run(["--apply"])).toBe(0);
    expect(output.join("\n")).toContain("created 10");

    const samples = await sampleRows();
    expect(samples.map((s) => s.slug)).toEqual(SLUGS);
    for (const [index, sample] of samples.entries()) {
      const definition = SAMPLE_DEFINITIONS[index];
      expect(sample.status).toBe("COMING_SOON");
      expect(sample.isSample).toBe(true);
      expect(sample.priceIDR).toBeNull();
      expect(sample.stockLevel).toBeNull();
      expect(sample.publishedAt).toBeNull();
      expect(sample.categoryId).toBe(existingBefore.categoryId);
      expect(sample.position).toBeGreaterThan(existingBefore.position);
      expect(sample.translations.map((t) => [t.locale, t.name])).toEqual([
        ["en", definition.en.name],
        ["id", definition.id.name],
      ]);
      expect(sample.images).toHaveLength(1);
      expect(sample.images[0]).toMatchObject({
        url: definition.image,
        width: 1200,
        height: 1200,
        orientation: "square",
        altId: `Gambar sementara – ${definition.id.name}`,
        altEn: `Placeholder image – ${definition.en.name}`,
      });
    }
    expect(await prisma.stockChange.count()).toBe(0);
    expect(await existingRow()).toEqual(existingBefore);
  });

  it("(c) a second apply does nothing and leaves identical rows", async () => {
    expect(await run(["--apply"])).toBe(0);
    const first = await sampleRows();
    output = [];

    expect(await run(["--apply"])).toBe(0);

    expect(output.join("\n")).toContain("nothing to do");
    expect(await sampleRows()).toEqual(first);
  });

  it("(d) an owner edit to a sample's name survives a re-run", async () => {
    expect(await run(["--apply"])).toBe(0);
    const sample = await prisma.product.findUniqueOrThrow({ where: { slug: SLUGS[2] } });
    await prisma.productTranslation.update({
      where: { productId_locale: { productId: sample.id, locale: "id" } },
      data: { name: "Nama dari pemilik" },
    });

    expect(await run(["--apply"])).toBe(0);

    const translation = await prisma.productTranslation.findUniqueOrThrow({
      where: { productId_locale: { productId: sample.id, locale: "id" } },
    });
    expect(translation.name).toBe("Nama dari pemilik");
  });

  it("(e) refuses with exit 2 when a real product holds a sample slug", async () => {
    await seedProduct({ slug: SLUGS[5], status: "DRAFT", priceIDR: null });
    const before = await counts();

    expect(await run(["--apply"])).toBe(2);
    expect(await run([])).toBe(2);

    expect(await counts()).toEqual(before);
    expect(output.join("\n")).toContain(`slug ${SLUGS[5]} belongs to a real product`);
  });

  it("(f) refuses with exit 2 with no ACTIVE real product, or with two", async () => {
    await prisma.product.update({ where: { slug: EXISTING }, data: { status: "DRAFT" } });
    expect(await run(["--apply"])).toBe(2);
    expect(await prisma.product.count({ where: { isSample: true } })).toBe(0);

    await prisma.product.update({ where: { slug: EXISTING }, data: { status: "ACTIVE" } });
    await seedProduct({ slug: "aktif-kedua", status: "ACTIVE", priceIDR: 99000, stock: 2 });
    expect(await run(["--apply"])).toBe(2);
    expect(await prisma.product.count({ where: { isSample: true } })).toBe(0);
    expect(output.join("\n")).toContain("found 2");
  });

  it("(g) a failed post-check rolls everything back with exit 1", async () => {
    const existing = await existingRow();

    const code = await run(["--apply"], {
      beforePostCheck: (tx) =>
        tx.product.update({
          where: { id: existing.id },
          data: { updatedAt: new Date(Date.now() + 1000) },
        }),
    });

    expect(code).toBe(1);
    expect(await prisma.product.count({ where: { isSample: true } })).toBe(0);
    expect((await existingRow()).updatedAt).toEqual(existing.updatedAt);
  });

  it("rejects any argument other than --apply with exit 1", async () => {
    const before = await counts();
    expect(await run(["--force"])).toBe(1);
    expect(await run(["--apply", "--apply"])).toBe(1);
    expect(await counts()).toEqual(before);
  });

  it("(h) after apply the storefront lists 11, indexes 1 and features the existing product", async () => {
    expect(await run(["--apply"])).toBe(0);

    for (const locale of ["id", "en"] as const) {
      const listed = await listListedProducts(locale);
      expect(listed).toHaveLength(11);
      expect(listed[0].slug).toBe(EXISTING);
      expect((await getFeaturedProductOrNull(locale))?.slug).toBe(EXISTING);
    }
    expect(await listIndexableProducts()).toHaveLength(1);
  });
});
