import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";

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

const NOTE = "stock count 4 Oct";

/** T040: the inline per-product stock editor (spec US3; research R-313). */
describe("setProductStock (integration)", () => {
  let importedId: string;
  let secondId: string;

  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(12);
    importedId = (await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } }))
      .id;
    secondId = (await seedProduct({ slug: "kedua", status: "DRAFT", priceIDR: null, stock: 5 }))
      .id;
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  async function setProductStock(input: unknown) {
    const { setProductStock } = await import("@/app/actions/admin/stock");
    return setProductStock(input);
  }

  it("sets the imported product 12 → 20 with one +8 MANUAL_ADJUSTMENT row", async () => {
    const result = await setProductStock({
      productId: importedId,
      expectedQuantity: 12,
      targetQuantity: 20,
      note: NOTE,
    });
    expect(result).toEqual({ ok: true, quantity: 20 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(20);

    const changes = await prisma.stockChange.findMany();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      delta: 8,
      resultingQuantity: 20,
      reason: "MANUAL_ADJUSTMENT",
      note: NOTE,
      productId: importedId,
      orderId: null,
    });
  });

  it("sets the second product 5 → 0 with a −5 row on its own stock level", async () => {
    const result = await setProductStock({
      productId: secondId,
      expectedQuantity: 5,
      targetQuantity: 0,
      note: NOTE,
    });
    expect(result).toEqual({ ok: true, quantity: 0 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: secondId } });
    expect(level.quantity).toBe(0);
    const changes = await prisma.stockChange.findMany({ where: { productId: secondId } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(-5);
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      12,
    );
  });

  it("a target equal to the expected value is ok and writes no ledger row", async () => {
    const result = await setProductStock({
      productId: importedId,
      expectedQuantity: 12,
      targetQuantity: 12,
      note: NOTE,
    });
    expect(result).toEqual({ ok: true, quantity: 12 });
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it("refuses a stale expectedQuantity with errors.stockChanged and the current value", async () => {
    const result = await setProductStock({
      productId: importedId,
      expectedQuantity: 10,
      targetQuantity: 20,
      note: NOTE,
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.stockChanged", currentQuantity: 12 });

    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      12,
    );
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it.each([
    ["an empty note", { note: "" }],
    ["a whitespace note", { note: "   " }],
    ["target −1", { targetQuantity: -1 }],
    ["target 1.5", { targetQuantity: 1.5 }],
    ["target 1 000 001", { targetQuantity: 1_000_001 }],
  ])("refuses %s with errors.validation and writes nothing", async (_label, override) => {
    const result = await setProductStock({
      productId: importedId,
      expectedQuantity: 12,
      targetQuantity: 20,
      note: NOTE,
      ...override,
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.validation" });
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      12,
    );
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it("refuses an unknown product with errors.validation", async () => {
    const result = await setProductStock({
      productId: "no-such-product",
      expectedQuantity: 0,
      targetQuantity: 3,
      note: NOTE,
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.validation" });
    expect(await prisma.stockLevel.findUnique({ where: { id: "no-such-product" } })).toBeNull();
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it("opens a stock row with id = productId for a product without one, then adjusts it", async () => {
    const bare = await seedProduct({ slug: "tanpa-stok", status: "DRAFT", priceIDR: null });

    const result = await setProductStock({
      productId: bare.id,
      expectedQuantity: 0,
      targetQuantity: 7,
      note: NOTE,
    });
    expect(result).toEqual({ ok: true, quantity: 7 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: bare.id } });
    expect(level).toMatchObject({ productId: bare.id, quantity: 7 });
    const changes = await prisma.stockChange.findMany({ where: { productId: bare.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ delta: 7, resultingQuantity: 7 });
  });

  it("with no session returns errors.unauthorized and writes nothing", async () => {
    cookieStore.clear();
    const result = await setProductStock({
      productId: importedId,
      expectedQuantity: 12,
      targetQuantity: 20,
      note: NOTE,
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.unauthorized" });
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      12,
    );
    expect(await prisma.stockChange.count()).toBe(0);
  });
});

/** Phase 2c T010: a COMING_SOON product gets stock through the same path; a sample never does. */
describe("setProductStock — Coming Soon and samples (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(12);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  async function setProductStock(input: unknown) {
    const { setProductStock } = await import("@/app/actions/admin/stock");
    return setProductStock(input);
  }

  it("opens a COMING_SOON product's own stock row with one MANUAL_ADJUSTMENT (R-406)", async () => {
    const product = await seedProduct({
      slug: "segera-stok",
      status: "COMING_SOON",
      priceIDR: null,
    });

    const result = await setProductStock({
      productId: product.id,
      expectedQuantity: 0,
      targetQuantity: 5,
      note: NOTE,
    });
    expect(result).toEqual({ ok: true, quantity: 5 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: product.id } });
    expect(level).toMatchObject({ productId: product.id, quantity: 5 });
    const changes = await prisma.stockChange.findMany({ where: { productId: product.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      reason: "MANUAL_ADJUSTMENT",
      delta: 5,
      resultingQuantity: 5,
      note: NOTE,
      orderId: null,
    });
  });

  it("refuses a sample with errors.sampleStockLocked and writes no row (FR-017a)", async () => {
    const sample = await seedProduct({
      slug: "sampel-stok",
      status: "COMING_SOON",
      priceIDR: null,
    });
    await prisma.product.update({ where: { id: sample.id }, data: { isSample: true } });

    const result = await setProductStock({
      productId: sample.id,
      expectedQuantity: 0,
      targetQuantity: 5,
      note: NOTE,
    });
    expect(result).toEqual({ ok: false, errorKey: "errors.sampleStockLocked" });
    expect(await prisma.stockLevel.findUnique({ where: { productId: sample.id } })).toBeNull();
    expect(await prisma.stockChange.count({ where: { productId: sample.id } })).toBe(0);
  });
});
