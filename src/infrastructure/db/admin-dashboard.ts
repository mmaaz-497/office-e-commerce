import { prisma } from "./prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { wibDayBoundsUtc, wibDayKey, wibDayKeysBack, wibDayStartUtc } from "@/domain/time";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";
import { SALEABLE_STATUSES } from "@/domain/catalogue/status";

/** Ranges the dashboard offers. Anything else in the URL falls back to 30. */
export const DASHBOARD_RANGES = [7, 30, 90] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = 30;

export function asDashboardRange(value: string | undefined): DashboardRange {
  const parsed = Number(value);
  return (DASHBOARD_RANGES as readonly number[]).includes(parsed)
    ? (parsed as DashboardRange)
    : DEFAULT_DASHBOARD_RANGE;
}

/**
 * An order counts as revenue the moment it reaches PAID (online) or CONFIRMED
 * (COD) — the two statuses at which money is actually owed and stock is
 * committed (Principle VI). The two are mutually exclusive for any one order:
 * TRANSITIONS lets PENDING_PAYMENT reach PAID and COD_PENDING reach CONFIRMED,
 * and neither status can reach the other, so summing over both events cannot
 * double-count an order.
 */
const REVENUE_STATUSES = ["PAID", "CONFIRMED"] as const;

/** How long an order may sit awaiting shipment before the dashboard chases it. */
const STALE_FULFILMENT_HOURS = 48;
/** How close to expiry an unpaid order has to be to be worth chasing. */
const EXPIRING_SOON_HOURS = 6;
/** Longest list any attention or recent panel renders before its "view all" link. */
const PANEL_ROWS = 6;

export type DailyPoint = {
  /** WIB calendar day, `YYYY-MM-DD`. */
  day: string;
  orders: number;
  paidOrders: number;
  revenueIDR: number;
};

export type PeriodTotals = {
  orders: number;
  paidOrders: number;
  revenueIDR: number;
  unitsSold: number;
};

export type OpenStage = {
  status: OrderStatus;
  count: number;
  valueIDR: number;
};

export type DashboardData = {
  /* Unchanged contract: these five are what the original dashboard showed and
     what the admin-auth and order-journey integration tests assert on. */
  todayOrderCount: number;
  codAwaitingConfirmation: number;
  awaitingShipment: number;
  currentStock: number;
  conflicts: Array<{
    orderNumber: string;
    conflictFlag: "PAID_STOCK_UNAVAILABLE" | "PAID_AFTER_EXPIRY";
    conflictDetectedAt: Date;
    totalIDR: number;
  }>;

  /** When the figures were read, so the header can say how fresh they are. */
  generatedAt: Date;
  range: DashboardRange;

  today: PeriodTotals;
  yesterday: PeriodTotals;
  period: PeriodTotals & {
    start: Date;
    series: DailyPoint[];
    /** Orders created in the period, grouped by the status they hold now. */
    statusBreakdown: Array<{ status: OrderStatus; count: number }>;
    paymentMix: Array<{ paymentMethod: PaymentMethod; count: number }>;
    /** Of the orders created in the period, how many ever reached PAID/CONFIRMED. */
    createdThatWerePaid: number;
  };

  /** Every stage an order can sit in while still owing the operator work. */
  openStages: OpenStage[];
  lifetime: { orders: number; completed: number };

  /**
   * Average units committed per day across the period — null when nothing sold,
   * because a cover estimate divided by zero demand is not a number the
   * operator should be shown (Principle VII).
   */
  dailyUnitsSold: number | null;
  stockCoverDays: number | null;

  attention: {
    openCancellations: Array<{
      orderNumber: string;
      status: OrderStatus;
      reason: string | null;
      createdAt: Date;
      totalIDR: number;
    }>;
    expiringSoon: Array<{
      orderNumber: string;
      customerName: string;
      expiresAt: Date;
      totalIDR: number;
    }>;
    staleFulfilment: Array<{
      orderNumber: string;
      status: OrderStatus;
      customerName: string;
      updatedAt: Date;
      totalIDR: number;
    }>;
    unpublishedReviews: number;
    outOfStock: boolean;
  };

  recentOrders: Array<{
    orderNumber: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    customerName: string;
    totalIDR: number;
    createdAt: Date;
  }>;
  recentActivity: Array<{
    id: string;
    orderNumber: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: "CUSTOMER" | "OWNER" | "PAYMENT_PROVIDER" | "SYSTEM";
    createdAt: Date;
  }>;
};

/** A stage is "open" while the operator, the customer or the courier still owes it something. */
const OPEN_STAGE_ORDER: readonly OrderStatus[] = [
  "PENDING_PAYMENT",
  "COD_PENDING",
  "PAID",
  "CONFIRMED",
  "SHIPPED",
];

type DayCountRow = { day: string; orders: bigint };
type DayRevenueRow = { day: string; paidOrders: bigint; revenueIDR: bigint; units: bigint };

/** Postgres COUNT/SUM come back as bigint; every figure here fits a JS number. */
const toNumber = (value: bigint | number | null | undefined) => Number(value ?? 0);

