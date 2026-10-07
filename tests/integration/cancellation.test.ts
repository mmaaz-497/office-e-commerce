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
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-CXR${String(orderNumberCounter).padStart(2, "0")}`;
}

const RAW_PHONE = "081234567890";
const NORMALIZED_PHONE = "+6281234567890";

/** FR-043, FR-044, FR-045, ADR-0001: the cancellation rights matrix, driven
 * end to end through the actual server actions rather than the pure
 * customerCancellationRight function alone (that matrix is already unit
 * tested by tests/unit/cancellation.test.ts). */
describe("cancellation rights matrix (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    cookieStore.clear();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("direct cancel is allowed for an unpaid ONLINE order", async () => {
    const { cancelOrder } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        paymentMethod: "ONLINE",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CANCELLED");
  });

  it("direct cancel is allowed for an unshipped COD order and restores stock when decremented", async () => {
    const { cancelOrder } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "CONFIRMED",
        paymentMethod: "COD",
        quantity: 3,
        stockDecremented: true,
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.stockDecremented).toBe(false);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(13);
  });

  it("a PAID order cannot be cancelled directly — only requested", async () => {
    const { cancelOrder } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });
    expect(result.ok).toBe(false);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
  });

  it("SHIPPED and terminal states offer neither direct cancel nor a request", async () => {
    const { cancelOrder, requestCancellation } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        paymentMethod: "ONLINE",
        trackingNumber: "X",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const cancelResult = await cancelOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE });
    expect(cancelResult.ok).toBe(false);

    const requestResult = await requestCancellation({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
    });
    expect(requestResult.ok).toBe(false);

    const requests = await prisma.cancellationRequest.findMany({ where: { orderId: order.id } });
    expect(requests).toHaveLength(0);
  });

  it("requesting cancellation on a PAID order creates a request and leaves the status unchanged", async () => {
    const { requestCancellation } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await requestCancellation({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      reason: "Changed my mind",
    });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID"); // unchanged

    const request = await prisma.cancellationRequest.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(request.resolution).toBe("OPEN");
    expect(request.reason).toBe("Changed my mind");
  });

  it("a second cancellation request for the same order is refused, not silently duplicated", async () => {
    const { requestCancellation } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    await requestCancellation({ orderNumber: order.orderNumber, phone: RAW_PHONE });
    const second = await requestCancellation({ orderNumber: order.orderNumber, phone: RAW_PHONE });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errorKey).toBe("errors.cancellationAlreadyRequested");

    const requests = await prisma.cancellationRequest.findMany({ where: { orderId: order.id } });
    expect(requests).toHaveLength(1);
  });

  it("a wrong phone produces the same generic failure as an unknown order, never revealing which was wrong", async () => {
    const { cancelOrder } = await import("@/app/actions/cancellation");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber, phone: "089999999999" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.orderLookupFailed");
  });

  it("approving a cancellation request cancels the order and restores stock when decremented", async () => {
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
    const { resolveCancellation } = await import("@/app/actions/admin/resolve-cancellation");

    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        quantity: 2,
        stockDecremented: true,
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });
    await prisma.cancellationRequest.create({ data: { orderId: order.id } });

    const result = await resolveCancellation({ orderNumber: order.orderNumber, approve: true });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.stockDecremented).toBe(false);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(12);

    const request = await prisma.cancellationRequest.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(request.resolution).toBe("APPROVED");
  });

  it("rejecting a cancellation request leaves the order completely untouched", async () => {
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
    const { resolveCancellation } = await import("@/app/actions/admin/resolve-cancellation");

    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        paymentMethod: "ONLINE",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });
    await prisma.cancellationRequest.create({ data: { orderId: order.id } });

    const result = await resolveCancellation({ orderNumber: order.orderNumber, approve: false });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");

    const request = await prisma.cancellationRequest.findUniqueOrThrow({
      where: { orderId: order.id },
    });
    expect(request.resolution).toBe("REJECTED");
  });
});
