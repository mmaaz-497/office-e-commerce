import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MetadataRoute } from "next";
import sitemap from "@/app/sitemap";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import { NOINDEX_PATHNAMES, pathnames, routing, type InternalPathname } from "@/i18n/routing";
import { absoluteUrl } from "@/infrastructure/seo/metadata";
import { resetDb, seedCatalogue, seedProduct } from "./helpers/db";

/**
 * FR-003, FR-072, contracts/routes.md §3.
 *
 * The sitemap builds itself from the route manifest and drops any key holding
 * a `[param]`, because the order confirmation route has no enumerable URLs. A
 * product slug does have them — they come from the catalogue — so moving the
 * product page onto `/produk/[slug]` would have silently deleted it from the
 * sitemap under the old filter. That regression is invisible until a search
 * engine stops listing the only page that sells anything, which is why it gets
 * a test of its own rather than a line in a review checklist.
 */

const PRODUCTS = catalogue as Product[];

describe("sitemap (integration)", () => {
  // 003: the sitemap reads the database catalogue, so the catalogue is seeded
  // first; expected slugs are still computed from product.json, its import source.
  let ENTRIES: MetadataRoute.Sitemap;
  let URLS: string[];

  beforeAll(async () => {
    await resetDb();
    await seedCatalogue();
    ENTRIES = await sitemap();
    URLS = ENTRIES.map((entry) => entry.url);
  });

  afterAll(async () => {
    await resetDb();
  });

  it("lists every catalogue product once per locale", () => {
    for (const product of PRODUCTS) {
      for (const locale of routing.locales) {
        const expected = absoluteUrl(locale, "/produk/[slug]", { slug: product.slug });
        expect(URLS.filter((url) => url === expected)).toHaveLength(1);
      }
    }
  });

  it("lists the homepage once per locale", () => {
    for (const locale of routing.locales) {
      expect(URLS.filter((url) => url === absoluteUrl(locale, "/"))).toHaveLength(1);
    }
  });

  it("excludes the order confirmation route, whose URLs are not enumerable", () => {
    expect(URLS.some((url) => url.includes("/pesanan/") || url.includes("/order/"))).toBe(false);
  });

  // 007 R-705: the search results page is noindex, so it is not listed.
  it("excludes the noindex search page", () => {
    expect(NOINDEX_PATHNAMES.has("/cari")).toBe(true);
    for (const locale of routing.locales) {
      expect(URLS).not.toContain(absoluteUrl(locale, "/cari"));
    }
    expect(URLS.some((url) => url.includes("/cari") || url.includes("/search"))).toBe(false);
  });

  it("never emits an unresolved [param] placeholder", () => {
    for (const url of URLS) {
      expect(url).not.toMatch(/\[|\]/);
    }
  });

  it("contains no duplicate URLs", () => {
    expect(new Set(URLS).size).toBe(URLS.length);
  });

  it("covers every indexable static route in the manifest, in both locales", () => {
    const staticRoutes = (Object.keys(pathnames) as InternalPathname[]).filter(
      (internal) => !internal.includes("[") && !NOINDEX_PATHNAMES.has(internal),
    );
    for (const internal of staticRoutes) {
      for (const locale of routing.locales) {
        expect(URLS).toContain(absoluteUrl(locale, internal));
      }
    }
  });

  it("gives every entry both hreflang alternates", () => {
    for (const entry of ENTRIES) {
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual(["en", "id-ID"]);
    }
  });

  it("emits absolute URLs", () => {
    for (const url of URLS) {
      expect(() => new URL(url)).not.toThrow();
      expect(url.startsWith("http")).toBe(true);
    }
  });
});

// 005 T028, FR-037: a COMING_SOON product is reachable but never in the
// sitemap, even with a stored price; the existing product stays listed.
describe("sitemap excludes Coming Soon (integration, 005 FR-037)", () => {
  let URLS: string[];

  beforeAll(async () => {
    await resetDb();
    await seedCatalogue();
    await seedProduct({ slug: "segera-sitemap", status: "COMING_SOON", priceIDR: 120000 });
    URLS = (await sitemap()).map((entry) => entry.url);
  });

  afterAll(async () => {
    await resetDb();
  });

  it("omits the COMING_SOON product in both locales", () => {
    expect(URLS.some((url) => url.includes("segera-sitemap"))).toBe(false);
  });

  it("still lists the existing product in both locales", () => {
    for (const product of PRODUCTS) {
      for (const locale of routing.locales) {
        expect(URLS).toContain(absoluteUrl(locale, "/produk/[slug]", { slug: product.slug }));
      }
    }
  });
});
