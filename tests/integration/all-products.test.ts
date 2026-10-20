import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paginate, sortListedProducts, type ProductSort } from "@/domain/catalogue/product-listing";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct } from "./helpers/db";

/**
 * The all-products page (/produk, /en/products) against the real database:
 * the listed-products reader, sorted and paginated exactly as the page does.
 * DRAFT never appears; createdAt reaches the view for the newest sort.
 */

async function listing(sort: ProductSort, page = 1, locale: "id" | "en" = "id") {
  const { listListedProducts } = await import("@/infrastructure/db/catalogue");
  return paginate(sortListedProducts(await listListedProducts(locale), sort), page);
}

const slugs = (products: Array<{ slug: string }>) => products.map((product) => product.slug);

describe("all-products listing (integration)", () => {
  beforeAll(async () => {
    await resetDb();
    const seeded = [
      await seedProduct({ slug: "murah", status: "ACTIVE", priceIDR: 50_000, stock: 5 }),
      await seedProduct({ slug: "segera", status: "COMING_SOON", priceIDR: null }),
      await seedProduct({ slug: "mahal", status: "ACTIVE", priceIDR: 250_000, stock: 0 }),
      await seedProduct({ slug: "draf", status: "DRAFT", priceIDR: 10_000 }),
      await seedProduct({ slug: "sedang", status: "ACTIVE", priceIDR: 120_000, stock: 5 }),
    ];
    // Distinct creation dates, oldest first, so the newest sort is deterministic.
    for (const [index, product] of seeded.entries()) {
      await prisma.product.update({
        where: { id: product.id },
        data: { createdAt: new Date(Date.UTC(2026, 0, index + 1)) },
      });
    }
  });

  afterAll(async () => {
    await resetDb();
  });

  it("lists every ACTIVE and COMING_SOON product, never DRAFT", async () => {
    const page = await listing("newest");
    expect(page.total).toBe(4);
    expect(slugs(page.items)).not.toContain("draf");
  });

  it("newest first by creation date", async () => {
    expect(slugs((await listing("newest")).items)).toEqual(["sedang", "mahal", "segera", "murah"]);
  });

  it("price low to high, Coming Soon after the products on sale", async () => {
    expect(slugs((await listing("price-asc")).items)).toEqual([
      "murah",
      "sedang",
      "mahal",
      "segera",
    ]);
  });

  it("price high to low, Coming Soon still last", async () => {
    expect(slugs((await listing("price-desc")).items)).toEqual([
      "mahal",
      "sedang",
      "murah",
      "segera",
    ]);
  });

  it("an out-of-stock ACTIVE product is still listed", async () => {
    expect(slugs((await listing("newest")).items)).toContain("mahal");
  });

  it("serves the English content under the same rules", async () => {
    const page = await listing("price-asc", 1, "en");
    expect(page.items.map((product) => product.name)).toEqual([
      "Product murah",
      "Product sedang",
      "Product mahal",
      "Product segera",
    ]);
  });

  it("has one page, and a page past it shows that page", async () => {
    expect((await listing("newest")).pageCount).toBe(1);
    expect(await listing("newest", 2)).toEqual(await listing("newest", 1));
  });

  it("an empty catalogue is an empty first page, not an error", async () => {
    await resetDb();
    expect(await listing("newest")).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
  });
});
