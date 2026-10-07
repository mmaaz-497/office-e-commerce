import { InvalidTransitionError } from "../errors";
import type { OrderStatus, PaymentMethod } from "./status";

export type { OrderStatus, PaymentMethod, Actor, AdminAction } from "./status";

/**
 * The closed transition set — exactly FR-024. This is the only place in the
 * codebase authorised to decide whether a status change is legal; every
 * mutation path (customer action, admin action, Midtrans webhook, expiry job)
 * calls assertTransition, never checks status inline (ADR-0001).
 */
export const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = Object.freeze({
  PENDING_PAYMENT: ["PAID", "EXPIRED", "CANCELLED"],
  PAID: ["SHIPPED", "CANCELLED"],
  COD_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["COMPLETED", "RETURNED"],
  COMPLETED: ["RETURNED"],
  CANCELLED: [],
  EXPIRED: [],
  RETURNED: [],
});

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Throws InvalidTransitionError when the transition is not permitted. Callers
 * MUST pass the status read inside the same database transaction that
 * performs the update — never a status carried from a rendered page (R-004).
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

/** The status each payment method is created at (src/app/actions/checkout.ts). */
const INITIAL_STATUS: Readonly<Record<PaymentMethod, OrderStatus>> = {
  ONLINE: "PENDING_PAYMENT",
  COD: "COD_PENDING",
};

/**
 * Every status an order of each payment method can ever hold, walked from its
 * initial status through TRANSITIONS at module load.
 *
 * Derived, never restated: an online order reaches PAID and can EXPIRE, a COD
 * order reaches CONFIRMED and cannot expire because it has no payment window.
 * Writing that set out by hand got EXPIRED wrong on the first attempt, which is
 * the whole argument for deriving it from the graph that decides it.
 */
const REACHABLE_BY_PAYMENT_METHOD: Readonly<Record<PaymentMethod, ReadonlySet<OrderStatus>>> = {
  ONLINE: reachableFrom(INITIAL_STATUS.ONLINE),
  COD: reachableFrom(INITIAL_STATUS.COD),
};

function reachableFrom(start: OrderStatus): ReadonlySet<OrderStatus> {
  const seen = new Set<OrderStatus>([start]);
  const queue: OrderStatus[] = [start];
  while (queue.length > 0) {
    for (const next of TRANSITIONS[queue.shift()!]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/**
 * Whether a status is impossible for a payment method. The admin order list
 * uses it to explain an empty result instead of rendering a blank table: PAID
 * combined with COD can match nothing however much the store has sold, and an
 * operator cannot tell that apart from a broken filter.
 */
export function isUnreachableStatus(status: OrderStatus, paymentMethod: PaymentMethod): boolean {
  return !REACHABLE_BY_PAYMENT_METHOD[paymentMethod].has(status);
}
