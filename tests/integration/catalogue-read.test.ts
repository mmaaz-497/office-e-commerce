import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";

// Header and Footer are server components that call getTranslations. Outside a
// Next request there is no locale to resolve, so the translator is replaced by
// one that echoes its key — these tests assert on hrefs, not on copy.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

/**
 * Serialises a rendered element tree for href assertions. The tree holds
 * module objects (a static image import's `default`) that refer to themselves,
 * so a plain JSON.stringify throws; repeated objects are skipped instead.
 */
function serialise(tree: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(tree, (_key, value: unknown) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  });
}

/**
 * T020 — US1: the storefront's read boundary (contracts/catalogue.md). The
 * imported product must come back exactly as the repository catalogue
 * described it, in both locales, and an empty catalogue must never take the
 * layout down with it (/sp.analyze H4).
 */
describe("catalogue read module (integration, US1)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("returns the imported product with Indonesian content", async () => {
    await seedStockLevel(5);
    const { getListedProductBySlug } = await import("@/infrastructure/db/catalogue");

    const product = await getListedProductBySlug("slippers-gemoy", "id");

    expect(product).not.toBeNull();
    expect(product).toMatchObject({
      slug: "slippers-gemoy",
      status: "ACTIVE",
      priceIDR: 169999,
      name: "Sandal Gemoy",
      highlights: ["Empuk & nyaman", "Anti slip", "Desain lucu", "All size untuk semua"],
    });
    expect(product!.images.map((image) => image.src)).toEqual([
      "/images/product/banner-seharian-landscape.png",
      "/images/product/banner-nyaman-portrait.png",
      "/images/product/banner-hadiah-landscape.png",
      "/images/product/banner-santai-portrait.png",
      "/images/product/banner-collage-portrait.png",
      "/images/product/banner-new-arrival-square.png",
    ]);
    expect(product!.images[0]).toEqual({
      src: "/images/product/banner-seharian-landscape.png",
      alt: "Sandal Gemoy dipakai seharian di rumah",
      width: 1740,
      height: 904,
      orientation: "landscape",
    });
    expect(product!.video).toEqual({
      src: "/videos/slippers-gemoy.mp4",
      poster: "/videos/slippers-gemoy-poster.jpg",
      alt: "Video Sandal Gemoy: bahan empuk dan telapak anti slip",
    });
  });

  it("returns English content for the en locale", async () => {
    await seedStockLevel(5);
    const { getListedProductBySlug } = await import("@/infrastructure/db/catalogue");

    const product = await getListedProductBySlug("slippers-gemoy", "en");

    expect(product!.name).toBe("Slippers Gemoy");
    expect(product!.highlights[0]).toBe("Soft & comfy");
    expect(product!.images[0].alt).toBe("Gemoy Slippers worn all day at home");
  });

  it("hides DRAFT products and lists COMING_SOON ones", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "draft-sandal", status: "DRAFT", priceIDR: null });
    await seedProduct({ slug: "soon-sandal", status: "COMING_SOON", priceIDR: null });
    const { getListedProductBySlug, listListedProducts } =
      await import("@/infrastructure/db/catalogue");

    expect(await getListedProductBySlug("draft-sandal", "id")).toBeNull();
    expect(await getListedProductBySlug("soon-sandal", "id")).not.toBeNull();
    expect((await listListedProducts("id")).map((p) => p.slug)).toEqual([
      "slippers-gemoy",
      "soon-sandal",
    ]);
  });

  it("features the imported product", async () => {
    await seedStockLevel(5);
    const { getFeaturedProduct } = await import("@/infrastructure/db/catalogue");

    expect((await getFeaturedProduct("id")).slug).toBe("slippers-gemoy");
  });

  it("indexes ACTIVE products only", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "draft-sandal", status: "DRAFT", priceIDR: null });
    await seedProduct({ slug: "soon-sandal", status: "COMING_SOON", priceIDR: null });
    const { listIndexableProducts } = await import("@/infrastructure/db/catalogue");

    expect((await listIndexableProducts()).map((p) => p.slug)).toEqual(["slippers-gemoy"]);
  });

  it("on an empty catalogue: the page lookup throws and logs, the layout lookup returns null", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getFeaturedProduct, getFeaturedProductOrNull, CatalogueEmptyError } =
      await import("@/infrastructure/db/catalogue");

    await expect(getFeaturedProduct("id")).rejects.toBeInstanceOf(CatalogueEmptyError);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Catalogue is empty: run npm run catalogue:import"),
    );
    expect(await getFeaturedProductOrNull("id")).toBeNull();
    consoleError.mockRestore();
  });

  it("Header and Footer render without throwing on an empty catalogue, with no product link", async () => {
    const { Header } = await import("@/components/layout/Header");
    const { Footer } = await import("@/components/layout/Footer");

    const header = serialise(await Header({ locale: "id" }));
    const footer = serialise(await Footer({ locale: "id" }));

    expect(header).not.toContain("/produk/");
    expect(footer).not.toContain("/produk/");
    expect(header).toContain('"/id/cek-pesanan"');
  });

  // 006 T046, T047: the header and footer list the catalogue's categories
  // instead of linking one product.
  it("Header and Footer link the categories when the catalogue exists", async () => {
    await seedStockLevel(5);
    const { Header } = await import("@/components/layout/Header");
    const { Footer } = await import("@/components/layout/Footer");

    expect(serialise(await Header({ locale: "id" }))).toContain('"/id/kategori/sandal"');
    expect(serialise(await Footer({ locale: "en" }))).toContain('"/en/category/sandal"');
  });

  it("keeps rows that predate the catalogue attributed to the legacy product", async () => {
    await seedStockLevel(5);
    const { getLegacyProductId } = await import("@/infrastructure/db/catalogue");
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } });

    expect(await getLegacyProductId()).toBe(product.id);
  });
});
