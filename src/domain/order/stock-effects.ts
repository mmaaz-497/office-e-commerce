import type { OrderStatus } from "./status";

export type StockEffect = "DECREMENT" | "RESTORE_IF_DECREMENTED" | "NONE";

const RESTORING_TARGETS: readonly OrderStatus[] = ["CANCELLED", "EXPIRED", "RETURNED"];

/**
 * What a given transition does to stock (Principle VI, ADR-0001). Online
 * orders decrement on -> PAID; COD orders decrement on -> CONFIRMED, since
 * that is the point each payment method's commitment becomes real. Every
 * terminal transition restores, but only if the order actually decremented
 * — an order that expired before payment never took stock, so restoring it
 * would double-credit. The caller checks stockDecremented; this function
 * only says which effect applies when it did.
 */
export function stockEffectOf(from: OrderStatus, to: OrderStatus): StockEffect {
  if (to === "PAID" || to === "CONFIRMED") {
    return "DECREMENT";
  }
  if (RESTORING_TARGETS.includes(to)) {
    return "RESTORE_IF_DECREMENTED";
  }
  return "NONE";
}
