import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { quoteOrder } from "@/domain/pricing/quote";
import { shippingProvider } from "@/infrastructure/shipping/provider";
import { resetDb, seedCatalogue, seedProduct, seedStockLevel } from "./helpers/db";
import { makeMockPaymentProvider } from "./helpers/mock-payment-provider";

/**
 * T032 — every purchase is tied to a specific product (003 US2, FR-014–FR-018,
 * contracts/checkout.md): the server resolves the product, charges its price,
 * checks its stock, and refuses anything not on sale before an order or a
 * Snap session exists.
 */
const { mockPaymentProvider } = vi.hoisted(() => ({
  mockPaymentProvider: {} as ReturnType<typeof makeMockPaymentProvider>,
}));

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

const JAKARTA_INPUT = {
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

const B_SLUG = "sandal-b";

async function stockOf(productId: string): Promise<number | undefined> {
  const level = await prisma.stockLevel.findUnique({ where: { productId } });
  return level?.quantity;
}

async function legacyProductId(): Promise<string> {
  const product = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
  return product.id;
}

describe("submitCheckout per product (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    Object.assign(mockPaymentProvider, makeMockPaymentProvider());
  });

  afterEach(async () => {
    await resetDb();
  });

  it("(a) charges product B's own price and records B on the order", async () => {
    await seedStockLevel(5);
    const b = await seedProduct({ slug: B_SLUG, status: "ACTIVE", priceIDR: 99000, stock: 3 });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: B_SLUG, quantity: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.productId).toBe(b.id);
    expect(order.productNameSnapshot).toBe(`Produk ${B_SLUG}`);
    expect(order.unitPriceIDR).toBe(99000);

    const expected = quoteOrder({
      unitPrice: 99000,
      quantity: 2,
      provinceCode: JAKARTA_INPUT.provinceCode,
      paymentMethod: "ONLINE",
      shipping: shippingProvider,
    });
    expect(order.totalIDR).toBe(expected.total);

    expect(mockPaymentProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
    const [session] = mockPaymentProvider.createCheckoutSession.mock.calls[0];
    expect(session.grossAmount).toBe(order.totalIDR);

    // Stock is checked, not taken: ONLINE orders decrement on ->PAID.
    expect(await stockOf(b.id)).toBe(3);
    expect(await stockOf(await legacyProductId())).toBe(5);
  });

  it("(b) checks B's stock, not the legacy product's", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: B_SLUG, status: "ACTIVE", priceIDR: 99000, stock: 0 });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: B_SLUG, quantity: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");
    expect(result.available).toBe(0);
    expect(await prisma.order.count()).toBe(0);
  });

  it.each([
    ["a COMING_SOON product", "segera-hadir", "COMING_SOON" as const],
    ["a DRAFT product", "draf-produk", "DRAFT" as const],
    ["an unknown slug", "tidak-ada", null],
  ])("(c) refuses %s with no order and no payment session", async (_label, slug, status) => {
    await seedStockLevel(5);
    if (status) await seedProduct({ slug, status, priceIDR: null, stock: 5 });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: slug });

    expect(result).toEqual({ ok: false, errorKey: "errors.productUnavailable" });
    expect(await prisma.order.count()).toBe(0);
    expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("(d) with no productSlug and only the legacy product ACTIVE, orders the legacy product", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "segera-hadir", status: "COMING_SOON", priceIDR: null });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.productId).toBe(await legacyProductId());
    expect(order.productNameSnapshot).toBe("Sandal Gemoy");
    expect(order.unitPriceIDR).toBe(169999);
  });

  it("(e) with no productSlug and two ACTIVE products, refuses", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: B_SLUG, status: "ACTIVE", priceIDR: 99000, stock: 3 });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result).toEqual({ ok: false, errorKey: "errors.productUnavailable" });
    expect(await prisma.order.count()).toBe(0);
    expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("(g) with no productSlug on an empty catalogue, refuses", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result).toEqual({ ok: false, errorKey: "errors.productUnavailable" });
    expect(await prisma.order.count()).toBe(0);
    expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("(f) leaves the Midtrans session argument's shape unchanged (FR-018)", async () => {
    await seedCatalogue();
    await prisma.stockLevel.update({ where: { id: "default" }, data: { quantity: 5 } });
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: "slippers-gemoy" });

    expect(result.ok).toBe(true);
    const [session] = mockPaymentProvider.createCheckoutSession.mock.calls[0];
    expect(Object.keys(session).sort()).toEqual(
      ["customer", "expiryHours", "grossAmount", "providerOrderId"].sort(),
    );
  });
});
