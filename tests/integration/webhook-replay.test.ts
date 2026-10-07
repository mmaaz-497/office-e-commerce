import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
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

/**
 * FR-029, SC-004, ADR-0002 Verification: replaying one notification ten
 * times must produce exactly one StockChange row, one status event, and ten
 * 200 responses — the insert-first unique constraint IS the idempotency
 * check.
 */
describe("Midtrans webhook idempotency — replay (integration) [MANDATED]", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("replaying one notification ten times produces exactly one stock movement and one status event", async () => {
    const order = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-260920-REPLY", status: "PENDING_PAYMENT" }),
    });
    const grossAmount = `${order.totalIDR}.00`;
    const signature = computeSignature(order.orderNumber, "200", grossAmount);

    const body = {
      order_id: order.orderNumber,
      transaction_id: "txn-replay-1",
      transaction_status: "settlement",
      status_code: "200",
      gross_amount: grossAmount,
      fraud_status: "ACCEPT",
      signature_key: signature,
    };

    const { POST } = await import("@/app/api/webhooks/midtrans/route");

    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const response = await POST(postWebhook(body));
      statuses.push(response.status);
    }

    expect(statuses).toEqual(Array(10).fill(200));

    const notifications = await prisma.processedNotification.findMany({
      where: { transactionId: "txn-replay-1" },
    });
    expect(notifications).toHaveLength(1); // inserted once; every replay hit the unique constraint
    expect(notifications[0].applied).toBe(true);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);

    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("PAID");

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
  });
});
