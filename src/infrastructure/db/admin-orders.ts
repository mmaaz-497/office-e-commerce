import { prisma } from "./prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { normalizePhone } from "@/domain/phone";
import { allowedAdminActions } from "@/domain/order/cancellation";
import { wibDayBoundsUtc, wibDayStartUtc } from "@/domain/time";
import type { AdminAction, OrderStatus, PaymentMethod } from "@/domain/order/status";

/**
 * How far back the list reaches. The dashboard counts "Today's Orders" by WIB
 * calendar day, so the list has to be able to scope to the same day — a card
 * reading 4 that links to a list of 41 looks like a broken filter.
 */
export const ORDER_LIST_PERIODS = ["today", "7d", "30d"] as const;
export type OrderListPeriod = (typeof ORDER_LIST_PERIODS)[number];

export function asOrderListPeriod(value: string | undefined): OrderListPeriod | undefined {
  return (ORDER_LIST_PERIODS as readonly string[]).includes(value ?? "")
    ? (value as OrderListPeriod)
    : undefined;
}

/** The UTC instant a period opens at, on WIB calendar-day boundaries. */
function periodStart(period: OrderListPeriod, now = new Date()): Date {
  if (period === "today") return wibDayBoundsUtc(now).start;
  return wibDayStartUtc(period === "7d" ? 6 : 29, now);
}

export type OrderListFilters = {
  status?: OrderStatus;
  paymentMethod?: PaymentMethod;
  search?: string;
  period?: OrderListPeriod;
};

export type OrderListRow = {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  customerName: string;
  totalIDR: number;
  createdAt: Date;
};

/** FR-058: filter by status and payment method; search by order number or
 * phone (matched via phoneNormalized so any input format finds the order).
 * `period` additionally scopes to a WIB calendar-day window. */
export async function getOrderList(filters: OrderListFilters): Promise<OrderListRow[]> {
  await requireAdminSession();

  const search = filters.search?.trim();

  return prisma.order.findMany({
    where: {
      status: filters.status,
      paymentMethod: filters.paymentMethod,
      ...(filters.period ? { createdAt: { gte: periodStart(filters.period) } } : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: "insensitive" } },
              { phoneNormalized: normalizePhone(search) },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      orderNumber: true,
      status: true,
      paymentMethod: true,
      customerName: true,
      totalIDR: true,
      createdAt: true,
    },
  });
}

/** FR-059: the full order, its stored snapshot (never recomputed), the
 * status timeline, any cancellation request, and only the actions legal
 * right now. Returns null when the order does not exist. */
export async function getOrderDetailData(orderNumber: string) {
  await requireAdminSession();

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      statusEvents: { orderBy: { createdAt: "asc" } },
      cancellationRequest: true,
    },
  });
  if (!order) return null;

  return {
    order,
    allowedActions: allowedAdminActions(order.status) as AdminAction[],
  };
}
