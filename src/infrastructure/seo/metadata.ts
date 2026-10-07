import type { Metadata } from "next";
import { env } from "@/config";
import { localeHref } from "@/i18n/pathnames";
import { routing, type AppLocale, type InternalPathname } from "@/i18n/routing";

/**
 * The hreflang the ecosystem (Google, next-intl consumers) expects for each
 * locale — not the same string as the URL segment or the BCP-47 tag next-intl
 * uses internally. Indonesian is `id-ID`; English targets no specific region.
 */
const HREFLANG: Record<AppLocale, string> = { id: "id-ID", en: "en" };

/**
 * The single place a relative internal route becomes an absolute, canonical
 * URL. Every route's `generateMetadata`, the sitemap and robots.txt all go
 * through this function so the origin is never hand-typed twice (FR-071).
 */
export function absoluteUrl(
  locale: AppLocale,
  internal: InternalPathname,
  params: Record<string, string> = {},
): string {
  return new URL(localeHref(internal, locale, params), env.NEXT_PUBLIC_BASE_URL).toString();
}

/** The `alternates.languages` map for one route, one entry per locale. */
export function languageAlternates(
  internal: InternalPathname,
  params: Record<string, string> = {},
): Record<string, string> {
  return Object.fromEntries(
    routing.locales.map((locale) => [HREFLANG[locale], absoluteUrl(locale, internal, params)]),
  );
}

/**
 * Builds the full metadata contract (canonical + both hreflang entries) for
 * one route in one locale. `index: false` is for routes that are technically
 * public (reachable without a session) but should never be crawled or
 * indexed — the order confirmation page, which is only ever reached via a
 * link containing a real customer's order number.
 */
export function routeMetadata({
  locale,
  internal,
  params = {},
  title,
  description,
  index = true,
}: {
  locale: AppLocale;
  internal: InternalPathname;
  params?: Record<string, string>;
  title: string;
  description: string;
  index?: boolean;
}): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: absoluteUrl(locale, internal, params),
      languages: languageAlternates(internal, params),
    },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}
