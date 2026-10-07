/** Dashboard-only arithmetic. Anything an order screen also needs lives in
 * `@/components/admin/status-tone`. */

/** Whole percent of `part` in `total`; 0 when there is no total to divide by. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export type Delta = { direction: "up" | "down" | "flat" | "none"; percent: number };

/**
 * Period-on-period change. `none` when the earlier period was empty: a jump
 * from nothing to something has no percentage, and rendering "+100%" for the
 * store's first sale of the week would be an invented figure.
 */
export function delta(current: number, previous: number): Delta {
  if (previous === 0) return { direction: current === 0 ? "flat" : "none", percent: 0 };
  const change = ((current - previous) / previous) * 100;
  const percent = Math.abs(Math.round(change));
  if (percent === 0) return { direction: "flat", percent: 0 };
  return { direction: change > 0 ? "up" : "down", percent };
}
