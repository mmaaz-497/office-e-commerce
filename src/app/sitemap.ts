import type { MetadataRoute } from "next";
import { languageAlternates, absoluteUrl } from "@/infrastructure/seo/metadata";
import { NOINDEX_PATHNAMES, pathnames, routing, type InternalPathname } from "@/i18n/routing";
import { listIndexableProducts } from "@/infrastructure/db/catalogue";

/**
 * Built from the exact manifest `src/i18n/routing.ts` exports, so a new static
 * page cannot exist without appearing here (FR-072, contracts/http-api.md).
 *
 * A `[param]` route is only included when its URLs are enumerable. That holds
 * for product slugs, which come from the catalogue, and not for the order
 * confirmation page, whose parameter is a real customer's order number — it
 * has no fixed list and carries `index: false` anyway.
 *
 * Products come from the database catalogue, ACTIVE only (FR-012 "Indexed",
 * FR-021): Constitution v2.0.0 Principle III forbids reading product.json at
 * runtime (research R-210, revised after /sp.analyze C1).
 */
const PRODUCT_INTERNAL: InternalPathname = "/produk/[slug]";

// A noindex page (007 R-705: the search results) is never listed.
const STATIC_INTERNAL_PATHNAMES = (Object.keys(pathnames) as InternalPathname[]).filter(
  (internal) => !internal.includes("[") && !NOINDEX_PATHNAMES.has(internal),
);

// The product list changes without a deploy, and deploy.sh builds before it
// migrates, so this must never be generated at build time (R-209, R-210).
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const productSlugs = (await listIndexableProducts()).map((product) => product.slug);

  const staticEntries = STATIC_INTERNAL_PATHNAMES.flatMap((internal) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(locale, internal),
      alternates: { languages: languageAlternates(internal) },
    })),
  );

  const productEntries = productSlugs.flatMap((slug) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(locale, PRODUCT_INTERNAL, { slug }),
      alternates: { languages: languageAlternates(PRODUCT_INTERNAL, { slug }) },
    })),
  );

  return [...staticEntries, ...productEntries];
}
