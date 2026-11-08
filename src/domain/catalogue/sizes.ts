/**
 * Product sizes: the list a product offers and the one a customer chose.
 * Pure rules shared by the admin form (client), productInputSchema, the
 * checkout page and the checkout action, so the picker, the form and the
 * server can never disagree about what a valid size is.
 *
 * A size is a short label ("38", "M", "38/39"). Stock is per product, not per
 * size, so a size never changes price or availability.
 */

export const SIZE_PATTERN = /^[0-9A-Za-z]+([./-][0-9A-Za-z]+)*$/;
export const MAX_SIZE_LENGTH = 10;
export const MAX_SIZES = 20;

/** "36, 38 ,40,,42" → ["36","38","40","42"]: what the admin types becomes the stored list. */
export function parseSizeList(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function formatSizeList(sizes: readonly string[]): string {
  return sizes.join(", ");
}

export type SizeChoice =
  | { kind: "ok"; size: string | null }
  | { kind: "required" }
  | { kind: "unavailable" };

/**
 * The size an order may record. A product that offers sizes needs one of
 * them; a product that offers none takes no size. Matching is exact: the
 * stored label is what ships, so "38" and " 38" are not silently merged.
 */
export function resolveSizeChoice(
  offered: readonly string[],
  requested: string | null | undefined,
): SizeChoice {
  const chosen = requested ?? null;
  if (offered.length === 0) {
    return chosen === null ? { kind: "ok", size: null } : { kind: "unavailable" };
  }
  if (chosen === null || chosen === "") return { kind: "required" };
  return offered.includes(chosen) ? { kind: "ok", size: chosen } : { kind: "unavailable" };
}

/** A ?size= value from a URL, kept only when the product offers it. */
export function preselectedSize(
  offered: readonly string[],
  param: string | string[] | undefined,
): string | null {
  if (typeof param !== "string") return null;
  return offered.includes(param) ? param : null;
}
