import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";

/**
 * The buy link for one product (contracts/checkout.md "Product page buy
 * links"). The checkout slug comes from the route manifest, so the English
 * link is correct too. The size rides along so checkout opens with it chosen;
 * checkout keeps it only if the product offers it, and the server checks it
 * again on submit.
 */
export function checkoutHref(
  locale: AppLocale,
  productSlug: string,
  quantity: number,
  size: string | null = null,
): string {
  return (
    localeHref("/checkout", locale) +
    "?product=" +
    encodeURIComponent(productSlug) +
    "&quantity=" +
    quantity +
    (size === null ? "" : "&size=" + encodeURIComponent(size))
  );
}
