/** The one owner-editable operational Setting key (FR-063) — shared so the
 * production seed, the sold-count calculation, and the admin action that
 * writes it can never drift into three different string literals.
 *
 * Since 003 the baseline lives on the product (spec Assumptions): this key is
 * import-only. The production seed still opens it at 0 and the catalogue
 * import copies it onto the product it creates; nothing at runtime reads or
 * writes it any more. */
export const SOLD_COUNT_BASELINE_KEY = "SOLD_COUNT_BASELINE";
