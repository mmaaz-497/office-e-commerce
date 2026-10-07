import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { wibDayKey, wibDayStartUtc } from "@/domain/time";
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

const HOUR_MS = 60 * 60 * 1000;

/** A deterministic instant inside the WIB day `daysAgo` days back. */
function insideWibDay(daysAgo: number, hourOffset = 1): Date {
  return new Date(wibDayStartUtc(daysAgo).getTime() + hourOffset * HOUR_MS);
}

/**
 * Creates an order and, optionally, the status event that made it PAID or
 * CONFIRMED — the dashboard recognises revenue from those events, not from the
 * order's own createdAt, so an order paid a day after it was placed must count
 * on the day the money arrived.
 */
async function seedOrder(data: {
  orderNumber: string;
  status: Parameters<typeof testOrderData>[0] extends never ? never : string;
  createdAt: Date;
  totalIDR?: number;
  quantity?: number;
  paymentMethod?: "ONLINE" | "COD";
  revenueEventAt?: Date;
  revenueStatus?: "PAID" | "CONFIRMED";
  expiresAt?: Date;
  updatedAt?: Date;
}) {
  const order = await prisma.order.create({
    data: testOrderData({
      orderNumber: data.orderNumber,
      status: data.status as never,
      paymentMethod: data.paymentMethod ?? "ONLINE",
      createdAt: data.createdAt,
      totalIDR: data.totalIDR ?? 184999,
      quantity: data.quantity ?? 1,
      expiresAt: data.expiresAt,
    }),
  });

  if (data.revenueEventAt && data.revenueStatus) {
    await prisma.orderStatusEvent.create({
      data: {
        orderId: order.id,
        fromStatus: data.revenueStatus === "PAID" ? "PENDING_PAYMENT" : "COD_PENDING",
        toStatus: data.revenueStatus,
        actor: data.revenueStatus === "PAID" ? "PAYMENT_PROVIDER" : "OWNER",
        createdAt: data.revenueEventAt,
      },
    });
  }

  // updatedAt is @updatedAt, so Prisma overwrites it on create; the stale-
  // fulfilment panel keys off it and needs it pushed back explicitly.
  if (data.updatedAt) {
    await prisma.$executeRaw`UPDATE "Order" SET "updatedAt" = ${data.updatedAt} WHERE "id" = ${order.id}`;
  }
  return order;
}

/**
 * SC: every figure the dashboard renders is aggregated from real rows. These
 * tests exist because a metric that silently drifts — a revenue total that
 * double-counts, a "today" bucket that uses the server's timezone instead of
 * WIB — still renders a plausible-looking number, which no smoke test catches.
 */
