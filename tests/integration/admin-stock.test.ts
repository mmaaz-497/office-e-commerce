import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

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
      clear: () => store.clear(),
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

// testOrderData's default orderNumber ("TKS-TEST00-00001") does not match the
// strict TKS-YYMMDD-XXXXX format the admin schemas validate against — supply
// one that does.
let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-STK${String(orderNumberCounter).padStart(2, "0")}`;
}

/** FR-035, FR-036, FR-062: cancel and return restore stock only when
 * stockDecremented, and every stock mutation writes a ledger row carrying
 * the correct reason. */
describe("admin stock restore and manual adjustment (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("cancelling a CONFIRMED order restores exactly the ordered quantity and clears stockDecremented", async () => {
    const { cancelOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "CONFIRMED",
        paymentMethod: "COD",
        quantity: 4,
        stockDecremented: true,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(true);

    const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.stockDecremented).toBe(false);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(14);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(4);
    expect(changes[0].reason).toBe("ORDER_CANCELLED");
    expect(changes[0].resultingQuantity).toBe(14);
  });

  it("cancelling a COD_PENDING order restores nothing — it was never decremented", async () => {
    const { cancelOrder } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COD_PENDING",
        paymentMethod: "COD",
        quantity: 4,
        stockDecremented: false,
      }),
    });

    const result = await cancelOrder({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(true);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(10); // unchanged

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(0);
  });

  it("returning a SHIPPED order restores stock with reason ORDER_RETURNED", async () => {
    const { markReturned } = await import("@/app/actions/admin/fulfilment");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        paymentMethod: "ONLINE",
        quantity: 2,
        stockDecremented: true,
        trackingNumber: "X",
      }),
    });

    const result = await markReturned({ orderNumber: order.orderNumber });
    expect(result.ok).toBe(true);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(12);

    const changes = await prisma.stockChange.findMany({ where: { orderId: order.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(2);
    expect(changes[0].reason).toBe("ORDER_RETURNED");
  });

  it("adjustStock increases stock and logs a MANUAL_ADJUSTMENT ledger row with the given note", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: 5, note: "Restock from supplier" });
    expect(result).toEqual({ ok: true, quantity: 15 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(15);

    const changes = await prisma.stockChange.findMany({ where: { reason: "MANUAL_ADJUSTMENT" } });
    expect(changes).toHaveLength(1);
    expect(changes[0].delta).toBe(5);
    expect(changes[0].note).toBe("Restock from supplier");
    expect(changes[0].orderId).toBeNull();
  });

  it("adjustStock refuses a decrease that would take the level below zero", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: -20, note: "Damaged stock" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(10); // unchanged
  });

  it("adjustStock opens the level from nothing when the database was never seeded", async () => {
    await prisma.stockLevel.deleteMany();
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: 50, note: "Opening stock" });
    expect(result).toEqual({ ok: true, quantity: 50 });

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: "default" } });
    expect(level.quantity).toBe(50);

    const changes = await prisma.stockChange.findMany({ where: { reason: "MANUAL_ADJUSTMENT" } });
    expect(changes).toHaveLength(1);
    expect(changes[0].resultingQuantity).toBe(50);
  });

  it("adjustStock refuses a decrease against an unseeded database instead of crashing", async () => {
    await prisma.stockLevel.deleteMany();
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: -1, note: "Damaged stock" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.insufficientStock");

    // The refused adjustment rolls its whole transaction back, so the level
    // row it opened at zero goes with it — nothing is left behind.
    expect(await prisma.stockLevel.findUnique({ where: { id: "default" } })).toBeNull();
    expect(await prisma.stockChange.count()).toBe(0);
  });

  it("adjustStock requires a non-empty reason", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: 1, note: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.validation");
  });
});
