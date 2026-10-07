import { defineRouting } from "next-intl/routing";

/**
 * The route manifest. Keys are the internal (file-system) pathnames under
 * src/app/[locale]/; values are the externally visible slug in each language.
 * Indonesian is canonical, so the id slug always equals the internal one —
 * an English visitor sees /en/check-order, and next-intl rewrites it back to
 * the /cek-pesanan segment the app directory actually has (contracts/http-api.md).
 *
 * Adding a public page means adding it here, not just creating the folder:
 * the switcher (FR-067) and, later, the sitemap read this same manifest.
 */
export const pathnames = {
  "/": "/",
  "/produk/[slug]": { id: "/produk/[slug]", en: "/product/[slug]" },
  "/kategori/[slug]": { id: "/kategori/[slug]", en: "/category/[slug]" },
  "/cari": { id: "/cari", en: "/search" },
  "/checkout": "/checkout",
  "/cek-pesanan": { id: "/cek-pesanan", en: "/check-order" },
  "/pesanan/[orderNumber]": { id: "/pesanan/[orderNumber]", en: "/order/[orderNumber]" },
  "/ulasan": { id: "/ulasan", en: "/write-review" },
  "/cara-pemesanan": { id: "/cara-pemesanan", en: "/how-to-order" },
  "/syarat-ketentuan": { id: "/syarat-ketentuan", en: "/terms" },
  "/kebijakan-privasi": { id: "/kebijakan-privasi", en: "/privacy" },
  "/kebijakan-pengembalian": { id: "/kebijakan-pengembalian", en: "/returns" },
} as const;

/**
 * localeDetection: false disables Accept-Language and cookie-based locale
 * selection. This is the mechanical implementation of FR-065 and Constitution
 * Principle I, which forbid browser-language auto-redirect: a visitor with
 * Accept-Language: en-US must still land on /id. See research.md R-002.
 *
 * localeCookie: false goes one step further and stops next-intl writing
 * NEXT_LOCALE at all. With detection already off the cookie would never be
 * read, and a cookie nobody reads is a trap for the next person who turns
 * detection back on by accident. The URL is the only source of language.
 */
export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",
  localePrefix: "always",
  localeDetection: false,
  localeCookie: false,
  pathnames,
});

export type AppLocale = (typeof routing.locales)[number];
export type InternalPathname = keyof typeof pathnames;

/**
 * Static pages that ship full metadata but are never indexed (007 R-705): the
 * search results page. The sitemap leaves them out, so it cannot advertise a
 * page that tells crawlers not to index it.
 */
export const NOINDEX_PATHNAMES: ReadonlySet<InternalPathname> = new Set<InternalPathname>([
  "/cari",
]);