/**
 * FR-057, FR-075, FR-055: the guard is the first thing this route does,
 * independent of middleware. Kept out of page.tsx so it can be imported by
 * tests without pulling in JSX (this project's tsconfig targets "preserve",
 * which the test runner cannot transform).
 *
 * Every figure below is aggregated by the database — thirteen indexed queries
 * issued as a single parallel batch, none of which streams order rows into the
 * process to be counted in JavaScript. The two daily series use raw SQL
 * because bucketing by WIB calendar day means shifting the timestamp before
 * truncating it, which Prisma's `groupBy` cannot express; `to_char(... +
 * interval '7 hours', 'YYYY-MM-DD')` produces exactly the key wibDayKey does.
 */
export async function getDashboardData(
  options: { range?: DashboardRange } = {},
): Promise<DashboardData> {
  await requireAdminSession();

  const range = options.range ?? DEFAULT_DASHBOARD_RANGE;
  const generatedAt = new Date();
  const { start: todayStart, end: todayEnd } = wibDayBoundsUtc(generatedAt);
  const periodStart = wibDayStartUtc(range - 1, generatedAt);
  const staleBefore = new Date(generatedAt.getTime() - STALE_FULFILMENT_HOURS * 3_600_000);
  const expiringBefore = new Date(generatedAt.getTime() + EXPIRING_SOON_HOURS * 3_600_000);

  const [
    lifetimeByStatus,
    periodByStatus,
    dailyOrders,
    dailyRevenue,
    createdThatWerePaid,
    saleableProducts,
    conflicts,
    openCancellations,
    expiringSoon,
    staleFulfilment,
    unpublishedReviews,
    recentOrders,
    recentActivity,
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
      _sum: { totalIDR: true },
    }),
    prisma.order.groupBy({
      by: ["status", "paymentMethod"],
      where: { createdAt: { gte: periodStart, lt: todayEnd } },
      _count: { _all: true },
    }),
    prisma.$queryRaw<DayCountRow[]>`
      SELECT to_char("createdAt" + interval '7 hours', 'YYYY-MM-DD') AS day,
             COUNT(*) AS orders
      FROM "Order"
      WHERE "createdAt" >= ${periodStart} AND "createdAt" < ${todayEnd}
      GROUP BY 1
    `,
    prisma.$queryRaw<DayRevenueRow[]>`
      SELECT to_char(e."createdAt" + interval '7 hours', 'YYYY-MM-DD') AS day,
             COUNT(*) AS "paidOrders",
             COALESCE(SUM(o."totalIDR"), 0) AS "revenueIDR",
             COALESCE(SUM(o."quantity"), 0) AS units
      FROM "OrderStatusEvent" e
      JOIN "Order" o ON o."id" = e."orderId"
      WHERE e."toStatus" IN ('PAID', 'CONFIRMED')
        AND e."createdAt" >= ${periodStart} AND e."createdAt" < ${todayEnd}
      GROUP BY 1
    `,
    prisma.order.count({
      where: {
        createdAt: { gte: periodStart, lt: todayEnd },
        statusEvents: { some: { toStatus: { in: [...REVENUE_STATUSES] } } },
      },
    }),
    // Every product that can be on sale, with its stock row (003 US4).
    prisma.product.findMany({
      where: { status: { in: [...SALEABLE_STATUSES] } },
      select: { stockLevel: { select: { quantity: true } } },
    }),
    prisma.order.findMany({
      where: { conflictFlag: { not: "NONE" } },
      orderBy: { conflictDetectedAt: "desc" },
      select: { orderNumber: true, conflictFlag: true, conflictDetectedAt: true, totalIDR: true },
    }),
    prisma.cancellationRequest.findMany({
      where: { resolution: "OPEN" },
      orderBy: { createdAt: "asc" },
      take: PANEL_ROWS,
      select: {
        reason: true,
        createdAt: true,
        order: { select: { orderNumber: true, status: true, totalIDR: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: "PENDING_PAYMENT", expiresAt: { not: null, lt: expiringBefore } },
      orderBy: { expiresAt: "asc" },
      take: PANEL_ROWS,
      select: { orderNumber: true, customerName: true, expiresAt: true, totalIDR: true },
    }),
    prisma.order.findMany({
      where: { status: { in: ["PAID", "CONFIRMED"] }, updatedAt: { lt: staleBefore } },
      orderBy: { updatedAt: "asc" },
      take: PANEL_ROWS,
      select: {
        orderNumber: true,
        status: true,
        customerName: true,
        updatedAt: true,
        totalIDR: true,
      },
    }),
    prisma.review.count({ where: { published: false } }),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: PANEL_ROWS,
      select: {
        orderNumber: true,
        status: true,
        paymentMethod: true,
        customerName: true,
        totalIDR: true,
        createdAt: true,
      },
    }),
    prisma.orderStatusEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: PANEL_ROWS,
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        actor: true,
        createdAt: true,
        order: { select: { orderNumber: true } },
      },
    }),
  ]);

  const lifetimeCount = (status: OrderStatus) =>
    lifetimeByStatus.find((row) => row.status === status)?._count._all ?? 0;
  const lifetimeValue = (status: OrderStatus) =>
    lifetimeByStatus.find((row) => row.status === status)?._sum.totalIDR ?? 0;

  // The two raw series are keyed by WIB day and read once, so the KPI cards,
  // the trend chart and the period totals cannot disagree about a day.
  const ordersByDay = new Map(dailyOrders.map((row) => [row.day, toNumber(row.orders)]));
  const revenueByDay = new Map(dailyRevenue.map((row) => [row.day, row]));
  const series: DailyPoint[] = wibDayKeysBack(range - 1, generatedAt).map((day) => ({
    day,
    orders: ordersByDay.get(day) ?? 0,
    paidOrders: toNumber(revenueByDay.get(day)?.paidOrders),
    revenueIDR: toNumber(revenueByDay.get(day)?.revenueIDR),
  }));

  const dayTotals = (day: string): PeriodTotals => {
    const point = series.find((entry) => entry.day === day);
    return {
      orders: point?.orders ?? 0,
      paidOrders: point?.paidOrders ?? 0,
      revenueIDR: point?.revenueIDR ?? 0,
      unitsSold: toNumber(revenueByDay.get(day)?.units),
    };
  };

  const today = dayTotals(wibDayKey(todayStart));
  const yesterday = dayTotals(wibDayKey(wibDayStartUtc(1, generatedAt)));

  const periodTotals: PeriodTotals = {
    orders: series.reduce((sum, point) => sum + point.orders, 0),
    paidOrders: series.reduce((sum, point) => sum + point.paidOrders, 0),
    revenueIDR: series.reduce((sum, point) => sum + point.revenueIDR, 0),
    unitsSold: dailyRevenue.reduce((sum, row) => sum + toNumber(row.units), 0),
  };

  const periodStatusTotals = new Map<OrderStatus, number>();
  const periodPaymentTotals = new Map<PaymentMethod, number>();
  for (const row of periodByStatus) {
    const count = row._count._all;
    periodStatusTotals.set(row.status, (periodStatusTotals.get(row.status) ?? 0) + count);
    periodPaymentTotals.set(
      row.paymentMethod,
      (periodPaymentTotals.get(row.paymentMethod) ?? 0) + count,
    );
  }

  // Stock across every ACTIVE product; a missing row is zero stock.
  const stockPerProduct = saleableProducts.map((product) => product.stockLevel?.quantity ?? 0);
  const currentStock = stockPerProduct.reduce((sum, quantity) => sum + quantity, 0);
  // Raised when nothing is for sale at all (the empty store keeps its alert,
  // /sp.analyze H5) or when any ACTIVE product has run out or has no row.
  const outOfStock = stockPerProduct.length === 0 || stockPerProduct.some((q) => q === 0);
  const dailyUnitsSold = periodTotals.unitsSold > 0 ? periodTotals.unitsSold / range : null;

  return {
    todayOrderCount: today.orders,
    codAwaitingConfirmation: lifetimeCount("COD_PENDING"),
    awaitingShipment: lifetimeCount("PAID") + lifetimeCount("CONFIRMED"),
    currentStock,
    conflicts: conflicts as DashboardData["conflicts"],

    generatedAt,
    range,
    today,
    yesterday,
    period: {
      ...periodTotals,
      start: periodStart,
      series,
      statusBreakdown: [...periodStatusTotals.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
      paymentMix: [...periodPaymentTotals.entries()]
        .map(([paymentMethod, count]) => ({ paymentMethod, count }))
        .sort((a, b) => b.count - a.count),
      createdThatWerePaid,
    },

    openStages: OPEN_STAGE_ORDER.map((status) => ({
      status,
      count: lifetimeCount(status),
      valueIDR: lifetimeValue(status),
    })),
    lifetime: {
      orders: lifetimeByStatus.reduce((sum, row) => sum + row._count._all, 0),
      completed: lifetimeCount("COMPLETED"),
    },

    dailyUnitsSold,
    stockCoverDays: dailyUnitsSold === null ? null : currentStock / dailyUnitsSold,

    attention: {
      openCancellations: openCancellations.map((request) => ({
        orderNumber: request.order.orderNumber,
        status: request.order.status,
        reason: request.reason,
        createdAt: request.createdAt,
        totalIDR: request.order.totalIDR,
      })),
      // expiresAt is non-null by the query's own filter; narrowing it here
      // keeps the Date non-nullable for every consumer.
      expiringSoon: expiringSoon.flatMap((order) =>
        order.expiresAt ? [{ ...order, expiresAt: order.expiresAt }] : [],
      ),
      staleFulfilment,
      unpublishedReviews,
      outOfStock,
    },

    recentOrders,
    recentActivity: recentActivity.map((event) => ({
      id: event.id,
      orderNumber: event.order.orderNumber,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor,
      createdAt: event.createdAt,
    })),
  };
}
