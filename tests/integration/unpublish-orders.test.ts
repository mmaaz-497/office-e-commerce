import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { env } from "@/config";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

const { cookieStore, fetchTransactionStatus } = vi.hoisted(() => {
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
    fetchTransactionStatus: vi.fn(),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

// revalidatePath needs a Next request context that a test does not have.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

// The real provider, so webhook signatures are verified exactly as in
// webhook-replay.test.ts; only the status lookup the expiry job makes is
// stubbed, as expiry.test.ts does.
vi.mock("@/infrastructure/payment/midtrans-provider", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/infrastructure/payment/midtrans-provider")>();
  return {
    MidtransProvider: vi.fn().mockImplementation(function PartlyStubbedProvider() {
      const provider = new actual.MidtransProvider();
      provider.fetchTransactionStatus = fetchTransactionStatus;
      return provider;
    }),
  };
});

const IMPORTED_SLUG = "slippers-gemoy";
const RAW_PHONE = "081234567890";
const PAST = new Date(Date.now() - 60 * 60 * 1000);

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-261005-PNB${String(orderNumberCounter).padStart(2, "0")}`;
}

function signedSettlement(orderNumber: string, totalIDR: number, transactionId: string) {
  const grossAmount = `${totalIDR}.00`;
  const signature = createHash("sha512")
    .update(orderNumber + "200" + grossAmount + env.MIDTRANS_SERVER_KEY)
    .digest("hex");
  return new NextRequest("http://localhost/api/webhooks/midtrans", {
    method: "POST",
    body: JSON.stringify({
      order_id: orderNumber,
      transaction_id: transactionId,
      transaction_status: "settlement",
      status_code: "200",
      gross_amount: grossAmount,
      fraud_status: "ACCEPT",
      signature_key: signature,
    }),
    headers: { "content-type": "application/json" },
  });
}

const stockQuantity = async () =>
  (await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity;

/**
 * Phase 2c research R-415, spec US4: orders placed while a product was on sale
 * complete normally after it is taken off sale. The product is set to DRAFT
 * directly, then each order goes through the existing webhook, fulfilment,
 * cancellation and expiry entry points.
 */
describe("orders in flight when a product is taken off sale (integration)", () => {
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    fetchTransactionStatus.mockReset();
    await seedStockLevel(5);
    productId = (await prisma.product.findUniqueOrThrow({ where: { slug: IMPORTED_SLUG } })).id;
  });

  afterEach(async () => {
    await resetDb();
  });

  const takeOffSale = () =>
    prisma.product.update({ where: { id: productId }, data: { status: "DRAFT" } });

  it("a Snap order's settlement still marks it PAID and decrements stock once; a replay changes nothing", async () => {
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        quantity: 2,
        product: { connect: { id: productId } },
      }),
    });
    await takeOffSale();

    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    expect(
      (await POST(signedSettlement(order.orderNumber, order.totalIDR, "txn-unp-1"))).status,
    ).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await stockQuantity()).toBe(3);
    expect(await prisma.stockChange.count({ where: { orderId: order.id } })).toBe(1);

    expect(
      (await POST(signedSettlement(order.orderNumber, order.totalIDR, "txn-unp-1"))).status,
    ).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
    expect(await stockQuantity()).toBe(3);
    expect(await prisma.stockChange.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("a COD order is confirmed, then cancelled, and its stock is restored once", async () => {
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COD_PENDING",
        paymentMethod: "COD",
        quantity: 1,
        product: { connect: { id: productId } },
      }),
    });
    await takeOffSale();

    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    expect(await confirmCodOrder({ orderNumber: order.orderNumber })).toEqual({ ok: true });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "CONFIRMED",
    );
    expect(await stockQuantity()).toBe(4);

    const { cancelOrder } = await import("@/app/actions/cancellation");
    expect((await cancelOrder({ orderNumber: order.orderNumber, phone: RAW_PHONE })).ok).toBe(true);
    const cancelled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.stockDecremented).toBe(false);
    expect(await stockQuantity()).toBe(5);

    const changes = await prisma.stockChange.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(changes.map((c) => [c.reason, c.delta])).toEqual([
      ["ORDER_CONFIRMED", -1],
      ["ORDER_CANCELLED", 1],
    ]);
  });

  it("a pending Snap order expires to EXPIRED with no stock restored", async () => {
    fetchTransactionStatus.mockResolvedValue("PAYMENT_EXPIRED");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        expiresAt: PAST,
        stockDecremented: false,
        product: { connect: { id: productId } },
      }),
    });
    await takeOffSale();

    const { POST } = await import("@/app/api/jobs/expire-orders/route");
    const response = await POST(
      new NextRequest("http://localhost/api/jobs/expire-orders", {
        method: "POST",
        headers: { authorization: `Bearer ${env.JOB_SECRET}` },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).expired).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "EXPIRED",
    );
    expect(await stockQuantity()).toBe(5);
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it("an existing review stays published", async () => {
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COMPLETED",
        product: { connect: { id: productId } },
      }),
    });
    const review = await prisma.review.create({
      data: {
        orderId: order.id,
        origin: "VERIFIED_PURCHASE",
        rating: 4,
        reviewerName: "Pembeli",
        published: true,
        reviewedAt: new Date(),
        productId,
      },
    });
    await takeOffSale();

    expect(await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).toEqual(review);
  });
});
