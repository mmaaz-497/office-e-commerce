import { readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import { editInputFor, productSnapshot, saveProduct, signIn } from "./helpers/admin-product-input";
import { png } from "../helpers/image-bytes";

const { cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieStore: {
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
      clear: () => store.clear(),
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

// revalidatePath needs a Next request context that a test does not have.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

/**
 * Phase 2c spec US3, contracts/admin-publishing.md saveProduct: the gate is
 * open (R-401), a sample stays COMING_SOON (R-402), the client cannot write
 * isSample (R-403), publishedAt is set on the first ACTIVE save (R-405) and
 * ACTIVE needs a stock row (R-406).
 */
describe("saveProduct — publishing (integration)", () => {
  const UPLOAD_DIR = process.env.UPLOAD_DIR!;
  const UPLOAD_NAME = "abcdef0123456789.png";
  const UPLOAD_URL = `/uploads/${UPLOAD_NAME}`;

  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    for (const entry of readdirSync(UPLOAD_DIR)) {
      rmSync(path.join(UPLOAD_DIR, entry), { recursive: true, force: true });
    }
    writeFileSync(path.join(UPLOAD_DIR, UPLOAD_NAME), png(1200, 1200));
    await seedStockLevel(10);
    await signIn();
  });

  afterEach(async () => {
    await resetDb();
  });

  async function makeSample(slug: string) {
    const product = await seedProduct({ slug, status: "COMING_SOON", priceIDR: null });
    await prisma.product.update({ where: { id: product.id }, data: { isSample: true } });
    return product;
  }

  it("(a) publishes a DRAFT with a stock row, sets publishedAt once, then locks the slug", async () => {
    await seedProduct({ slug: "draf-terbit", status: "DRAFT", priceIDR: 150000, stock: 3 });
    const first = await editInputFor("draf-terbit");
    first.product.status = "ACTIVE";

    const published = await saveProduct(first);
    expect(published).toMatchObject({ ok: true });
    const afterFirst = await productSnapshot("draf-terbit");
    expect(afterFirst.status).toBe("ACTIVE");
    expect(afterFirst.publishedAt).not.toBeNull();

    const second = await editInputFor("draf-terbit");
    second.product.translations.en.shortDescription = "An edited description, still active.";
    expect(await saveProduct(second)).toMatchObject({ ok: true });
    const afterSecond = await productSnapshot("draf-terbit");
    expect(afterSecond.publishedAt).toEqual(afterFirst.publishedAt);

    const renamed = await editInputFor("draf-terbit");
    renamed.product.slug = "draf-terbit-baru";
    const locked = await saveProduct(renamed);
    expect(locked).toMatchObject({ ok: false, fieldErrors: { slug: [{ key: "slugLocked" }] } });
    expect(await productSnapshot("draf-terbit")).toEqual(afterSecond);
  });

  it("(b) creates a product directly as ACTIVE and sets publishedAt", async () => {
    const base = await editInputFor("slippers-gemoy");
    const result = await saveProduct({
      categoryId: base.categoryId,
      position: 5,
      product: {
        ...base.product,
        slug: "langsung-aktif",
        sku: null,
        status: "ACTIVE",
        priceIDR: 99000,
        compareAtPriceIDR: null,
        images: [
          {
            url: UPLOAD_URL,
            width: 1200,
            height: 1200,
            orientation: "square",
            altId: "Sandal tampak atas",
            altEn: "Slippers seen from above",
          },
        ],
        video: null,
        translations: {
          id: { ...base.product.translations.id, videoAlt: null },
          en: { ...base.product.translations.en, videoAlt: null },
        },
      },
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const created = await prisma.product.findUniqueOrThrow({
      where: { id: result.productId },
      include: { stockLevel: true },
    });
    expect(created.status).toBe("ACTIVE");
    expect(created.isSample).toBe(false);
    expect(created.publishedAt).not.toBeNull();
    expect(created.stockLevel).toMatchObject({ id: created.id, quantity: 0 });
  });

  it.each(["ACTIVE", "DRAFT"] as const)(
    "(c) refuses status %s on a sample with sampleStatusLocked and changes nothing",
    async (status) => {
      await makeSample("sampel-uji");
      const before = await productSnapshot("sampel-uji");
      const input = await editInputFor("sampel-uji");
      input.product.status = status;
      input.product.priceIDR = 120000;

      const result = await saveProduct(input);
      expect(result).toMatchObject({ ok: false, errorKey: "errors.sampleStatusLocked" });
      if (result.ok) return;
      expect(result.fieldErrors?.status?.[0]?.key).toBe("sampleStatusLocked");
      expect(await productSnapshot("sampel-uji")).toEqual(before);
    },
  );

  it("(c) saves a sample's edited text as COMING_SOON and keeps it a sample", async () => {
    await makeSample("sampel-uji");
    const input = await editInputFor("sampel-uji");
    input.product.translations.id.name = "Sampel uji yang diubah";

    expect(await saveProduct(input)).toMatchObject({ ok: true });
    const after = await productSnapshot("sampel-uji");
    expect(after.isSample).toBe(true);
    expect(after.status).toBe("COMING_SOON");
    expect(after.translations.find((t) => t.locale === "id")!.name).toBe("Sampel uji yang diubah");
  });

  it("(d) refuses ACTIVE for a product with no stock row (stockRequired)", async () => {
    await seedProduct({ slug: "tanpa-stok", status: "DRAFT", priceIDR: 150000 });
    const before = await productSnapshot("tanpa-stok");
    const input = await editInputFor("tanpa-stok");
    input.product.status = "ACTIVE";

    const result = await saveProduct(input);
    expect(result).toMatchObject({ ok: false, errorKey: "errors.validation" });
    if (result.ok) return;
    expect(result.fieldErrors?.status?.[0]?.key).toBe("stockRequired");
    expect(await productSnapshot("tanpa-stok")).toEqual(before);
  });

  it("(e) accepts COMING_SOON with a stored price and keeps the price", async () => {
    await seedProduct({ slug: "segera-berharga", status: "DRAFT", priceIDR: 120000 });
    const input = await editInputFor("segera-berharga");
    input.product.status = "COMING_SOON";

    expect(await saveProduct(input)).toMatchObject({ ok: true });
    const after = await productSnapshot("segera-berharga");
    expect(after.status).toBe("COMING_SOON");
    expect(after.priceIDR).toBe(120000);
    expect(after.publishedAt).toBeNull();
  });

  it("(f) never changes the stored isSample flag from the request", async () => {
    await makeSample("sampel-uji");
    await seedProduct({ slug: "produk-asli", status: "DRAFT", priceIDR: null });

    const sample = await editInputFor("sampel-uji");
    expect(
      await saveProduct({
        ...sample,
        isSample: false,
        product: { ...sample.product, isSample: false },
      }),
    ).toMatchObject({ ok: true });
    expect((await productSnapshot("sampel-uji")).isSample).toBe(true);

    const real = await editInputFor("produk-asli");
    expect(
      await saveProduct({ ...real, isSample: true, product: { ...real.product, isSample: true } }),
    ).toMatchObject({ ok: true });
    expect((await productSnapshot("produk-asli")).isSample).toBe(false);
  });

  it("(g) with no session returns errors.unauthorized and changes nothing", async () => {
    await seedProduct({ slug: "draf-terbit", status: "DRAFT", priceIDR: 150000, stock: 3 });
    const before = await productSnapshot("draf-terbit");
    const input = await editInputFor("draf-terbit");
    input.product.status = "ACTIVE";
    cookieStore.clear();

    expect(await saveProduct(input)).toEqual({ ok: false, errorKey: "errors.unauthorized" });
    expect(await productSnapshot("draf-terbit")).toEqual(before);
  });
});
