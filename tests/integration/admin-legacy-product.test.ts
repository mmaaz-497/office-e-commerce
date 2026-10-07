import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { SOLD_COUNT_BASELINE_KEY } from "@/domain/settings";
import { resetDb, seedProduct, seedStockLevel, testOrderData } from "./helpers/db";

/**
 * T041 — the owner's admin area acts on the catalogue's legacy product (003
 * US4): manual stock moves, owner and verified reviews, and the sold-count
 * baseline are attributed to it, and the out-of-stock alert covers every
 * ACTIVE product.
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
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.41" }),
}));

const RAW_PHONE = "081234567890";

async function legacyProduct() {
  return prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });
}

describe("admin acts on the legacy product (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("adjustStock writes a ledger row with the legacy productId", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");

    const result = await adjustStock({ delta: 5, note: "Restock dari pemasok" });

    expect(result).toEqual({ ok: true, quantity: 15 });
    const change = await prisma.stockChange.findFirstOrThrow({
      where: { reason: "MANUAL_ADJUSTMENT" },
    });
    expect(change.productId).toBe((await legacyProduct()).id);
  });

  it("addOwnerReview attaches the review to the legacy product", async () => {
    const { addOwnerReview } = await import("@/app/actions/admin/reviews");

    const result = await addOwnerReview({
      rating: 5,
      comment: "Nyaman dipakai seharian.",
      reviewerName: "Bu Rina",
      reviewedAt: new Date("2026-09-01T00:00:00Z"),
    });

    expect(result).toEqual({ ok: true });
    const review = await prisma.review.findFirstOrThrow({ where: { origin: "OWNER_ENTERED" } });
    expect(review.productId).toBe((await legacyProduct()).id);
  });

  it("a verified review takes the order's productId", async () => {
    const b = await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 3 });
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-261004-AMP01",
        status: "COMPLETED",
        phone: RAW_PHONE,
        phoneNormalized: "+6281234567890",
        product: { connect: { id: b.id } },
      }),
    });
    const { submitReview } = await import("@/app/actions/review");

    const result = await submitReview({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      rating: 4,
      comment: "Bagus.",
      reviewerName: "Sari W.",
    });

    expect(result).toEqual({ ok: true });
    const review = await prisma.review.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(review.productId).toBe(b.id);
  });

  it("setSoldCountBaseline writes the legacy product's baseline and leaves the Setting row alone", async () => {
    await prisma.setting.create({ data: { key: SOLD_COUNT_BASELINE_KEY, value: "7" } });
    const { setSoldCountBaseline } = await import("@/app/actions/admin/settings");
    const { getSoldCountBaseline } = await import("@/infrastructure/db/admin-settings");

    const result = await setSoldCountBaseline({ baseline: 25 });

    expect(result).toEqual({ ok: true });
    expect((await legacyProduct()).soldCountBaseline).toBe(25);
    const setting = await prisma.setting.findUniqueOrThrow({
      where: { key: SOLD_COUNT_BASELINE_KEY },
    });
    expect(setting.value).toBe("7");
    expect(await getSoldCountBaseline()).toBe(25);
  });

  it("outOfStock is true when any ACTIVE product is at 0", async () => {
    await prisma.stockLevel.update({ where: { id: "default" }, data: { quantity: 5 } });
    await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 0 });
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");

    const data = await getDashboardData();

    expect(data.attention.outOfStock).toBe(true);
    expect(data.currentStock).toBe(5);
  });

  it("outOfStock is false when every ACTIVE product has stock", async () => {
    await prisma.stockLevel.update({ where: { id: "default" }, data: { quantity: 5 } });
    await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 2 });
    // A product that is not for sale does not raise the alert, stock or not.
    await seedProduct({ slug: "segera-hadir", status: "COMING_SOON", priceIDR: null });
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");

    const data = await getDashboardData();

    expect(data.attention.outOfStock).toBe(false);
    expect(data.currentStock).toBe(7);
  });

  it("outOfStock is true when no product is ACTIVE at all", async () => {
    await prisma.product.update({ where: { slug: "slippers-gemoy" }, data: { status: "DRAFT" } });
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");

    const data = await getDashboardData();

    expect(data.attention.outOfStock).toBe(true);
    expect(data.currentStock).toBe(0);
  });
});
