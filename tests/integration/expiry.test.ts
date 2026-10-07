import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { env } from "@/config";
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

const JOB_URL = "http://localhost/api/jobs/expire-orders";

function postJob() {
  return new NextRequest(JOB_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${env.JOB_SECRET}` },
  });
}

const PAST = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

/** FR-026, FR-031, SC-005, ADR-0002 named negative consequence. */
describe("expiry job — including provider outage (integration) [MANDATED]", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
    mockPaymentProvider.fetchTransactionStatus.mockReset();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("an unpaid online order past expiresAt becomes EXPIRED with no stock restored", async () => {
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_EXPIRED");

    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-EXPR1",
        status: "PENDING_PAYMENT",
        expiresAt: PAST,
        stockDecremented: false,
      }),
    });

    const { POST } = await import("@/app/api/jobs/expire-orders/route");
    const response = await POST(postJob());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expired).toBe(1);
    expect(body.rescued).toBe(0);
    expect(body.skipped).toBe(0);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: "TKS-260920-EXPR1" },
    });
    expect(order.status).toBe("EXPIRED");

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(5); // never decremented, so nothing to restore

    const changes = await prisma.stockChange.findMany();
    expect(changes).toHaveLength(0);
  });

  it("a paid-but-unnotified order is rescued rather than expired", async () => {
    mockPaymentProvider.fetchTransactionStatus.mockResolvedValue("PAYMENT_SUCCESS");

    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-EXPR2",
        status: "PENDING_PAYMENT",
        expiresAt: PAST,
        stockDecremented: false,
      }),
    });

    const { POST } = await import("@/app/api/jobs/expire-orders/route");
    const response = await POST(postJob());
    const body = await response.json();

    expect(body.expired).toBe(0);
    expect(body.rescued).toBe(1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: "TKS-260920-EXPR2" },
    });
    expect(order.status).toBe("PAID");
    expect(order.stockDecremented).toBe(true);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(4);
  });

  it("when the provider is unreachable the job SKIPS the order, leaves it PENDING_PAYMENT, and reports the skip", async () => {
    mockPaymentProvider.fetchTransactionStatus.mockRejectedValue(new Error("ECONNREFUSED"));

    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-EXPR3",
        status: "PENDING_PAYMENT",
        expiresAt: PAST,
        stockDecremented: false,
      }),
    });

    const { POST } = await import("@/app/api/jobs/expire-orders/route");
    const response = await POST(postJob());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expired).toBe(0);
    expect(body.rescued).toBe(0);
    expect(body.skipped).toBe(1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: "TKS-260920-EXPR3" },
    });
    expect(order.status).toBe("PENDING_PAYMENT"); // untouched — a provider outage must never cancel a paid order

    // Retries next tick: calling the job again with the provider still down
    // finds the same order still eligible and still just skips it.
    const secondResponse = await POST(postJob());
    const secondBody = await secondResponse.json();
    expect(secondBody.skipped).toBe(1);
    const stillPending = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: "TKS-260920-EXPR3" },
    });
    expect(stillPending.status).toBe("PENDING_PAYMENT");
  });

  it("rejects a request with a bad Bearer secret", async () => {
    const { POST } = await import("@/app/api/jobs/expire-orders/route");
    const request = new NextRequest(JOB_URL, {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
