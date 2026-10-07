/**
 * The buy box's quantity cap and stock badge (007 data-model.md
 * §purchase-limits, research R-703).
 *
 * The cap is a convenience for the shopper, never the guard: checkout
 * re-checks stock inside its own transaction (Constitution VI). The maximum of
 * 10 mirrors the checkout schema (src/app/actions/schemas.ts, `quantity`),
 * which this feature deliberately leaves untouched.
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export const MAX_ORDER_QUANTITY = 10;

/** Matches the Design System's warning badge rule: "Sisa N" at stock ≤ 5. */
export const LOW_STOCK_THRESHOLD = 5;

/** The most a shopper may pick: the lower of 10 and current stock, never negative. */
export function maxOrderQuantity(stock: number): number {
  if (!Number.isFinite(stock)) return 0;
  return Math.min(MAX_ORDER_QUANTITY, Math.max(0, Math.trunc(stock)));
}

export type StockBadgeState =
  { kind: "inStock" } | { kind: "low"; remaining: number } | { kind: "out" };

export function stockBadge(stock: number): StockBadgeState {
  if (stock <= 0) return { kind: "out" };
  if (stock <= LOW_STOCK_THRESHOLD) return { kind: "low", remaining: stock };
  return { kind: "inStock" };
}
