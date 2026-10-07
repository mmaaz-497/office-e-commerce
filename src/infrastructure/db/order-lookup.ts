import { prisma } from "./prisma";
import { normalizePhone } from "@/domain/phone";

/**
 * The base credential-matched lookup shared by every customer-facing action
 * gated on order number + phone (order lookup, cancellation, review
 * submission) — one query shape everywhere, so "wrong phone" and "unknown
 * order number" always take an identical code path (FR-040).
 */
export function findOrderByCredentials(orderNumber: string, phone: string) {
  return prisma.order.findFirst({
    where: { orderNumber, phoneNormalized: normalizePhone(phone) },
  });
}
