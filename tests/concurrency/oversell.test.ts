import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { InsufficientStockError } from "@/domain/errors";
import { resetDb, seedStockLevel, testOrderData } from "../integration/helpers/db";

/**
 * Two genuinely parallel checkouts against stock = 1 (SC-003, ADR-0001
 * Verification). Runs against real PostgreSQL — a mocked conditional update
 * proves nothing about whether WHERE quantity >= n holds under real
 * concurrency (research R-015). Each prisma.$transaction call checks out its
 * own connection from the pool, so the two Promise.all branches genuinely
 * run on separate connections, not one connection serialising two calls.
 */
async function attemptCheckout(orderNumber: string, quantity: number): Promise<void> {
  const succeeded = await prisma.$transaction(async (tx) => {
    const port = createOrderTransactionPort(tx);
    return port.decrementStock({ quantity, orderNumber });
  });
  if (!succeeded) {
    throw new InsufficientStockError(0, quantity);
  }
}

describe("concurrent oversell prevention", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("exactly one of two parallel checkouts against stock=1 succeeds", async () => {
    await seedStockLevel(1);
    const orderA = await prisma.order.create({
      data: testOrderData({ status: "PAID", quantity: 1 }),
    });
    const orderB = await prisma.order.create({
      data: testOrderData({ status: "PAID", quantity: 1 }),
    });

    const results = await Promise.allSettled([
      attemptCheckout(orderA.orderNumber, 1),
      attemptCheckout(orderB.orderNumber, 1),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(InsufficientStockError);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(0);
    expect(level.quantity).not.toBeLessThan(0);

    const changes = await prisma.stockChange.findMany();
    expect(changes).toHaveLength(1);
  });

  it("ten parallel checkouts against stock=1 still yield exactly one winner", async () => {
    // A higher-concurrency variant of the same guarantee — the pairwise case
    // above could in principle pass by luck of scheduling; ten concurrent
    // attempts make that far less likely to mask a real race.
    await seedStockLevel(1);
    const orders = await Promise.all(
      Array.from({ length: 10 }, () =>
        prisma.order.create({ data: testOrderData({ status: "PAID", quantity: 1 }) }),
      ),
    );

    const results = await Promise.allSettled(orders.map((o) => attemptCheckout(o.orderNumber, 1)));

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(0);

    const changes = await prisma.stockChange.findMany();
    expect(changes).toHaveLength(1);
  });
});
