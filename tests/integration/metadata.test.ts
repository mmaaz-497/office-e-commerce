import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import id from "@/messages/id.json";
import en from "@/messages/en.json";
import { NOINDEX_PATHNAMES, pathnames, routing, type InternalPathname } from "@/i18n/routing";
import { absoluteUrl, languageAlternates } from "@/infrastructure/seo/metadata";
import { resetDb, seedCatalogue, seedProduct } from "./helpers/db";
import { buildImportSource } from "@/infrastructure/db/catalogue-import";

/**
 * FR-071, SC-011. Every public page's `generateMetadata` reads its title and
 * description from `<namespace>.metadata` and builds its `alternates` from
 * `routeMetadata`/`absoluteUrl` (src/infrastructure/seo/metadata.ts) — see
 * each page under src/app/[locale]/**\/page.tsx. This test cannot import
 * those `generateMetadata` functions directly: they call `getTranslations`
 * from `next-intl/server`, which resolves to a stub that throws outside a
 * real React Server Components runtime ("is not supported in Client
 * Components") — there is no Next.js render happening under Vitest. Instead
 * it exercises the exact same message content and the exact same pure
 * `absoluteUrl`/`languageAlternates` helpers those functions call, walking
 * every route in the manifest so a new page cannot exist without a
 * conforming `metadata` block — this is what makes SC-011's "100% coverage"
 * claim a check rather than an aspiration.
 */

const MESSAGES = { id, en } as const;

/** Every internal route mapped to the message namespace its page reads for metadata. */
const ROUTE_NAMESPACE: Record<InternalPathname, string> = {
  "/": "home",
  "/produk/[slug]": "product",
  "/kategori/[slug]": "category",
  "/cari": "search",
  "/checkout": "checkout",
  "/cek-pesanan": "lookup",
  "/pesanan/[orderNumber]": "confirmation",
  "/ulasan": "review",
  "/cara-pemesanan": "howToOrder",
  "/syarat-ketentuan": "terms",
  "/kebijakan-privasi": "privacy",
  "/kebijakan-pengembalian": "returns",
};

const SAMPLE_PARAMS: Record<string, string> = {
  orderNumber: "TKS-260920-AB12",
  slug: "slippers-gemoy",
};

type MessageTree = { [key: string]: string | MessageTree };

function readMetadata(
  tree: MessageTree,
  namespace: string,
): { title: string; description: string } {
  const namespaceNode = tree[namespace];
  if (typeof namespaceNode !== "object") {
    throw new Error(`Namespace "${namespace}" not found in message tree`);
  }
  const metadataNode = namespaceNode.metadata;
  if (typeof metadataNode !== "object") {
    throw new Error(`"${namespace}.metadata" not found in message tree`);
  }
  const { title, description } = metadataNode;
  if (typeof title !== "string" || typeof description !== "string") {
    throw new Error(`"${namespace}.metadata" is missing a string title or description`);
  }
  return { title, description };
}

