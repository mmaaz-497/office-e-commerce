import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

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

const ORDER_NUMBER = "TKS-260922-RECHK";

/**
 * ADR-0002 reconciliation point 2. The re-check button sits on the order
 * detail page, so whatever the provider does with the request ends up in the
 * operator's browser — which makes "the provider refused" a case this action
 * has to answer for, not one it can let escape.
 */
describe("admin payment re-check (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
    cookieStore.clear();
    mockPaymentProvider.fetchTransactionStatus.mockReset();
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  async function createPendingOrder() {
    return prisma.order.create({
      data: testOrderData({
        orderNumber: ORDER_NUMBER,
        status: "PENDING_PAYMENT",
        paymentMethod: "ONLINE",
        midtransOrderId: ORDER_NUMBER,
        quantity: 1,
      }),
    });
  }

  it("reports a keyed error and leaves the order untouched when the provider refuses", async () => {
    // The shape a placeholder or rotated server key takes: the vendor SDK
    // throws, and before this was caught the raw MidtransError escaped the
    // server action and reached the browser as a runtime error.
    await createPendingOrder();
    mockPaymentProvider.fetchTransactionStatus.mockRejectedValue(
      new Error(
        'Midtrans API is returning API error. HTTP status code: 401. API response: {"status_code":"401","status_message":"Unknown Merchant server_key/id"}',
      ),
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const { recheckPaymentStatus } = await import("@/app/actions/admin/recheck-payment");
    const result = await recheckPaymentStatus({ orderNumber: ORDER_NUMBER });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.paymentProviderUnreachable");
    expect(consoleError).toHaveBeenCalled();

    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: ORDER_NUMBER } });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.stockDecremented).toBe(false);
    expect(await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).toMatchObject({
      quantity: 5,
    });
    expect(await prisma.orderStatusEvent.count()).toBe(0);

    consoleError.mockRestore();
  });

  it("applies a settled payment through the same path the webhook uses", async () => {
    await createPendingOrder();
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_SUCCESS");

    const { recheckPaymentStatus } = await import("@/app/actions/admin/recheck-payment");
    const result = await recheckPaymentStatus({ orderNumber: ORDER_NUMBER });

    expect(result).toEqual({ ok: true, providerOutcome: "PAYMENT_SUCCESS", applied: true });
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: ORDER_NUMBER } });
    expect(order.status).toBe("PAID");
    expect(order.stockDecremented).toBe(true);
    // Recorded as OWNER — the operator pressed the button, not the provider.
    const events = await prisma.orderStatusEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("OWNER");
    expect(events[0].toStatus).toBe("PAID");
  });

  it("reports an unpaid order without moving it", async () => {
    await createPendingOrder();
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_PENDING");

    const { recheckPaymentStatus } = await import("@/app/actions/admin/recheck-payment");
    const result = await recheckPaymentStatus({ orderNumber: ORDER_NUMBER });

    expect(result).toEqual({ ok: true, providerOutcome: "PAYMENT_PENDING", applied: false });
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: ORDER_NUMBER } });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(await prisma.orderStatusEvent.count()).toBe(0);
  });
});
