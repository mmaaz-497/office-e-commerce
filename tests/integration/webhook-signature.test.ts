import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("Midtrans webhook signature verification (integration) [MANDATED]", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("accepts a valid SHA512(order_id + status_code + gross_amount + serverKey) signature", async () => {
    const order = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-260920-VALID", status: "PENDING_PAYMENT" }),
    });

    const grossAmount = `${order.totalIDR}.00`;
    const signature = computeSignature(order.orderNumber, "200", grossAmount);

    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    const response = await POST(
      postWebhook({
        order_id: order.orderNumber,
        transaction_id: "txn-valid-1",
        transaction_status: "settlement",
        status_code: "200",
        gross_amount: grossAmount,
        fraud_status: "ACCEPT",
        signature_key: signature,
      }),
    );

    expect(response.status).toBe(200);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("PAID");
  });

  it("a tampered signature_key leaves the order untouched, is logged, and still returns 200", async () => {
    const order = await prisma.order.create({
      data: testOrderData({ orderNumber: "TKS-260920-TAMPR", status: "PENDING_PAYMENT" }),
    });
    const grossAmount = `${order.totalIDR}.00`;

    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    const response = await POST(
      postWebhook({
        order_id: order.orderNumber,
        transaction_id: "txn-tampered-1",
        transaction_status: "settlement",
        status_code: "200",
        gross_amount: grossAmount,
        fraud_status: "ACCEPT",
        signature_key:
          "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      }),
    );

    expect(response.status).toBe(200);

    const untouched = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.status).toBe("PENDING_PAYMENT");

    const notifications = await prisma.processedNotification.findMany();
    expect(notifications).toHaveLength(0); // never reached the insert-first step

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("verification happens before any order read — a bad signature for a non-existent order still returns 200 without error", async () => {
    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    const response = await POST(
      postWebhook({
        order_id: "TKS-260920-GHOST",
        transaction_id: "txn-ghost-1",
        transaction_status: "settlement",
        status_code: "200",
        gross_amount: "184999.00",
        fraud_status: "ACCEPT",
        signature_key: "invalid",
      }),
    );

    expect(response.status).toBe(200);
  });
});
