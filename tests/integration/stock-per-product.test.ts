import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  applyPaymentSuccess,
  createOrderTransactionPort,
} from "@/infrastructure/db/order-transaction";
import { resetDb, seedProduct, seedStockLevel, testOrderData } from "./helpers/db";

/**
 * T033 — stock moves on the ordered product's own row (contracts/checkout.md
 * "Stock port"): a decrement or restore for product B touches B's StockLevel
 * and ledger only, and a product with no stock row follows the existing
 * insufficient-stock path.
 */
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
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

// The admin schemas validate the strict TKS-YYMMDD-XXXXX format.
let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-261004-PPS${String(orderNumberCounter).padStart(2, "0")}`;
}

async function quantityOf(stockLevelId: string): Promise<number> {
  const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: stockLevelId } });
  return level.quantity;
}

describe("stock per product (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("paying B decrements only B's row and attributes the ledger row to B; cancelling restores only B", async () => {
    const b = await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 3 });
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        quantity: 2,
        unitPriceIDR: 99000,
        product: { connect: { id: b.id } },
      }),
    });

    const outcome = await prisma.$transaction((tx) =>
      applyPaymentSuccess(tx, order.orderNumber, "PAYMENT_PROVIDER"),
    );

    expect(outcome).toEqual({ kind: "APPLIED", nextStatus: "PAID" });
    expect(await quantityOf(b.id)).toBe(1);
    expect(await quantityOf("default")).toBe(5);
    const decrement = await prisma.stockChange.findFirstOrThrow({ where: { orderId: order.id } });
    expect(decrement.productId).toBe(b.id);
    expect(decrement.delta).toBe(-2);

    await prisma.cancellationRequest.create({ data: { orderId: order.id } });
    const { resolveCancellation } = await import("@/app/actions/admin/resolve-cancellation");
    const resolved = await resolveCancellation({ orderNumber: order.orderNumber, approve: true });

    expect(resolved).toEqual({ ok: true });
    expect(await quantityOf(b.id)).toBe(3);
    expect(await quantityOf("default")).toBe(5);
    const restore = await prisma.stockChange.findFirstOrThrow({
      where: { orderId: order.id, delta: 2 },
    });
    expect(restore.productId).toBe(b.id);
    expect(restore.reason).toBe("ORDER_CANCELLED");
  });

  it("confirming a COD order for B decrements B", async () => {
    const b = await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 3 });
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COD_PENDING",
        paymentMethod: "COD",
        quantity: 1,
        product: { connect: { id: b.id } },
      }),
    });

    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    const result = await confirmCodOrder({ orderNumber: order.orderNumber });

    expect(result).toEqual({ ok: true });
    expect(await quantityOf(b.id)).toBe(2);
    expect(await quantityOf("default")).toBe(5);
    const change = await prisma.stockChange.findFirstOrThrow({ where: { orderId: order.id } });
    expect(change.productId).toBe(b.id);
    expect(change.reason).toBe("ORDER_CONFIRMED");
  });

  it("a product with no stock row cannot be decremented, which raises the existing conflict", async () => {
    const b = await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000 });
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PAID",
        quantity: 1,
        product: { connect: { id: b.id } },
      }),
    });

    const decremented = await prisma.$transaction((tx) =>
      createOrderTransactionPort(tx).decrementStock({
        quantity: 1,
        orderNumber: order.orderNumber,
      }),
    );
    expect(decremented).toBe(false);
    expect(await quantityOf("default")).toBe(5);
    expect(await prisma.stockChange.count()).toBe(0);

    const pending = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "PENDING_PAYMENT",
        quantity: 1,
        product: { connect: { id: b.id } },
      }),
    });
    const outcome = await prisma.$transaction((tx) =>
      applyPaymentSuccess(tx, pending.orderNumber, "PAYMENT_PROVIDER"),
    );
    expect(outcome).toEqual({ kind: "CONFLICT_STOCK_UNAVAILABLE" });
    const flagged = await prisma.order.findUniqueOrThrow({ where: { id: pending.id } });
    expect(flagged.conflictFlag).toBe("PAID_STOCK_UNAVAILABLE");
  });
});
