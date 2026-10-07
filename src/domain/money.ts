/** Whole Indonesian Rupiah. Never a float, never a string (Principle IV, FR-006). */
export type IDR = number;

const formatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Renders `169999` as `"Rp 169.999"` — the ONLY place money becomes a string.
 * Produces the same output regardless of the active UI locale: the currency
 * is Indonesian Rupiah regardless of which language the reader uses (R-016).
 */
export function formatIDR(amount: IDR): string {
  // Intl.NumberFormat('id-ID', ...) renders "Rp169.999" (no space). Normalise
  // to a single space after "Rp" to match the fixed display format (FR-006).
  return formatter.format(amount).replace(/^Rp\s?/, "Rp ");
}

const compactFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * Renders `12345678` as `"Rp 12,3 jt"` — for chart axes and stat tiles, where
 * the full figure would overflow its box on a phone. The unit suffixes come
 * from Intl's Indonesian data (rb/jt/M), not from a hand-written table, so
 * this stays a formatting concern and never a translation one.
 *
 * Lives beside formatIDR so money still becomes a string in exactly one module
 * (Principle IV). Anywhere the exact Rupiah figure matters, use formatIDR.
 */
export function formatIDRCompact(amount: IDR): string {
  return compactFormatter.format(amount).replace(/^Rp\s?/, "Rp ");
}
