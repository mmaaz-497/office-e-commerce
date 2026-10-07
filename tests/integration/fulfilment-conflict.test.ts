import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { env } from "@/config";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

const WEBHOOK_URL = "http://localhost/api/webhooks/midtrans";

function computeSignature(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + env.MIDTRANS_SERVER_KEY)
    .digest("hex");
}

function postWebhook(body: Record<string, unknown>) {
  return new NextRequest(WEBHOOK_URL, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** FR-075, SC-003, spec Edge Cases: the unfulfillable-paid-order path. */
describe("fulfilment conflict — two orders settle against stock=1 (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(1);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("exactly one order is decremented; the other is PAID with conflictFlag PAID_STOCK_UNAVAILABLE; both return 2xx", async () => {
    const orderA = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-CNFLA",
        status: "PENDING_PAYMENT",
        quantity: 1,
      }),
    });
    const orderB = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-CNFLB",
        status: "PENDING_PAYMENT",
        quantity: 1,
      }),
    });

    const { POST } = await import("@/app/api/webhooks/midtrans/route");

    const responses = await Promise.all(
      [orderA, orderB].map((order) => {
        const grossAmount = `${order.totalIDR}.00`;
        const signature = computeSignature(order.orderNumber, "200", grossAmount);
        return POST(
          postWebhook({
            order_id: order.orderNumber,
            transaction_id: `txn-conflict-${order.orderNumber}`,
            transaction_status: "settlement",
            status_code: "200",
            gross_amount: grossAmount,
            fraud_status: "ACCEPT",
            signature_key: signature,
          }),
        );
      }),
    );

    expect(responses.map((r) => r.status)).toEqual([200, 200]);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(0);
    expect(level.quantity).not.toBeLessThan(0);

    const [freshA, freshB] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderA.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: orderB.id } }),
    ]);
    const both = [freshA, freshB];

    // Both are PAID — the customer's money arrived either way — but exactly
    // one actually decremented stock, and exactly one is flagged.
    expect(both.every((o) => o.status === "PAID")).toBe(true);
    const decrementedCount = both.filter((o) => o.stockDecremented).length;
    expect(decrementedCount).toBe(1);
    const conflicted = both.filter((o) => o.conflictFlag === "PAID_STOCK_UNAVAILABLE");
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0].conflictDetectedAt).not.toBeNull();

    const winner = both.find((o) => o.conflictFlag === "NONE")!;
    expect(winner.stockDecremented).toBe(true);
  });

  it("the conflict appears on a dashboard-style query and persists without an owner action", async () => {
    const orderA = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-DASHA",
        status: "PENDING_PAYMENT",
        quantity: 1,
      }),
    });
    const orderB = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-DASHB",
        status: "PENDING_PAYMENT",
        quantity: 1,
      }),
    });

    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    await Promise.all(
      [orderA, orderB].map((order) => {
        const grossAmount = `${order.totalIDR}.00`;
        const signature = computeSignature(order.orderNumber, "200", grossAmount);
        return POST(
          postWebhook({
            order_id: order.orderNumber,
            transaction_id: `txn-dash-${order.orderNumber}`,
            transaction_status: "settlement",
            status_code: "200",
            gross_amount: grossAmount,
            fraud_status: "ACCEPT",
            signature_key: signature,
          }),
        );
      }),
    );

    const dashboardConflicts = await prisma.order.findMany({
      where: { conflictFlag: { not: "NONE" } },
    });
    expect(dashboardConflicts).toHaveLength(1);

    // No owner action occurred — the conflict is still there on a second read.
    const stillThere = await prisma.order.findMany({ where: { conflictFlag: { not: "NONE" } } });
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].id).toBe(dashboardConflicts[0].id);
  });

  it("markShipped (applyStatus ->SHIPPED) is refused for a conflicted order", async () => {
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-260920-SHIP1",
        status: "PAID",
        quantity: 1,
        conflictFlag: "PAID_STOCK_UNAVAILABLE",
        conflictDetectedAt: new Date(),
      }),
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const port = createOrderTransactionPort(tx);
        return port.applyStatus({
          orderNumber: order.orderNumber,
          expectedStatus: "PAID",
          nextStatus: "SHIPPED",
          actor: "OWNER",
        });
      }),
    ).rejects.toThrow(/unresolved fulfilment conflict/);

    const unchanged = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.status).toBe("PAID"); // still not shipped
  });
});
