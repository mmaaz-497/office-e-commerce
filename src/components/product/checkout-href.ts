import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";

/**
 * The buy link for one product (contracts/checkout.md "Product page buy
 * links"). The checkout slug comes from the route manifest, so the English
 * link is correct too.
 */
export function checkoutHref(locale: AppLocale, productSlug: string, quantity: number): string {
  return (
    localeHref("/checkout", locale) +
    "?product=" +
    encodeURIComponent(productSlug) +
    "&quantity=" +
    quantity
  );
}
