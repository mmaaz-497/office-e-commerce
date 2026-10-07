import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  applyPaymentSuccess,
  createOrderTransactionPort,
} from "@/infrastructure/db/order-transaction";
import { getSoldCount } from "@/infrastructure/db/sold-count";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

/**
 * T033 — an order with no productId (one placed by the pre-catalogue release
 * during a rollback window) belongs to the legacy product (R-202): its stock
 * moves on 'default' and it counts in the legacy product's sold count.
 */
describe("legacy null attribution (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("a null-product order decrements and restores 'default' and counts for the legacy product", async () => {
    const legacy = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
    const order = await prisma.order.create({
      data: testOrderData({ status: "PENDING_PAYMENT", quantity: 2 }),
    });
    expect(order.productId).toBeNull();

    const outcome = await prisma.$transaction((tx) =>
      applyPaymentSuccess(tx, order.orderNumber, "PAYMENT_PROVIDER"),
    );
    expect(outcome).toEqual({ kind: "APPLIED", nextStatus: "PAID" });
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      3,
    );

    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.applyStatus({
        orderNumber: order.orderNumber,
        expectedStatus: "PAID",
        nextStatus: "CANCELLED",
        actor: "OWNER",
      });
      await port.restoreStock({
        quantity: 2,
        orderNumber: order.orderNumber,
        reason: "ORDER_CANCELLED",
      });
    });
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } })).quantity).toBe(
      5,
    );

    const baseline = legacy.soldCountBaseline;
    await prisma.order.create({
      data: testOrderData({ status: "COMPLETED", quantity: 4 }),
    });
    expect(await getSoldCount(legacy.id)).toBe(baseline + 4);
  });
});