describe("admin dashboard metrics (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
    cookieStore.clear();
  });

  it("buckets today and yesterday by WIB calendar day, not by the server's timezone", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(20);

    await seedOrder({
      orderNumber: "TKS-DASH01-00001",
      status: "PAID",
      createdAt: insideWibDay(0),
      totalIDR: 200_000,
      quantity: 2,
      revenueEventAt: insideWibDay(0),
      revenueStatus: "PAID",
    });
    await seedOrder({
      orderNumber: "TKS-DASH01-00002",
      status: "COD_PENDING",
      paymentMethod: "COD",
      createdAt: insideWibDay(0, 2),
    });
    await seedOrder({
      orderNumber: "TKS-DASH01-00003",
      status: "CONFIRMED",
      paymentMethod: "COD",
      createdAt: insideWibDay(1, 12),
      totalIDR: 150_000,
      quantity: 3,
      revenueEventAt: insideWibDay(1, 12),
      revenueStatus: "CONFIRMED",
    });

    const data = await getDashboardData({ range: 7 });

    expect(data.today.orders).toBe(2);
    expect(data.today.paidOrders).toBe(1);
    expect(data.today.revenueIDR).toBe(200_000);
    expect(data.today.unitsSold).toBe(2);

    expect(data.yesterday.orders).toBe(1);
    expect(data.yesterday.revenueIDR).toBe(150_000);
    expect(data.yesterday.unitsSold).toBe(3);

    // The legacy contract the order-journey test asserts on is unchanged.
    expect(data.todayOrderCount).toBe(2);
    expect(data.codAwaitingConfirmation).toBe(1);
    expect(data.awaitingShipment).toBe(2);
    expect(data.currentStock).toBe(20);
    expect(data.conflicts).toEqual([]);
  });

  it("recognises revenue on the day payment arrived, not the day the order was placed", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);

    await seedOrder({
      orderNumber: "TKS-DASH02-00001",
      status: "PAID",
      createdAt: insideWibDay(1, 20),
      totalIDR: 99_000,
      revenueEventAt: insideWibDay(0),
      revenueStatus: "PAID",
    });

    const data = await getDashboardData({ range: 7 });

    expect(data.yesterday.orders).toBe(1);
    expect(data.yesterday.revenueIDR).toBe(0);
    expect(data.today.orders).toBe(0);
    expect(data.today.revenueIDR).toBe(99_000);
    expect(data.period.revenueIDR).toBe(99_000);
    // The order was created yesterday and did reach PAID, so it counts once.
    expect(data.period.createdThatWerePaid).toBe(1);
  });

  it("the daily series covers exactly the requested range and totals to the period", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);

    await seedOrder({
      orderNumber: "TKS-DASH03-00001",
      status: "COMPLETED",
      createdAt: insideWibDay(3, 12),
      totalIDR: 100_000,
      revenueEventAt: insideWibDay(3, 12),
      revenueStatus: "PAID",
    });
    await seedOrder({
      orderNumber: "TKS-DASH03-00002",
      status: "COMPLETED",
      createdAt: insideWibDay(40, 12),
      totalIDR: 500_000,
      revenueEventAt: insideWibDay(40, 12),
      revenueStatus: "PAID",
    });

    const week = await getDashboardData({ range: 7 });
    expect(week.period.series).toHaveLength(7);
    expect(week.period.series.at(-1)!.day).toBe(wibDayKey(new Date()));
    expect(week.period.series[0].day).toBe(wibDayKey(wibDayStartUtc(6)));
    expect(week.period.orders).toBe(1);
    expect(week.period.revenueIDR).toBe(100_000);
    expect(week.period.series.reduce((sum, p) => sum + p.revenueIDR, 0)).toBe(100_000);

    const quarter = await getDashboardData({ range: 90 });
    expect(quarter.period.series).toHaveLength(90);
    expect(quarter.period.orders).toBe(2);
    expect(quarter.period.revenueIDR).toBe(600_000);

    // Both orders are lifetime, whichever range is selected.
    expect(quarter.lifetime.orders).toBe(2);
    expect(week.lifetime.orders).toBe(2);
  });

  it("breaks the period down by status and payment method, and never double-counts", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);

    await seedOrder({
      orderNumber: "TKS-DASH04-00001",
      status: "SHIPPED",
      paymentMethod: "COD",
      createdAt: insideWibDay(2, 12),
      revenueEventAt: insideWibDay(2, 12),
      revenueStatus: "CONFIRMED",
    });
    await seedOrder({
      orderNumber: "TKS-DASH04-00002",
      status: "SHIPPED",
      paymentMethod: "ONLINE",
      createdAt: insideWibDay(2, 13),
      revenueEventAt: insideWibDay(2, 13),
      revenueStatus: "PAID",
    });
    await seedOrder({
      orderNumber: "TKS-DASH04-00003",
      status: "EXPIRED",
      paymentMethod: "ONLINE",
      createdAt: insideWibDay(2, 14),
    });

    const data = await getDashboardData({ range: 30 });

    expect(data.period.statusBreakdown).toEqual([
      { status: "SHIPPED", count: 2 },
      { status: "EXPIRED", count: 1 },
    ]);
    expect(data.period.paymentMix).toEqual([
      { paymentMethod: "ONLINE", count: 2 },
      { paymentMethod: "COD", count: 1 },
    ]);
    expect(data.period.orders).toBe(3);
    expect(data.period.paidOrders).toBe(2);
    expect(data.period.createdThatWerePaid).toBe(2);
  });

  it("values every open stage from the frozen order snapshot", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);

    await seedOrder({
      orderNumber: "TKS-DASH05-00001",
      status: "PENDING_PAYMENT",
      createdAt: insideWibDay(0),
      totalIDR: 111_000,
    });
    await seedOrder({
      orderNumber: "TKS-DASH05-00002",
      status: "PENDING_PAYMENT",
      createdAt: insideWibDay(0, 2),
      totalIDR: 222_000,
    });
    await seedOrder({
      orderNumber: "TKS-DASH05-00003",
      status: "SHIPPED",
      createdAt: insideWibDay(0, 3),
      totalIDR: 333_000,
    });

    const data = await getDashboardData();
    const stage = (status: string) => data.openStages.find((s) => s.status === status)!;

    expect(stage("PENDING_PAYMENT")).toEqual({
      status: "PENDING_PAYMENT",
      count: 2,
      valueIDR: 333_000,
    });
    expect(stage("SHIPPED")).toEqual({ status: "SHIPPED", count: 1, valueIDR: 333_000 });
    expect(stage("CONFIRMED")).toEqual({ status: "CONFIRMED", count: 0, valueIDR: 0 });
  });

  it("surfaces unpaid orders near expiry, orders stuck awaiting shipment, and open cancellations", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);
    const now = Date.now();

    await seedOrder({
      orderNumber: "TKS-DASH06-00001",
      status: "PENDING_PAYMENT",
      createdAt: new Date(now - 20 * HOUR_MS),
      expiresAt: new Date(now + 2 * HOUR_MS),
    });
    await seedOrder({
      orderNumber: "TKS-DASH06-00002",
      status: "PENDING_PAYMENT",
      createdAt: new Date(now - 2 * HOUR_MS),
      expiresAt: new Date(now + 22 * HOUR_MS),
    });
    const stuck = await seedOrder({
      orderNumber: "TKS-DASH06-00003",
      status: "PAID",
      createdAt: new Date(now - 72 * HOUR_MS),
      updatedAt: new Date(now - 72 * HOUR_MS),
    });
    await seedOrder({
      orderNumber: "TKS-DASH06-00004",
      status: "PAID",
      createdAt: new Date(now - 1 * HOUR_MS),
    });
    await prisma.cancellationRequest.create({
      data: { orderId: stuck.id, reason: "Changed my mind", resolution: "OPEN" },
    });

    const data = await getDashboardData();

    expect(data.attention.expiringSoon.map((o) => o.orderNumber)).toEqual(["TKS-DASH06-00001"]);
    expect(data.attention.staleFulfilment.map((o) => o.orderNumber)).toEqual(["TKS-DASH06-00003"]);
    expect(data.attention.openCancellations).toHaveLength(1);
    expect(data.attention.openCancellations[0]).toMatchObject({
      orderNumber: "TKS-DASH06-00003",
      reason: "Changed my mind",
      status: "PAID",
    });
    expect(data.attention.outOfStock).toBe(false);
  });

  it("counts unpublished reviews and reports an empty store as zero rather than as a gap", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");

    const empty = await getDashboardData();
    expect(empty.period.orders).toBe(0);
    expect(empty.period.revenueIDR).toBe(0);
    expect(empty.period.statusBreakdown).toEqual([]);
    expect(empty.recentOrders).toEqual([]);
    expect(empty.recentActivity).toEqual([]);
    expect(empty.attention.unpublishedReviews).toBe(0);
    expect(empty.currentStock).toBe(0);
    expect(empty.attention.outOfStock).toBe(true);
    // No sales means no demand rate, so cover days is withheld, not shown as 0.
    expect(empty.dailyUnitsSold).toBeNull();
    expect(empty.stockCoverDays).toBeNull();

    await prisma.review.createMany({
      data: [
        {
          origin: "OWNER_ENTERED",
          rating: 5,
          reviewerName: "A",
          published: false,
          reviewedAt: new Date(),
        },
        {
          origin: "OWNER_ENTERED",
          rating: 4,
          reviewerName: "B",
          published: true,
          reviewedAt: new Date(),
        },
      ],
    });
    expect((await getDashboardData()).attention.unpublishedReviews).toBe(1);
  });

  it("derives stock cover from units actually committed over the period", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(14);

    await seedOrder({
      orderNumber: "TKS-DASH08-00001",
      status: "PAID",
      createdAt: insideWibDay(1, 12),
      quantity: 7,
      revenueEventAt: insideWibDay(1, 12),
      revenueStatus: "PAID",
    });

    const data = await getDashboardData({ range: 7 });
    expect(data.period.unitsSold).toBe(7);
    expect(data.dailyUnitsSold).toBe(1);
    expect(data.stockCoverDays).toBe(14);
  });

  it("reports the newest status events as the activity feed", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await seedStockLevel(5);

    await seedOrder({
      orderNumber: "TKS-DASH09-00001",
      status: "PAID",
      createdAt: insideWibDay(0),
      revenueEventAt: insideWibDay(0, 3),
      revenueStatus: "PAID",
    });

    const data = await getDashboardData();
    expect(data.recentActivity).toHaveLength(1);
    expect(data.recentActivity[0]).toMatchObject({
      orderNumber: "TKS-DASH09-00001",
      fromStatus: "PENDING_PAYMENT",
      toStatus: "PAID",
      actor: "PAYMENT_PROVIDER",
    });
    expect(data.recentOrders.map((o) => o.orderNumber)).toEqual(["TKS-DASH09-00001"]);
  });

  it("falls back to the default range for anything the URL might carry", async () => {
    const { asDashboardRange, DEFAULT_DASHBOARD_RANGE } =
      await import("@/infrastructure/db/admin-dashboard");

    expect(asDashboardRange("7")).toBe(7);
    expect(asDashboardRange("90")).toBe(90);
    expect(asDashboardRange(undefined)).toBe(DEFAULT_DASHBOARD_RANGE);
    expect(asDashboardRange("365")).toBe(DEFAULT_DASHBOARD_RANGE);
    expect(asDashboardRange("-1")).toBe(DEFAULT_DASHBOARD_RANGE);
    expect(asDashboardRange("nonsense")).toBe(DEFAULT_DASHBOARD_RANGE);
  });
});
