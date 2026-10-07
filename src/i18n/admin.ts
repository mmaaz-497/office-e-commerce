import { getTranslations } from "next-intl/server";
import type { routing } from "./routing";

/**
 * The admin area sits outside [locale], so requestLocale is undefined for
 * /admin/** and src/i18n/request.ts falls back to routing.defaultLocale
 * ("id"). That fallback was incidental, not a decision: the admin namespace
 * is fully translated in both languages, and the single operator reads
 * English. Pinning the locale here keeps the area non-localised (no prefix,
 * no switcher, no cookie — spec, admin routes section) while making the one
 * language it renders in explicit and set in a single place.
 */
export const ADMIN_LOCALE: (typeof routing.locales)[number] = "en";

export function getAdminTranslations(namespace: string) {
  return getTranslations({ locale: ADMIN_LOCALE, namespace });
}
