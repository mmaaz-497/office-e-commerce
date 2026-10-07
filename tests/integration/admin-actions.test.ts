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

// testOrderData's default orderNumber ("TKS-TEST00-00001") does not match the
// strict TKS-YYMMDD-XXXXX format the admin schemas validate against — supply
// one that does.
let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-ADM${String(orderNumberCounter).padStart(2, "0")}`;
}

/** FR-060, FR-061, FR-025: each admin action succeeds only from its legal
 * statuses; a forged request for an illegal transition is refused
 * server-side even when the UI would not have offered it; every status
 * change writes an OrderStatusEvent with actor OWNER. (CUSTOMER coverage is
 * in checkout.test.ts, PAYMENT_PROVIDER in webhook-*.test.ts, SYSTEM in
 * expiry.test.ts — together the four actors are asserted across the suite.) */
describe("status-gated admin actions (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("confirmCodOrder transitions COD_PENDING -> CONFIRMED, decrements stock, and writes an OWNER event", async () => {
    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COD_PENDING",
        paymentMethod: "COD",
        quantity: 2,
      }),
    });

    const result = await confirmCodOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CONFIRMED");
    expect(updated.stockDecremented).toBe(true);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(8);

    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0].actor).toBe("OWNER");
    expect(events[0].fromStatus).toBe("COD_PENDING");
    expect(events[0].toStatus).toBe("CONFIRMED");
  });

  it("confirmCodOrder is refused server-side from an illegal status, leaving the order untouched", async () => {
    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        paymentMethod: "ONLINE",
      }),
    });

    const result = await confirmCodOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.invalidTransition");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PENDING_PAYMENT");
    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(0);
  });

  it("confirmCodOrder rolls back the status change entirely when stock cannot cover it", async () => {
    await resetDb();
    await seedStockLevel(1);
    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COD_PENDING",
        paymentMethod: "COD",
        quantity: 5,
      }),
    });

    const result = await confirmCodOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("COD_PENDING"); // rolled back, not left CONFIRMED with no stock
    expect(updated.stockDecremented).toBe(false);
  });

  it("markShipped requires a non-empty tracking number", async () => {
    const { markShipped } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
      }),
    });

    const result = await markShipped({ orderNumber: order.orderNumber, trackingNumber: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.validation");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
    expect(updated.trackingNumber).toBeNull();
  });

  it("markShipped succeeds from PAID, stores the tracking number, and writes an OWNER event", async () => {
    const { markShipped } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
      }),
    });

    const result = await markShipped({
      orderNumber: order.orderNumber,
      trackingNumber: "JNE123456",
    });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("SHIPPED");
    expect(updated.trackingNumber).toBe("JNE123456");

    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events[0].actor).toBe("OWNER");
  });

  it("markShipped is refused for an order with an unresolved fulfilment conflict", async () => {
    const { markShipped } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        conflictFlag: "PAID_STOCK_UNAVAILABLE",
        conflictDetectedAt: new Date(),
      }),
    });

    const result = await markShipped({ orderNumber: order.orderNumber, trackingNumber: "JNE1" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.fulfilmentConflict");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
  });

  it("markCompleted works only from SHIPPED", async () => {
    const { markCompleted } = await import("@/app/actions/admin/fulfilment");
    const notShipped = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
      }),
    });
    const refused = await markCompleted({ orderNumber: notShipped.orderNumber });
    expect(refused.ok).toBe(false);

    const shipped = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        paymentMethod: "ONLINE",
        trackingNumber: "X",
      }),
    });
    const applied = await markCompleted({ orderNumber: shipped.orderNumber });
    expect(applied.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: shipped.id } });
    expect(updated.status).toBe("COMPLETED");
  });

  it("cancelOrder refuses a forged request against a PAID order — the FSM allows the edge, the admin action must not", async () => {
    const { cancelOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.invalidTransition");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
  });

  it("cancelOrder succeeds from CONFIRMED, restores stock, and records the refund reference", async () => {
    const { cancelOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "CONFIRMED",
        paymentMethod: "COD",
        quantity: 3,
        stockDecremented: true,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber, refundReference: "REF-1" });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.stockDecremented).toBe(false);
    expect(updated.refundReference).toBe("REF-1");

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(13);
  });

  it("markReturned restores stock only when stockDecremented, and stores the refund reference", async () => {
    const { markReturned } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        paymentMethod: "ONLINE",
        quantity: 2,
        stockDecremented: true,
        trackingNumber: "X",
      }),
    });

    const result = await markReturned({ orderNumber: order.orderNumber, refundReference: "REF-2" });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("RETURNED");
    expect(updated.stockDecremented).toBe(false);
    expect(updated.refundReference).toBe("REF-2");

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(12);
  });
});
