import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { env } from "@/config";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

const WEBHOOK_URL = "http://localhost/api/webhooks/midtrans";

/*
 * Notification bodies copied verbatim from the Midtrans docs (fetched
 * 2026-10-06). Midtrans sends transaction_status and fraud_status in lower
 * case; every other webhook test sends "ACCEPT", which is why the upper-case
 * comparison went unnoticed.
 *
 * Only order_id, gross_amount and signature_key are replaced per test: the
 * docs' signature_key was made with Midtrans's own demo server key, so the
 * body must be re-signed with the test key over a real test order. Every
 * status field is exactly as published.
 */

// docs.midtrans.com/docs/https-notification-webhooks — credit card, capture.
const CARD_CAPTURE_ACCEPT = {
  transaction_time: "2020-01-09 18:27:19",
  transaction_status: "capture",
  transaction_id: "57d5293c-e65f-4a29-95e4-5959c3fa335b",
  status_message: "midtrans payment notification",
  status_code: "200",
  signature_key:
    "16d6f84b2fb0468e2a9cf99a8ac4e5d803d42180347aaa70cb2a7abb13b5c6130458ca9c71956a962c0827637cd3bc7d40b21a8ae9fab12c7c3efe351b18d00a",
  payment_type: "credit_card",
  order_id: "Postman-1578568851",
  merchant_id: "G141532850",
  masked_card: "48111111-1114",
  gross_amount: "10000.00",
  fraud_status: "accept",
  eci: "05",
  currency: "IDR",
  channel_response_message: "Approved",
  channel_response_code: "00",
  card_type: "credit",
  bank: "bni",
  approval_code: "1578569243927",
};

// docs.midtrans.com/docs/https-notification-webhooks — Permata VA, settlement.
const BANK_TRANSFER_SETTLEMENT_ACCEPT = {
  transaction_time: "2021-06-23 11:18:59",
  transaction_status: "settlement",
  transaction_id: "6fd88567-62da-43ff-8fe6-5717e430ffc7",
  status_message: "midtrans payment notification",
  status_code: "200",
  signature_key:
    "0c0df82489931602577d9e434966c0540249b7c0aeaae2b718305af89a11e2bf9b4008aba07d1b3b248b15b4fbecdd15e81dbb2648b974efc4e0656e8c976094",
  settlement_time: "2021-06-23 11:20:06",
  permata_va_number: "8562000087926752",
  payment_type: "bank_transfer",
  order_id: "permata-va-01",
  merchant_id: "G141532850",
  gross_amount: "185000.00",
  fraud_status: "accept",
  currency: "IDR",
};

// docs.midtrans.com/docs/https-notification-webhooks — Indomaret, settlement,
// no fraud_status ("may not be evaluated by Fraud Detection System").
const CSTORE_SETTLEMENT_NO_FRAUD_STATUS = {
  transaction_time: "2021-06-23 13:13:21",
  transaction_status: "settlement",
  transaction_id: "991af93c-1049-4973-b38f-d6052c72e367",
  store: "indomaret",
  status_message: "midtrans payment notification",
  status_code: "200",
  signature_key:
    "a198f93ac43cf98171dcb4bd0323c7e3afbee77a162a09e2381f0a218c761a4ef0254d7650602971735c486fea2e8e9c6d41ee65d6a53d65a12fb1c824e86f9f",
  settlement_time: "2021-06-23 13:13:56",
  payment_type: "cstore",
  payment_code: "300063000630006300",
  order_id: "indomaret-01",
  merchant_id: "G141532850",
  gross_amount: "336000.00",
  currency: "IDR",
  approval_code: "ABC0101BCA02",
};

// docs.midtrans.com/reference/charge-transactions-on-card — capture held for
// fraud review.
const CARD_CAPTURE_CHALLENGE = {
  masked_card: "48111111-1114",
  approval_code: "315762",
  bank: "bni",
  transaction_time: "2014-08-01 15:39:22",
  gross_amount: "145000.00",
  order_id: "C17550",
  payment_type: "credit_card",
  signature_key:
    "393f8b6b27f9f6385d8391642942e9534fd20dad20c0631b75b0746bfc314482af4411c93e958b691a63e9154676905b906234d1f12fca031f5be5593f7ec2c6",
  status_code: "201",
  transaction_id: "1a1a66f7-27a7-4844-ba1f-d86dcc16ab27",
  transaction_status: "capture",
  fraud_status: "challenge",
  status_message: "midtrans payment notification",
  channel_response_code: "00",
  channel_response_message: "Approved",
  card_type: "credit",
  on_us: false,
};

// docs.midtrans.com/reference/charge-transactions-on-card — denied by the
// bank. Its fraud_status is "accept", so only transaction_status refuses it.
const CARD_DENY = {
  masked_card: "48111111-1114",
  approval_code: "338016",
  bank: "bni",
  transaction_time: "2014-08-01 15:39:22",
  gross_amount: "145000.00",
  order_id: "C17550",
  payment_type: "credit_card",
  signature_key:
    "763713b31cf59c886d3cc4a0c654a060a8e990080fe29fca75ae9e4ff9de804809c4e20977829844dac01a7ac1464a4eb095ad32482048398918987295dc5022",
  status_code: "202",
  transaction_id: "1a1a66f7-27a7-4844-ba1f-d86dcc16ab27",
  transaction_status: "deny",
  fraud_status: "accept",
  status_message: "midtrans payment notification",
  channel_response_code: "05",
  channel_response_message: "Do not honor",
  card_type: "credit",
  on_us: true,
};

function computeSignature(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + env.MIDTRANS_SERVER_KEY)
    .digest("hex");
}

/** The docs payload, re-addressed to a test order and re-signed with the test key. */
function forOrder(
  payload: Record<string, unknown> & { status_code: string },
  orderNumber: string,
  totalIDR: number,
) {
  const grossAmount = `${totalIDR}.00`;
  return {
    ...payload,
    order_id: orderNumber,
    gross_amount: grossAmount,
    signature_key: computeSignature(orderNumber, payload.status_code, grossAmount),
  };
}

async function deliver(payload: Record<string, unknown> & { status_code: string }) {
  const order = await prisma.order.create({ data: testOrderData() });
  const body = forOrder(payload, order.orderNumber, order.totalIDR);
  const { POST } = await import("@/app/api/webhooks/midtrans/route");
  const response = await POST(
    new NextRequest(WEBHOOK_URL, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
  return {
    response,
    order: await prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    stockChanges: await prisma.stockChange.count({ where: { orderId: order.id } }),
  };
}

describe("Midtrans webhook — lower-case payloads from the Midtrans docs (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it.each([
    ["settlement + accept (bank transfer)", BANK_TRANSFER_SETTLEMENT_ACCEPT],
    ["capture + accept (credit card)", CARD_CAPTURE_ACCEPT],
    ["settlement without fraud_status (Indomaret)", CSTORE_SETTLEMENT_NO_FRAUD_STATUS],
  ])("%s marks the order PAID", async (_label, payload) => {
    const { response, order, stockChanges } = await deliver(payload);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reason: "APPLIED" });
    expect(order.status).toBe("PAID");
    expect(stockChanges).toBe(1);
  });

  it.each([
    ["capture + challenge", CARD_CAPTURE_CHALLENGE, "PAYMENT_PENDING"],
    ["deny", CARD_DENY, "PAYMENT_FAILED"],
  ])("%s does not mark the order PAID", async (_label, payload, reason) => {
    const { response, order, stockChanges } = await deliver(payload);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, reason });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(stockChanges).toBe(0);
  });
});
