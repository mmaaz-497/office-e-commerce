import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import { makeMockPaymentProvider } from "./helpers/mock-payment-provider";
import { editInputFor, saveProduct, signIn } from "./helpers/admin-product-input";

/**
 * Size selection end to end on the server: a product offering sizes cannot be
 * ordered without one of them, the chosen size is frozen on the order, and
 * the phone-checked lookup and the admin order detail read it back. Stock
 * stays per product, so a size never changes price or availability.
 */
const { mockPaymentProvider, cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockPaymentProvider: {} as ReturnType<typeof makeMockPaymentProvider>,
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

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const INPUT = {
  quantity: 1,
  name: "Sari Wulandari",
  phone: "081234567890",
  provinceCode: "31",
  cityCode: "3171",
  district: "Menteng",
  postalCode: "10310",
  streetAddress: "Jl. Merdeka No. 1",
  paymentMethod: "ONLINE" as const,
};

const SIZED = "sandal-berukuran";
const PLAIN = "sandal-polos";
const SIZES = ["36", "38", "40", "42"];

async function checkout(input: Record<string, unknown>) {
  const { submitCheckout } = await import("@/app/actions/checkout");
  return submitCheckout({ ...INPUT, ...input });
}

describe("checkout with sizes (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    Object.assign(mockPaymentProvider, makeMockPaymentProvider());
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("records the chosen size on an online order", async () => {
    await seedProduct({ slug: SIZED, status: "ACTIVE", priceIDR: 99000, stock: 3, sizes: SIZES });

    const result = await checkout({ productSlug: SIZED, size: "40" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.size).toBe("40");
  });

  it("records the chosen size on a COD order", async () => {
    await seedProduct({ slug: SIZED, status: "ACTIVE", priceIDR: 99000, stock: 3, sizes: SIZES });

    const result = await checkout({ productSlug: SIZED, size: "36", paymentMethod: "COD" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.size).toBe("36");
  });

  it("refuses an order without a size before any order or payment session exists", async () => {
    await seedProduct({ slug: SIZED, status: "ACTIVE", priceIDR: 99000, stock: 3, sizes: SIZES });

    const result = await checkout({ productSlug: SIZED });

    expect(result).toEqual({ ok: false, errorKey: "errors.sizeRequired" });
    expect(await prisma.order.count()).toBe(0);
    expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses a size the product does not offer", async () => {
    await seedProduct({ slug: SIZED, status: "ACTIVE", priceIDR: 99000, stock: 3, sizes: SIZES });

    const result = await checkout({ productSlug: SIZED, size: "39" });

    expect(result).toEqual({ ok: false, errorKey: "errors.sizeUnavailable" });
    expect(await prisma.order.count()).toBe(0);
  });

  it("orders a product without sizes with no size, and refuses one sent anyway", async () => {
    await seedProduct({ slug: PLAIN, status: "ACTIVE", priceIDR: 99000, stock: 3 });

    const plain = await checkout({ productSlug: PLAIN });
    expect(plain.ok).toBe(true);
    if (!plain.ok) return;
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: plain.orderNumber },
    });
    expect(order.size).toBeNull();

    const withSize = await checkout({ productSlug: PLAIN, size: "38" });
    expect(withSize).toEqual({ ok: false, errorKey: "errors.sizeUnavailable" });
  });

  it("keeps the ordered size after the product's size list changes", async () => {
    const product = await seedProduct({
      slug: SIZED,
      status: "ACTIVE",
      priceIDR: 99000,
      stock: 3,
      sizes: SIZES,
    });
    const result = await checkout({ productSlug: SIZED, size: "42" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await prisma.product.update({ where: { id: product.id }, data: { sizes: ["36"] } });

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.size).toBe("42");
  });

  it("shows the size in the phone-checked lookup and the admin order detail", async () => {
    await seedProduct({ slug: SIZED, status: "ACTIVE", priceIDR: 99000, stock: 3, sizes: SIZES });
    const result = await checkout({ productSlug: SIZED, size: "38", paymentMethod: "COD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { lookupOrder } = await import("@/app/actions/lookup");
    const lookup = await lookupOrder({ orderNumber: result.orderNumber, phone: INPUT.phone });
    expect(lookup.ok).toBe(true);
    if (!lookup.ok) return;
    expect(lookup.order.size).toBe("38");

    await signIn();
    const { getOrderDetailData } = await import("@/infrastructure/db/admin-orders");
    const detail = await getOrderDetailData(result.orderNumber);
    expect(detail?.order.size).toBe("38");

    const { getOrderList } = await import("@/infrastructure/db/admin-orders");
    const list = await getOrderList({});
    expect(list.find((row) => row.orderNumber === result.orderNumber)?.size).toBe("38");
  });
});

describe("saveProduct sizes (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedStockLevel(5);
    await signIn();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("stores the sizes the form sends, in order, and clears them when sent empty", async () => {
    await seedProduct({ slug: SIZED, status: "DRAFT", priceIDR: 99000 });
    const input = await editInputFor(SIZED);

    const saved = await saveProduct({ ...input, product: { ...input.product, sizes: SIZES } });
    expect(saved.ok).toBe(true);
    const stored = await prisma.product.findUniqueOrThrow({ where: { slug: SIZED } });
    expect(stored.sizes).toEqual(SIZES);

    const again = await editInputFor(SIZED);
    const cleared = await saveProduct({ ...again, product: { ...again.product, sizes: [] } });
    expect(cleared.ok).toBe(true);
    const after = await prisma.product.findUniqueOrThrow({ where: { slug: SIZED } });
    expect(after.sizes).toEqual([]);
  });

  it("keeps the stored sizes when a save omits the field", async () => {
    await seedProduct({ slug: SIZED, status: "DRAFT", priceIDR: 99000, sizes: SIZES });
    const input = await editInputFor(SIZED);
    const withoutSizes = { ...input.product };
    delete withoutSizes.sizes;

    const saved = await saveProduct({ ...input, product: withoutSizes });
    expect(saved.ok).toBe(true);
    const stored = await prisma.product.findUniqueOrThrow({ where: { slug: SIZED } });
    expect(stored.sizes).toEqual(SIZES);
  });

  it("refuses duplicate sizes with a field error and changes nothing", async () => {
    await seedProduct({ slug: SIZED, status: "DRAFT", priceIDR: 99000, sizes: SIZES });
    const input = await editInputFor(SIZED);

    const saved = await saveProduct({
      ...input,
      product: { ...input.product, sizes: ["38", "38"] },
    });
    expect(saved.ok).toBe(false);
    const stored = await prisma.product.findUniqueOrThrow({ where: { slug: SIZED } });
    expect(stored.sizes).toEqual(SIZES);
  });
});
