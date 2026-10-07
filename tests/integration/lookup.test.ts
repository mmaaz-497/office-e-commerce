import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

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

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-KPX${String(orderNumberCounter).padStart(2, "0")}`;
}

const RAW_PHONE = "081234567890";
const NORMALIZED_PHONE = "+6281234567890";

/** FR-038, FR-039, FR-040, FR-041, SC-009. */
describe("order lookup (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    mockPaymentProvider.fetchTransactionStatus.mockReset();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("correct order number + phone returns the order", async () => {
    const { lookupOrder } = await import("@/app/actions/lookup");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
        trackingNumber: "JNE999",
      }),
    });

    const result = await lookupOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.orderNumber).toBe(order.orderNumber);
    expect(result.order.status).toBe("SHIPPED");
    expect(result.order.trackingNumber).toBe("JNE999");
    expect(result.order.totalIDR).toBe(order.totalIDR);
  });

  it("a wrong phone and an unknown order number produce an identical generic failure with comparable timing", async () => {
    const { lookupOrder } = await import("@/app/actions/lookup");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const wrongPhoneStart = performance.now();
    const wrongPhoneResult = await lookupOrder({
      orderNumber: order.orderNumber,
      phone: "089999999999",
    });
    const wrongPhoneMs = performance.now() - wrongPhoneStart;

    const unknownOrderStart = performance.now();
    const unknownOrderResult = await lookupOrder({
      orderNumber: "TKS-260920-ZZZZZ",
      phone: RAW_PHONE,
    });
    const unknownOrderMs = performance.now() - unknownOrderStart;

    expect(wrongPhoneResult).toEqual(unknownOrderResult);
    expect(wrongPhoneResult.ok).toBe(false);
    if (wrongPhoneResult.ok) return;
    expect(wrongPhoneResult.errorKey).toBe("errors.orderLookupFailed");

    // Both go through the identical single-query code path (findFirst on the
    // combined predicate), so neither should be an order of magnitude slower
    // — a loose bound that catches a real branch-based short-circuit without
    // being flaky on ordinary scheduling jitter.
    const slower = Math.max(wrongPhoneMs, unknownOrderMs);
    const faster = Math.max(Math.min(wrongPhoneMs, unknownOrderMs), 1);
    expect(slower / faster).toBeLessThan(10);
  });

  it("a malformed order number produces the same generic failure, without touching the database", async () => {
    const { lookupOrder } = await import("@/app/actions/lookup");

    const result = await lookupOrder({ orderNumber: "not-a-real-format", phone: RAW_PHONE });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.orderLookupFailed");
  });

  it("phone formatting variants all match the same order", async () => {
    const { lookupOrder } = await import("@/app/actions/lookup");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    for (const variant of ["0812-3456-7890", "+62 812 3456 7890", "62 81234567890"]) {
      const result = await lookupOrder({ orderNumber: order.orderNumber, phone: variant });
      expect(result.ok).toBe(true);
    }
  });

  it("rate limiting engages after repeated attempts", async () => {
    const { lookupOrder } = await import("@/app/actions/lookup");

    for (let i = 0; i < 10; i++) {
      await lookupOrder({ orderNumber: "TKS-260920-ZZZZZ", phone: RAW_PHONE });
    }
    const limited = await lookupOrder({ orderNumber: "TKS-260920-ZZZZZ", phone: RAW_PHONE });

    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.errorKey).toBe("errors.rateLimited");
  });

  it("reading a PENDING_PAYMENT order past its deadline settles it via the lazy-expiry path (T078) instead of returning a stale status", async () => {
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_EXPIRED");
    const { lookupOrder } = await import("@/app/actions/lookup");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        stockDecremented: false,
      }),
    });

    const result = await lookupOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("EXPIRED");
    expect(mockPaymentProvider.fetchTransactionStatus).toHaveBeenCalledTimes(1);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("EXPIRED");
  });

  it("reading a paid-but-unnotified expired order rescues it rather than reporting it expired", async () => {
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_SUCCESS");
    const { lookupOrder } = await import("@/app/actions/lookup");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        stockDecremented: false,
      }),
    });

    const result = await lookupOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.status).toBe("PAID");
  });
});
