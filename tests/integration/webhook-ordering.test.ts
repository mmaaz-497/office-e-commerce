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

/** FR-030, FR-031, ADR-0002 Verification. */
describe("Midtrans webhook out-of-order and late notifications (integration) [MANDATED]", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("a pending notification arriving after settlement is recorded applied=false and does not move the order back", async () => {
    const order = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-260920-ORDR1", status: "PENDING_PAYMENT" }),
    });
    const grossAmount = `${order.totalIDR}.00`;

    const { POST } = await import("@/app/api/webhooks/midtrans/route");

    const settleSignature = computeSignature(order.orderNumber, "200", grossAmount);
    const settleResponse = await POST(
      postWebhook({
        order_id: order.orderNumber,
        transaction_id: "txn-ordering-1",
        transaction_status: "settlement",
        status_code: "200",
        gross_amount: grossAmount,
        fraud_status: "ACCEPT",
        signature_key: settleSignature,
      }),
    );
    expect(settleResponse.status).toBe(200);

    const afterSettle = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterSettle.status).toBe("PAID");

    // A `pending` notification for the SAME transaction, arriving late,
    // carries a different status_code (Midtrans convention: 201 = pending).
    const pendingSignature = computeSignature(order.orderNumber, "201", grossAmount);
    const pendingResponse = await POST(
      postWebhook({
        order_id: order.orderNumber,
        transaction_id: "txn-ordering-1",
        transaction_status: "pending",
        status_code: "201",
        gross_amount: grossAmount,
        signature_key: pendingSignature,
      }),
    );
    expect(pendingResponse.status).toBe(200);

    const afterPending = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterPending.status).toBe("PAID"); // unchanged — never moved backwards

    const pendingRecord = await prisma.processedNotification.findFirstOrThrow({
      where: { transactionId: "txn-ordering-1", statusCode: "201" },
    });
    expect(pendingRecord.applied).toBe(false);

    // Still exactly one status event (from the original settlement) — the
    // pending notification never touched the transition table.
    const events = await prisma.orderStatusEvent.findMany({ where: { orderId: order.id } });
    expect(events).toHaveLength(1);
  });

  it("a settlement for an already-EXPIRED order does not revive it and is flagged for the owner", async () => {
    const order = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-260920-ORDR2", status: "EXPIRED" }),
    });
    const grossAmount = `${order.totalIDR}.00`;
    const signature = computeSignature(order.orderNumber, "200", grossAmount);

    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    const response = await POST(
      postWebhook({
        order_id: order.orderNumber,
        transaction_id: "txn-ordering-2",
        transaction_status: "settlement",
        status_code: "200",
        gross_amount: grossAmount,
        fraud_status: "ACCEPT",
        signature_key: signature,
      }),
    );

    expect(response.status).toBe(200);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("EXPIRED"); // not revived
    expect(updated.conflictFlag).toBe("PAID_AFTER_EXPIRY");
    expect(updated.conflictDetectedAt).not.toBeNull();
  });
});
