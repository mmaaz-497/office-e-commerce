import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { applyPaymentSuccess } from "@/infrastructure/db/order-transaction";
import { resetDb, seedProduct, seedStockLevel, testOrderData } from "../integration/helpers/db";

/**
 * T035 — the oversell guarantee holds per product (SC-003, 003 US2): ten
 * concurrent payments for each of two products, each with stock 1, never take
 * either row below zero, and each product's ledger reconstructs its quantity.
 * Real PostgreSQL, separate pooled connections per transaction (R-015).
 */
const PER_PRODUCT = 10;

describe("concurrent oversell prevention per product", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("each product sells exactly its one unit; the rest are flagged, never oversold", async () => {
    await seedStockLevel(1);
    const legacy = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
    const b = await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 1 });
    const products = [
      { id: legacy.id, stockLevelId: "default" },
      { id: b.id, stockLevelId: b.id },
    ];

    const orders = await Promise.all(
      products.flatMap((product) =>
        Array.from({ length: PER_PRODUCT }, () =>
          prisma.order.create({
            data: testOrderData({
              status: "PENDING_PAYMENT",
              quantity: 1,
              product: { connect: { id: product.id } },
            }),
          }),
        ),
      ),
    );

    const outcomes = await Promise.all(
      orders.map((order) =>
        prisma.$transaction((tx) => applyPaymentSuccess(tx, order.orderNumber, "PAYMENT_PROVIDER")),
      ),
    );
    expect(
      outcomes.every((o) => o.kind === "APPLIED" || o.kind === "CONFLICT_STOCK_UNAVAILABLE"),
    ).toBe(true);

    for (const product of products) {
      const level = await prisma.stockLevel.findUniqueOrThrow({
        where: { id: product.stockLevelId },
      });
      expect(level.quantity).toBe(0);

      const productOrders = await prisma.order.findMany({ where: { productId: product.id } });
      expect(productOrders).toHaveLength(PER_PRODUCT);
      expect(productOrders.filter((o) => o.stockDecremented)).toHaveLength(1);
      expect(productOrders.filter((o) => o.conflictFlag === "PAID_STOCK_UNAVAILABLE")).toHaveLength(
        PER_PRODUCT - 1,
      );

      // The ledger reconstructs the row: opening 1 plus every delta, never negative.
      const changes = await prisma.stockChange.findMany({
        where: { productId: product.id },
        orderBy: { createdAt: "asc" },
      });
      expect(changes).toHaveLength(1);
      expect(1 + changes.reduce((sum, c) => sum + c.delta, 0)).toBe(level.quantity);
      expect(changes.every((c) => c.resultingQuantity >= 0)).toBe(true);
    }
  });
});
