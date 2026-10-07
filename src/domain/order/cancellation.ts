import type { AdminAction, OrderStatus, PaymentMethod } from "./status";

export type CancellationRight = "CANCEL_DIRECTLY" | "REQUEST_ONLY" | "NONE";

const TERMINAL_OR_SHIPPED: readonly OrderStatus[] = [
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "RETURNED",
];

/**
 * Customer self-service cancellation rights (FR-043, FR-044, FR-045). Status
 * already disambiguates payment method in this lifecycle (PENDING_PAYMENT and
 * PAID are online-only; COD_PENDING and CONFIRMED are COD-only) — an
 * inconsistent (status, paymentMethod) pairing that should never occur in
 * practice fails safe to NONE rather than granting a right for a state that
 * shouldn't exist.
 */
export function customerCancellationRight(
  status: OrderStatus,
  paymentMethod: PaymentMethod,
): CancellationRight {
  if (TERMINAL_OR_SHIPPED.includes(status)) {
    return "NONE";
  }

  if (paymentMethod === "ONLINE") {
    if (status === "PENDING_PAYMENT") return "CANCEL_DIRECTLY";
    if (status === "PAID") return "REQUEST_ONLY";
    return "NONE";
  }

  // COD
  if (status === "COD_PENDING" || status === "CONFIRMED") return "CANCEL_DIRECTLY";
  return "NONE";
}

/**
 * Which admin actions apply to a status (FR-060, FR-061). The UI may offer
 * only these; the server re-checks independently regardless of what the UI
 * offered. A PAID order's only path to CANCELLED is APPROVE_CANCELLATION —
 * deliberately no bare CANCEL here, since FR-044 requires a paid order's
 * cancellation to go through the request/approval workflow, never a direct
 * owner cancel that would bypass it.
 */
export function allowedAdminActions(status: OrderStatus): readonly AdminAction[] {
  switch (status) {
    case "PENDING_PAYMENT":
      return ["CANCEL"];
    case "PAID":
      return ["MARK_SHIPPED", "APPROVE_CANCELLATION", "REJECT_CANCELLATION"];
    case "COD_PENDING":
      return ["CONFIRM_COD", "CANCEL"];
    case "CONFIRMED":
      return ["MARK_SHIPPED", "CANCEL"];
    case "SHIPPED":
      return ["MARK_COMPLETED", "MARK_RETURNED"];
    case "COMPLETED":
      return ["MARK_RETURNED"];
    case "CANCELLED":
    case "EXPIRED":
    case "RETURNED":
      return [];
  }
}
