import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedCatalogue, seedStockLevel } from "./helpers/db";

const { mockPaymentProvider } = vi.hoisted(() => ({
  mockPaymentProvider: {
    createCheckoutSession: vi.fn(),
    verifyNotificationSignature: vi.fn(),
    fetchTransactionStatus: vi.fn(),
  },
}));

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

const JAKARTA_INPUT = {
  quantity: 2,
  name: "Sari Wulandari",
  phone: "081234567890",
  provinceCode: "31",
  cityCode: "3171",
  district: "Menteng",
  postalCode: "10310",
  streetAddress: "Jl. Merdeka No. 1",
  paymentMethod: "ONLINE" as const,
};

describe("submitCheckout (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    mockPaymentProvider.createCheckoutSession.mockReset().mockResolvedValue({
      token: "mock-snap-token",
      redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/mock",
    });
  });

  afterEach(async () => {
    await resetDb();
  });

  it("happy path creates an order with a correct snapshot", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");
    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.orderNumber).toMatch(/^TKS-\d{6}-[0-9A-Z]{5}$/);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paymentMethod).toBe("ONLINE");
    expect(order.quantity).toBe(2);
    expect(order.unitPriceIDR).toBe(169999);
    expect(order.totalIDR).toBe(
      order.unitPriceIDR * order.quantity + order.shippingCostIDR + order.codFeeIDR,
    );
    expect(order.stockDecremented).toBe(false); // ONLINE orders decrement on ->PAID, not at creation
    expect(order.expiresAt).not.toBeNull();

    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0].fromStatus).toBeNull();
    expect(events[0].toStatus).toBe("PENDING_PAYMENT");
    expect(events[0].actor).toBe("CUSTOMER");

    expect(mockPaymentProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("refuses a quantity above available stock, stating the available quantity", async () => {
    await resetDb();
    await seedStockLevel(1);
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, quantity: 5 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");
    expect(result.available).toBe(1);

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(0);
  });

  it("treats a missing StockLevel row as out of stock instead of throwing", async () => {
    await resetDb(); // no seedStockLevel — the "default" row does not exist
    // 003: the catalogue must exist; the stock row is then removed to keep this test's scenario
    await seedCatalogue();
    await prisma.stockLevel.deleteMany();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");
    expect(result.available).toBe(0);
    expect(consoleError).toHaveBeenCalled();

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(0);
    consoleError.mockRestore();
  });

  it("cancels the order and reports a keyed error when Midtrans refuses the session", async () => {
    // A 401 "Unknown Merchant server_key/id" is the shape this takes when the
    // configured keys are wrong — the vendor error must not reach the shopper,
    // and the unpayable order must not be left behind.
    mockPaymentProvider.createCheckoutSession.mockRejectedValue(
      new Error('Midtrans API is returning API error. HTTP status code: 401.'),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout(JAKARTA_INPUT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.paymentProviderUnavailable");
    expect(consoleError).toHaveBeenCalled();

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe("CANCELLED");
    expect(orders[0].midtransOrderId).toBeNull();

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(10); // never decremented
    consoleError.mockRestore();
  });

  it("refuses COD in a COD-disabled province", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({
      ...JAKARTA_INPUT,
      provinceCode: "94",
      cityCode: "9401",
      paymentMethod: "COD",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.codUnavailable");

    const orders = await prisma.order.findMany();
    expect(orders).toHaveLength(0);
  });

  it("ignores a client-supplied amount — the server-computed total wins", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({
      ...JAKARTA_INPUT,
      totalIDR: 1,
      unitPriceIDR: 1,
      total: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
    });
    expect(order.unitPriceIDR).toBe(169999);
    expect(order.totalIDR).toBeGreaterThan(1);
    expect(order.totalIDR).toBe(
      order.unitPriceIDR * order.quantity + order.shippingCostIDR + order.codFeeIDR,
    );
  });
});
