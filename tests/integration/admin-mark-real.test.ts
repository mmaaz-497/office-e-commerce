import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import { editInputFor, productSnapshot, saveProduct, signIn } from "./helpers/admin-product-input";

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

async function markProductReal(input: unknown) {
  const { markProductReal } = await import("@/app/actions/admin/products");
  return markProductReal(input);
}

/** Phase 2c spec US3, contracts/admin-publishing.md markProductReal (R-403). */
describe("markProductReal (integration)", () => {
  let sampleId: string;

  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedStockLevel(10);
    const sample = await seedProduct({ slug: "sampel-uji", status: "COMING_SOON", priceIDR: null });
    await prisma.product.update({ where: { id: sample.id }, data: { isSample: true } });
    sampleId = sample.id;
    await signIn();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("turns a sample into a real product and advances updatedAt", async () => {
    const before = await productSnapshot("sampel-uji");

    const result = await markProductReal({
      productId: sampleId,
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    const after = await productSnapshot("sampel-uji");
    expect(result).toEqual({ ok: true, updatedAt: after.updatedAt.toISOString() });
    expect(after.isSample).toBe(false);
    expect(after.status).toBe("COMING_SOON");
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("is idempotent: a second call returns ok and writes nothing", async () => {
    const before = await productSnapshot("sampel-uji");
    const first = await markProductReal({
      productId: sampleId,
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    expect(first.ok).toBe(true);
    const marked = await productSnapshot("sampel-uji");

    const second = await markProductReal({
      productId: sampleId,
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    expect(second).toEqual({ ok: true, updatedAt: marked.updatedAt.toISOString() });
    expect(await productSnapshot("sampel-uji")).toEqual(marked);
  });

  it("refuses a stale expectedUpdatedAt with errors.productChanged", async () => {
    const before = await productSnapshot("sampel-uji");
    const result = await markProductReal({
      productId: sampleId,
      expectedUpdatedAt: new Date(before.updatedAt.getTime() - 60_000).toISOString(),
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.productChanged" });
    expect(await productSnapshot("sampel-uji")).toEqual(before);
  });

  it("refuses an unknown product with errors.validation", async () => {
    const result = await markProductReal({
      productId: "cnosuchproduct000000000000",
      expectedUpdatedAt: new Date().toISOString(),
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.validation" });
  });

  it("with no session returns errors.unauthorized and changes nothing", async () => {
    const before = await productSnapshot("sampel-uji");
    cookieStore.clear();
    const result = await markProductReal({
      productId: sampleId,
      expectedUpdatedAt: before.updatedAt.toISOString(),
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.unauthorized" });
    expect(await productSnapshot("sampel-uji")).toEqual(before);
  });

  it("once real, the product can be published with a price and a stock row", async () => {
    const before = await productSnapshot("sampel-uji");
    expect(
      (
        await markProductReal({
          productId: sampleId,
          expectedUpdatedAt: before.updatedAt.toISOString(),
        })
      ).ok,
    ).toBe(true);
    await prisma.stockLevel.create({ data: { id: sampleId, productId: sampleId, quantity: 4 } });

    const input = await editInputFor("sampel-uji");
    input.product.status = "ACTIVE";
    input.product.priceIDR = 125000;
    expect(await saveProduct(input)).toMatchObject({ ok: true });

    const after = await productSnapshot("sampel-uji");
    expect(after.status).toBe("ACTIVE");
    expect(after.isSample).toBe(false);
    expect(after.publishedAt).not.toBeNull();
  });
});
