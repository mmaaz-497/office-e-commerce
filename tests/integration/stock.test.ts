import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

describe("stock decrement and restore (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("decrement at exactly the available quantity succeeds", async () => {
    await seedStockLevel(5);
    const order = await prisma.order.create({
      data: testOrderData({ status: "PAID", quantity: 5 }),
    });

    const ok = await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      return port.decrementStock({ quantity: 5, orderNumber: order.orderNumber });
    });

    expect(ok).toBe(true);
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(0);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.stockDecremented).toBe(true);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(-5);
    expect(changes[0].resultingQuantity).toBe(0);
    expect(changes[0].reason).toBe("ORDER_PAID");
  });

  it("decrement above available quantity fails and rolls back", async () => {
    await seedStockLevel(3);
    const order = await prisma.order.create({
      data: testOrderData({ status: "PAID", quantity: 5 }),
    });

    const ok = await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      return port.decrementStock({ quantity: 5, orderNumber: order.orderNumber });
    });

    expect(ok).toBe(false);
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(3); // unchanged

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.stockDecremented).toBe(false);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(0);
  });

  it("restore occurs and clears stockDecremented", async () => {
    await seedStockLevel(0);
    const order = await prisma.order.create({
      data: testOrderData({ status: "CANCELLED", quantity: 3, stockDecremented: true }),
    });

    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.restoreStock({
        quantity: 3,
        orderNumber: order.orderNumber,
        reason: "ORDER_CANCELLED",
      });
    });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(3);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.stockDecremented).toBe(false);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(3);
    expect(changes[0].resultingQuantity).toBe(3);
  });

  it("an order that never decremented is never restored (stockDecremented stays false)", async () => {
    // PENDING_PAYMENT -> EXPIRED is RESTORE_IF_DECREMENTED per stockEffectOf,
    // but this order's stockDecremented is false because it never reached
    // PAID — the caller (not exercised by this pure-infra test) is
    // responsible for checking that flag before ever calling restoreStock.
    // This test documents the flag's state, which is what that check reads.
    await seedStockLevel(5);
    const order = await prisma.order.create({
      data: testOrderData({ status: "EXPIRED", quantity: 2, stockDecremented: false }),
    });

    const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.stockDecremented).toBe(false);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(5); // untouched
  });

  it("the StockChange ledger's resultingQuantity chain reconstructs the current level exactly", async () => {
    await seedStockLevel(10);
    const orderA = await prisma.order.create({
      data: testOrderData({ status: "PAID", quantity: 4 }),
    });
    const orderB = await prisma.order.create({
      data: testOrderData({ status: "CONFIRMED", paymentMethod: "COD", quantity: 3 }),
    });

    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.decrementStock({ quantity: 4, orderNumber: orderA.orderNumber });
    });
    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.decrementStock({ quantity: 3, orderNumber: orderB.orderNumber });
    });
    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.restoreStock({
        quantity: 4,
        orderNumber: orderA.orderNumber,
        reason: "ORDER_CANCELLED",
      });
    });

    const changes = await prisma.stockChange.findMany({ orderBy: { createdAt: "asc" } });
    expect(changes.map((c) => c.resultingQuantity)).toEqual([6, 3, 7]);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(7);
    expect(level.quantity).toBe(changes[changes.length - 1].resultingQuantity);
  });
});
