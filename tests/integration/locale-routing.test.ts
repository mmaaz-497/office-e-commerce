import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import middleware from "@/middleware";
import { localeHref, switchLocalePath } from "@/i18n/pathnames";
import { pathnames, routing, type InternalPathname } from "@/i18n/routing";

/**
 * FR-064, FR-065, FR-067. Exercises the real middleware, not a description of
 * it: the Accept-Language and cookie assertions fail if someone flips
 * localeDetection back on, which is the mistake this feature is most exposed
 * to (Constitution Principle I).
 */

function request(path: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(path, "https://tokoshopee.example"), { headers });
}

const ALL_ROUTES = Object.keys(pathnames) as InternalPathname[];

/** Concrete paths to walk, one per route, with dynamic segments filled in. */
const SAMPLE_PARAMS: Record<string, string> = {
  orderNumber: "TKS-260920-AB12",
  slug: "slippers-gemoy",
};

describe("locale routing (integration)", () => {
  describe("the site root always lands on Indonesian", () => {
    it("redirects / to /id", () => {
      const response = middleware(request("/"));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname).toBe("/id");
    });

    it("still redirects / to /id when the browser asks for English", () => {
      const response = middleware(request("/", { "accept-language": "en-US,en;q=0.9" }));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/id");
    });

    it("still redirects / to /id when a NEXT_LOCALE=en cookie is present", () => {
      const response = middleware(request("/", { cookie: "NEXT_LOCALE=en" }));
      expect(new URL(response.headers.get("location")!).pathname).toBe("/id");
    });

    it("prefixes an unprefixed path with the default locale rather than guessing", () => {
      const response = middleware(
        request("/cara-pemesanan", { "accept-language": "en-GB", cookie: "NEXT_LOCALE=en" }),
      );
      expect(new URL(response.headers.get("location")!).pathname).toBe("/id/cara-pemesanan");
    });
  });

  describe("the URL wins over any stored preference", () => {
    it("serves /en/check-order unchanged when a NEXT_LOCALE=id cookie is present", () => {
      const response = middleware(request("/en/check-order", { cookie: "NEXT_LOCALE=id" }));
      expect(response.headers.get("location")).toBeNull();
      // next-intl rewrites the English slug back onto the Indonesian folder
      // that actually exists under src/app/[locale]/.
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite!).pathname).toBe("/en/cek-pesanan");
    });

    it("serves /id unchanged when a NEXT_LOCALE=en cookie is present", () => {
      const response = middleware(request("/id", { cookie: "NEXT_LOCALE=en" }));
      expect(response.headers.get("location")).toBeNull();
    });

    it("does not write a locale cookie of its own", () => {
      const response = middleware(request("/en", { "accept-language": "id-ID" }));
      expect(response.headers.get("set-cookie")).toBeNull();
    });
  });

  describe("the switcher lands on the same page in the other language", () => {
    it.each(ALL_ROUTES)("round-trips %s between id and en", (internal) => {
      const idPath = localeHref(internal, "id", SAMPLE_PARAMS);
      const enPath = localeHref(internal, "en", SAMPLE_PARAMS);

      expect(switchLocalePath(idPath, "en")).toBe(enPath);
      expect(switchLocalePath(enPath, "id")).toBe(idPath);
    });

    it("keeps the visitor on the page rather than sending them home", () => {
      expect(switchLocalePath("/id/cek-pesanan", "en")).toBe("/en/check-order");
      expect(switchLocalePath("/en/how-to-order", "id")).toBe("/id/cara-pemesanan");
      expect(switchLocalePath("/id/pesanan/TKS-260920-AB12", "en")).toBe(
        "/en/order/TKS-260920-AB12",
      );
    });

    it("switches between the localised product pathnames without falling back home", () => {
      expect(switchLocalePath("/id/produk/slippers-gemoy", "en")).toBe(
        "/en/product/slippers-gemoy",
      );
      expect(switchLocalePath("/en/product/slippers-gemoy", "id")).toBe(
        "/id/produk/slippers-gemoy",
      );
    });

    it("switching to the language already active is a no-op", () => {
      expect(switchLocalePath("/en/terms", "en")).toBe("/en/terms");
      expect(switchLocalePath("/id/syarat-ketentuan", "id")).toBe("/id/syarat-ketentuan");
    });

    it("falls back to the home page only for a path that matches no route", () => {
      expect(switchLocalePath("/id/tidak-ada", "en")).toBe("/en");
    });

    it("never produces a path in the wrong language's slug", () => {
      for (const internal of ALL_ROUTES) {
        const enPath = switchLocalePath(localeHref(internal, "id", SAMPLE_PARAMS), "en");
        const rewritten = middleware(request(enPath));
        expect(rewritten.headers.get("location")).toBeNull();
      }
    });
  });

  describe("the product page moved off the locale root", () => {
    it("serves the Indonesian product URL without redirecting", () => {
      const response = middleware(request("/id/produk/slippers-gemoy"));
      expect(response.headers.get("location")).toBeNull();
    });

    it("rewrites the English product slug onto the Indonesian folder that exists on disk", () => {
      const response = middleware(request("/en/product/slippers-gemoy"));
      expect(response.headers.get("location")).toBeNull();
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite!).pathname).toBe("/en/produk/slippers-gemoy");
    });

    it("builds the localised product href from the manifest", () => {
      expect(localeHref("/produk/[slug]", "id", { slug: "slippers-gemoy" })).toBe(
        "/id/produk/slippers-gemoy",
      );
      expect(localeHref("/produk/[slug]", "en", { slug: "slippers-gemoy" })).toBe(
        "/en/product/slippers-gemoy",
      );
    });

    it("keeps the locale root as its own route, distinct from the product page", () => {
      expect(localeHref("/", "id")).toBe("/id");
      expect(localeHref("/", "en")).toBe("/en");
    });
  });

  // 007 T042: the search results page.
  describe("the search page has a localised pathname", () => {
    it("rewrites the English search slug onto the cari folder that exists on disk", () => {
      const response = middleware(request("/en/search?q=sandal"));
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      expect(new URL(rewrite!).pathname).toBe("/en/cari");
      expect(new URL(rewrite!).searchParams.get("q")).toBe("sandal");
    });

    it("builds the localised search action", () => {
      expect(localeHref("/cari", "id")).toBe("/id/cari");
      expect(localeHref("/cari", "en")).toBe("/en/search");
    });

    it("switches between the localised search pathnames", () => {
      expect(switchLocalePath("/id/cari", "en")).toBe("/en/search");
      expect(switchLocalePath("/en/search", "id")).toBe("/id/cari");
    });
  });

  // 006 T035: the category page, pulled forward from Phase 4.
  describe("the category page has a localised pathname", () => {
    it("rewrites the English category slug onto the kategori folder that exists on disk", () => {
      const response = middleware(request("/en/category/sandal"));
      expect(response.headers.get("location")).toBeNull();
      const rewrite = response.headers.get("x-middleware-rewrite");
      expect(new URL(rewrite!).pathname).toBe("/en/kategori/sandal");
    });

    it("switches between the localised category pathnames", () => {
      expect(switchLocalePath("/id/kategori/sandal", "en")).toBe("/en/category/sandal");
      expect(switchLocalePath("/en/category/sandal", "id")).toBe("/id/kategori/sandal");
    });

    it("builds the localised category href from the manifest", () => {
      expect(localeHref("/kategori/[slug]", "en", { slug: "sandal" })).toBe("/en/category/sandal");
    });
  });

  describe("the route manifest stays honest", () => {
    it("declares a slug for every locale on every route", () => {
      for (const internal of ALL_ROUTES) {
        for (const locale of routing.locales) {
          const entry = pathnames[internal];
          const slug = typeof entry === "string" ? entry : entry[locale];
          expect(slug.startsWith("/")).toBe(true);
        }
      }
    });
  });
});
