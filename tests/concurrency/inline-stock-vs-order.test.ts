import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { applyPaymentSuccess } from "@/infrastructure/db/order-transaction";
import { resetDb, seedProduct, testOrderData } from "../integration/helpers/db";

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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const OPENING = 10;
const ORDERS = 10;
const INLINE_CALLS = 5;

/**
 * T041 — the inline stock editor and paid orders race on one product row
 * (spec US3; research R-313). Only what holds under every interleaving is
 * asserted: an inline call can succeed more than once, because one +5 and
 * five orders bring the row back to exactly the expected 10 (analysis H1).
 */
describe("inline stock edits concurrent with paid orders", () => {
  beforeEach(async () => {
    await resetDb();
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("never goes negative, and the ledger accounts for every change", async () => {
    const { setProductStock } = await import("@/app/actions/admin/stock");
    const product = await seedProduct({
      slug: "balapan",
      status: "ACTIVE",
      priceIDR: 99000,
      stock: OPENING,
    });

    const orders = await Promise.all(
      Array.from({ length: ORDERS }, () =>
        prisma.order.create({
          data: testOrderData({
            status: "PENDING_PAYMENT",
            quantity: 1,
            product: { connect: { id: product.id } },
          }),
        }),
      ),
    );

    const [orderOutcomes, inlineResults] = await Promise.all([
      Promise.all(
        orders.map((order) =>
          prisma.$transaction((tx) =>
            applyPaymentSuccess(tx, order.orderNumber, "PAYMENT_PROVIDER"),
          ),
        ),
      ),
      Promise.all(
        Array.from({ length: INLINE_CALLS }, () =>
          setProductStock({
            productId: product.id,
            expectedQuantity: OPENING,
            targetQuantity: OPENING + 5,
            note: "concurrent recount",
          }),
        ),
      ),
    ]);

    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { id: product.id } });
    expect(level.quantity).toBeGreaterThanOrEqual(0);

    const changes = await prisma.stockChange.findMany({
      where: { productId: product.id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(changes.reduce((sum, c) => sum + c.delta, 0)).toBe(level.quantity - OPENING);
    expect(changes.every((c) => c.resultingQuantity >= 0)).toBe(true);

    const manual = changes.filter((c) => c.reason === "MANUAL_ADJUSTMENT");
    expect(manual.every((c) => c.delta === 5 && c.resultingQuantity === OPENING + 5)).toBe(true);
    const inlineOk = inlineResults.filter((r) => r.ok);
    expect(manual).toHaveLength(inlineOk.length);
    for (const r of inlineResults) {
      if (!r.ok) expect(r.errorKey).toBe("errors.stockChanged");
    }

    const appliedOrders = orders.filter((_, i) => orderOutcomes[i].kind === "APPLIED");
    for (const order of appliedOrders) {
      const rows = changes.filter((c) => c.orderId === order.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ reason: "ORDER_PAID", delta: -1 });
    }
  });
});
