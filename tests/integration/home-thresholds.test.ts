import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductStatus } from "@prisma/client";
import { planHomeSections } from "@/domain/catalogue/home-sections";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedCategory, seedProduct } from "./helpers/db";

/**
 * 006 T049, revised by 007 T026 (FR-022, research R-708). The homepage's
 * "more on sale" grid holds the ACTIVE products other than the featured one,
 * and the Segera hadir grid the COMING_SOON ones; each appears only from
 * SHOWCASE_MINIMUM (2) items, computed from the real readers on each render,
 * so flipping the data shows or hides them with no code change.
 *
 * The steps build on each other, in order, against the test database only.
 */

async function seed(slug: string, status: ProductStatus) {
  return seedProduct({ slug, status, priceIDR: status === "ACTIVE" ? 100000 : null, stock: 5 });
}

async function plan() {
  const { getFeaturedProduct, listListedProducts, listStorefrontCategories } =
    await import("@/infrastructure/db/catalogue");
  const [featured, products, categories] = await Promise.all([
    getFeaturedProduct("id"),
    listListedProducts("id"),
    listStorefrontCategories("id"),
  ]);
  return {
    featured,
    categories,
    sections: planHomeSections({ products, featuredId: featured.id }),
  };
}

describe("homepage section thresholds (integration, 007 US2)", () => {
  let firstActiveId: string;
  const extraActiveIds: string[] = [];

  beforeAll(async () => {
    await resetDb();
    // seedProduct puts every product in the one `sandal` category.
    firstActiveId = (await seed("aktif-satu", "ACTIVE")).id;
    await seed("segera-satu", "COMING_SOON");
    await seed("segera-dua", "COMING_SOON");
    await seed("segera-tiga", "COMING_SOON");
  });

  afterAll(async () => {
    await resetDb();
  });

  it("1 ACTIVE (featured) and 3 COMING_SOON: no more-on-sale grid, a Segera hadir grid of 3", async () => {
    const { featured, sections } = await plan();

    expect(featured.id).toBe(firstActiveId);
    expect(sections.moreOnSale).toEqual([]);
    expect(sections.comingSoonGrid).toHaveLength(3);
  });

  it("a second ACTIVE product is still below the minimum once the featured one is left out", async () => {
    extraActiveIds.push((await seed("aktif-dua", "ACTIVE")).id);

    const { sections } = await plan();

    expect(sections.moreOnSale).toEqual([]);
  });

  it("a third ACTIVE product in a second category shows the grid, never repeating the featured one", async () => {
    await seedCategory({ slug: "tas", nameId: "Tas", nameEn: "Bags", position: 1 });
    const third = await seed("aktif-tiga", "ACTIVE");
    extraActiveIds.push(third.id);
    const tas = await prisma.category.findUniqueOrThrow({ where: { slug: "tas" } });
    await prisma.product.update({ where: { id: third.id }, data: { categoryId: tas.id } });

    const { featured, categories, sections } = await plan();

    expect(sections.moreOnSale.map((product) => product.id).sort()).toEqual(
      [...extraActiveIds].sort(),
    );
    expect(sections.moreOnSale.map((product) => product.id)).not.toContain(featured.id);
    // The quick-access row lists every storefront category, with no threshold.
    expect(categories.map((category) => category.slug)).toEqual(["sandal", "tas"]);
  });

  it("hides the grid again when one of them goes back to DRAFT", async () => {
    await prisma.product.update({ where: { id: extraActiveIds[1] }, data: { status: "DRAFT" } });

    const { categories, sections } = await plan();

    expect(sections.moreOnSale).toEqual([]);
    // Its category now has no listed product, so it drops out of the quick-access row.
    expect(categories.map((category) => category.slug)).toEqual(["sandal"]);
  });

  it("empties the Segera hadir grid below 2 COMING_SOON, and keeps the ACTIVE product featured", async () => {
    const removable = await prisma.product.findMany({
      where: { status: "COMING_SOON", slug: { in: ["segera-dua", "segera-tiga"] } },
      select: { id: true },
    });
    const ids = removable.map((row) => row.id);
    await prisma.stockLevel.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: ids } } });
    await prisma.productTranslation.deleteMany({ where: { productId: { in: ids } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });

    const { featured, sections } = await plan();

    expect(sections.comingSoonGrid).toEqual([]);
    expect(featured.id).toBe(firstActiveId);
    expect(featured.status).toBe("ACTIVE");
  });
});