describe("metadata coverage (integration)", () => {
  it("maps every route in the manifest to a metadata namespace", () => {
    const manifestRoutes = Object.keys(pathnames).sort();
    const mappedRoutes = Object.keys(ROUTE_NAMESPACE).sort();
    expect(mappedRoutes).toEqual(manifestRoutes);
  });

  // FR-028: the homepage and the product page are two different pages and must
  // not compete for the same search result. Splitting the locale root in two is
  // exactly the change that makes duplicated metadata easy to ship by accident.
  describe("the homepage and the product page are distinct (FR-028)", () => {
    it.each(routing.locales)("has a different title in %s", (locale) => {
      const home = readMetadata(MESSAGES[locale], "home");
      const product = readMetadata(MESSAGES[locale], "product");
      expect(home.title).not.toBe(product.title);
    });

    it.each(routing.locales)("has a different description in %s", (locale) => {
      const home = readMetadata(MESSAGES[locale], "home");
      const product = readMetadata(MESSAGES[locale], "product");
      expect(home.description).not.toBe(product.description);
    });

    it.each(routing.locales)("resolves to different canonical URLs in %s", (locale) => {
      expect(absoluteUrl(locale, "/")).not.toBe(
        absoluteUrl(locale, "/produk/[slug]", SAMPLE_PARAMS),
      );
    });
  });

  describe.each(Object.entries(ROUTE_NAMESPACE))("%s", (internal, namespace) => {
    it.each(routing.locales)("has a compliant title and description in %s", (locale) => {
      const { title, description } = readMetadata(MESSAGES[locale], namespace);

      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(60);

      expect(description.length).toBeGreaterThanOrEqual(140);
      expect(description.length).toBeLessThanOrEqual(165);
    });

    it.each(routing.locales)("resolves an absolute canonical URL in %s", (locale) => {
      const canonical = absoluteUrl(locale, internal as InternalPathname, SAMPLE_PARAMS);

      expect(() => new URL(canonical)).not.toThrow();
      expect(canonical.startsWith("http")).toBe(true);
    });

    it("resolves both hreflang entries", () => {
      const languages = languageAlternates(internal as InternalPathname, SAMPLE_PARAMS);

      expect(Object.keys(languages).sort()).toEqual(["en", "id-ID"]);
      expect(() => new URL(languages["id-ID"])).not.toThrow();
      expect(() => new URL(languages.en)).not.toThrow();
      // The two locales must not resolve to the same URL — a real hreflang
      // pair, not a duplicate that happens to satisfy the key-count check.
      expect(languages["id-ID"]).not.toBe(languages.en);
    });
  });
});

// 006 T034: the category page title is a template, so the length rule is
// checked with the longest name it will be given: the dev seed's category and
// a 30-character name, whichever is longer.
describe("category page title with a real name (006 T034)", () => {
  const { category } = buildImportSource();
  const LONG_NAME = "Perlengkapan Rumah dan Dapurku";

  it.each(routing.locales)("stays at or under 60 characters in %s", (locale) => {
    const { title } = readMetadata(MESSAGES[locale], "category");
    const seeded = locale === "id" ? category.nameId : category.nameEn;
    const longest = [seeded, LONG_NAME].reduce((a, b) => (b.length > a.length ? b : a));

    expect(LONG_NAME).toHaveLength(30);
    expect(title).toContain("{name}");
    expect(title.replace("{name}", longest).length).toBeLessThanOrEqual(60);
  });
});

// 005 T028, FR-037: a COMING_SOON product page is reachable but noindex,
// whatever price is stored; the existing product's page stays indexable. Unlike
// the message-level checks above, the product page's generateMetadata reads
// only the catalogue, so it is called directly.
describe("product page robots by status (005 FR-037)", () => {
  beforeAll(async () => {
    await resetDb();
    await seedCatalogue();
    await seedProduct({ slug: "segera-metadata", status: "COMING_SOON", priceIDR: 120000 });
  });

  afterAll(async () => {
    await resetDb();
  });

  it.each(routing.locales)("is noindex for a COMING_SOON product in %s", async (locale) => {
    const { generateMetadata } = await import("@/app/[locale]/produk/[slug]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale, slug: "segera-metadata" }),
    });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each(routing.locales)("stays indexable for the existing product in %s", async (locale) => {
    const { generateMetadata } = await import("@/app/[locale]/produk/[slug]/page");
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale, slug: SAMPLE_PARAMS.slug }),
    });
    expect(metadata.robots).toBeUndefined();
  });
});

// 007 T042, FR-008 and research R-705: the search results page ships full
// metadata (Constitution VIII) but is never indexed. Its generateMetadata reads
// next-intl, so the page source and the shared noindex set are checked.
describe("search page is noindex (007 FR-008)", () => {
  it("is in the shared noindex set the sitemap reads", () => {
    expect(NOINDEX_PATHNAMES.has("/cari")).toBe(true);
  });

  it("asks routeMetadata for index: false", () => {
    const source = readFileSync("src/app/[locale]/cari/page.tsx", "utf8");
    expect(source).toMatch(/internal: "\/cari"/);
    expect(source).toMatch(/index: false/);
  });
});
