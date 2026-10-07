import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SEARCH_RESULTS_MAX } from "@/domain/catalogue/search-query";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct } from "./helpers/db";

/**
 * 007 T041, FR-006 and SC-004: the header search's reader against the real
 * database. seedProduct names a product "Produk <slug>" in id and
 * "Product <slug>" in en, with the short description "Deskripsi singkat
 * produk uji coba." in id.
 */

async function search(q: string, locale: "id" | "en" = "id") {
  const { searchListedProducts } = await import("@/infrastructure/db/catalogue");
  return searchListedProducts(q, locale);
}

const slugs = (products: Array<{ slug: string }>) => products.map((product) => product.slug);

describe("searchListedProducts (integration, 007 US3)", () => {
  beforeAll(async () => {
    await resetDb();
    await seedProduct({ slug: "sandal-empuk", status: "ACTIVE", priceIDR: 100000, stock: 5 });
    await seedProduct({ slug: "sandal-segera", status: "COMING_SOON", priceIDR: null });
    await seedProduct({ slug: "sandal-draf", status: "DRAFT", priceIDR: null });
    const special = await seedProduct({
      slug: "diskon-khusus",
      status: "ACTIVE",
      priceIDR: 90000,
      stock: 5,
    });
    // A literal percent sign in one product's name only.
    await prisma.productTranslation.updateMany({
      where: { productId: special.id, locale: "id" },
      data: { name: "Hemat 50% Sandal", shortDescription: "Promo produk." },
    });
    await prisma.productTranslation.updateMany({
      where: { productId: special.id, locale: "en" },
      data: { name: "Save 50% Sandals", shortDescription: "Promo product." },
    });
  });

  afterAll(async () => {
    await resetDb();
  });

  it("matches the name case-insensitively", async () => {
    expect(slugs(await search("SANDAL-EMPUK"))).toEqual(["sandal-empuk"]);
  });

  it("matches the short description", async () => {
    const found = slugs(await search("uji coba"));
    expect(found).toContain("sandal-empuk");
    expect(found).toContain("sandal-segera");
  });

  it("includes COMING_SOON products and never DRAFT ones", async () => {
    const found = slugs(await search("sandal"));
    expect(found).toContain("sandal-segera");
    expect(found).not.toContain("sandal-draf");
    expect(slugs(await search("sandal-draf"))).toEqual([]);
  });

  it("matches in the requested language only", async () => {
    expect(slugs(await search("Save 50", "en"))).toEqual(["diskon-khusus"]);
    expect(slugs(await search("Save 50", "id"))).toEqual([]);
    expect(slugs(await search("Hemat", "id"))).toEqual(["diskon-khusus"]);
  });

  it("treats LIKE wildcards literally", async () => {
    // Unescaped, "%" would match every product and "_" any one character.
    expect(slugs(await search("50%"))).toEqual(["diskon-khusus"]);
    expect(slugs(await search("%"))).toEqual(["diskon-khusus"]);
    expect(slugs(await search("sandal_empuk"))).toEqual([]);
  });

  it("returns nothing for a term no product contains", async () => {
    expect(await search("zzzz-tidak-ada")).toEqual([]);
  });

  it("returns locale-resolved views in catalogue order", async () => {
    // "produk" is in every id short description ("… produk uji coba.", "Promo produk.").
    const found = await search("produk");
    expect(slugs(found)).toEqual(["sandal-empuk", "sandal-segera", "diskon-khusus"]);
    // Indonesian names, never the English ones.
    expect(found.some((product) => product.name.startsWith("Product"))).toBe(false);
  });
});

describe("searchListedProducts result cap (integration, 007 US3)", () => {
  beforeAll(async () => {
    await resetDb();
    for (let index = 0; index <= SEARCH_RESULTS_MAX; index++) {
      await seedProduct({ slug: `banyak-${index}`, status: "COMING_SOON", priceIDR: null });
    }
  });

  afterAll(async () => {
    await resetDb();
  });

  it(`returns at most ${SEARCH_RESULTS_MAX} products`, async () => {
    expect(SEARCH_RESULTS_MAX).toBe(48);
    expect(await search("banyak")).toHaveLength(SEARCH_RESULTS_MAX);
  });
});
