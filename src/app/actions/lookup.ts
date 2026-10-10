"use server";

import { prisma } from "@/infrastructure/db/prisma";
import { checkAndExpireOrRescue } from "@/infrastructure/db/order-transaction";
import { MidtransProvider } from "@/infrastructure/payment/midtrans-provider";
import { checkRateLimit } from "@/infrastructure/rate-limit/pg-rate-limiter";
import { getClientIdentifier } from "@/infrastructure/http/client-identifier";
import { normalizePhone } from "@/domain/phone";
import { OrderLookupFailedError } from "@/domain/errors";
import type { Actor, OrderStatus, PaymentMethod } from "@/domain/order/status";
import { lookupOrderInputSchema } from "./schemas/lookup";
import { toErrorResult } from "./result";

const LOOKUP_RATE_LIMIT = 10;
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;

export type LookupOrderView = {
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  quantity: number;
  unitPriceIDR: number;
  shippingCostIDR: number;
  totalIDR: number;
  trackingNumber: string | null;
  createdAt: Date;
  timeline: Array<{
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: Actor;
    createdAt: Date;
  }>;
};

export type LookupOrderResult =
  { ok: true; order: LookupOrderView } | { ok: false; errorKey: string };

const ORDER_LOOKUP_INCLUDE = { statusEvents: { orderBy: { createdAt: "asc" as const } } };

type OrderWithEvents = Awaited<ReturnType<typeof findOrder>>;

function findOrder(where: { orderNumber: string; phoneNormalized: string } | { id: string }) {
  return prisma.order.findFirst({ where, include: ORDER_LOOKUP_INCLUDE });
}

function toLookupView(order: NonNullable<OrderWithEvents>): LookupOrderView {
  return {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    status: order.status,
    paymentMethod: order.paymentMethod,
    quantity: order.quantity,
    unitPriceIDR: order.unitPriceIDR,
    shippingCostIDR: order.shippingCostIDR,
    totalIDR: order.totalIDR,
    trackingNumber: order.trackingNumber,
    createdAt: order.createdAt,
    timeline: order.statusEvents.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor,
      createdAt: event.createdAt,
    })),
  };
}

/**
 * Requires order number + phone; matches both in a single query so an
 * unknown order number and a correctly-formatted order number with the
 * wrong phone take the identical code path and therefore comparable timing
 * (FR-038, FR-039, FR-040) — never a "does this order exist" check followed
 * by a separate phone check, which would let timing distinguish the two.
 */
export async function lookupOrder(rawInput: unknown): Promise<LookupOrderResult> {
  try {
    await checkRateLimit({
      bucket: "ORDER_LOOKUP",
      identifierRaw: await getClientIdentifier(),
      limit: LOOKUP_RATE_LIMIT,
      windowMs: LOOKUP_WINDOW_MS,
    });
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = lookupOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }
  const { orderNumber, phone } = parsed.data;
  const phoneNormalized = normalizePhone(phone);

  const order = await findOrder({ orderNumber, phoneNormalized });
  if (!order) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }

  // T078: lazy expiry evaluation on read — this is the read path it exists
  // for. A PENDING_PAYMENT order read past its deadline is settled through
  // the identical expire-or-rescue path the cron job uses (research R-009)
  // before the customer ever sees a stale status.
  if (order.status === "PENDING_PAYMENT" && order.expiresAt && order.expiresAt <= new Date()) {
    await checkAndExpireOrRescue(order.orderNumber, new MidtransProvider());
    const refreshed = await findOrder({ id: order.id });
    return { ok: true, order: toLookupView(refreshed!) };
  }

  return { ok: true, order: toLookupView(order) };
}
