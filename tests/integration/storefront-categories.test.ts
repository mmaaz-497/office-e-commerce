import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductStatus } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedCategory, seedProduct } from "./helpers/db";

/**
 * 006 T032, research R-506. A category is on the storefront only while it has
 * a listed (ACTIVE or COMING_SOON) product: DRAFT-only and empty categories
 * drop out of the header, footer, tiles and category page alike.
 */

async function productIn(categorySlug: string, slug: string, status: ProductStatus) {
  const product = await seedProduct({
    slug,
    status,
    priceIDR: status === "ACTIVE" ? 100000 : null,
  });
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: categorySlug } });
  await prisma.product.update({ where: { id: product.id }, data: { categoryId: category.id } });
}

describe("storefront categories (integration, 006 US2)", () => {
  beforeAll(async () => {
    await resetDb();
    // `sandal` is created by seedProduct; it gets an ACTIVE product below.
    await seedCategory({ slug: "tas", nameId: "Tas", nameEn: "Bags", position: 2 });
    await seedCategory({
      slug: "topi",
      nameId: "Topi",
      nameEn: "Hats",
      position: 1,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    });
    await seedCategory({
      slug: "kaos",
      nameId: "Kaos",
      nameEn: "T-shirts",
      position: 1,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedCategory({ slug: "draf", nameId: "Draf", nameEn: "Drafts", position: 0 });
    await seedCategory({ slug: "kosong", nameId: "Kosong", nameEn: "Empty", position: 0 });

    await productIn("sandal", "sandal-aktif", "ACTIVE");
    await prisma.category.update({ where: { slug: "sandal" }, data: { position: 3 } });
    await productIn("tas", "tas-segera", "COMING_SOON");
    await productIn("topi", "topi-aktif", "ACTIVE");
    await productIn("kaos", "kaos-segera", "COMING_SOON");
    await productIn("kaos", "kaos-draf", "DRAFT");
    await productIn("draf", "draf-saja", "DRAFT");
  });

  afterAll(async () => {
    await resetDb();
  });

  it("returns only categories with an ACTIVE or COMING_SOON product, by position then createdAt", async () => {
    const { listStorefrontCategories } = await import("@/infrastructure/db/catalogue");

    const categories = await listStorefrontCategories("id");

    expect(categories.map((category) => category.slug)).toEqual(["kaos", "topi", "tas", "sandal"]);
  });

  it("excludes a DRAFT-only category and an empty one", async () => {
    const { listStorefrontCategories } = await import("@/infrastructure/db/catalogue");

    const slugs = (await listStorefrontCategories("en")).map((category) => category.slug);

    expect(slugs).not.toContain("draf");
    expect(slugs).not.toContain("kosong");
  });

  it("chooses the name by locale", async () => {
    const { listStorefrontCategories } = await import("@/infrastructure/db/catalogue");

    expect(await listStorefrontCategories("id")).toContainEqual({ slug: "tas", name: "Tas" });
    expect(await listStorefrontCategories("en")).toContainEqual({ slug: "tas", name: "Bags" });
  });

  it("looks up one storefront category by slug", async () => {
    const { getStorefrontCategory } = await import("@/infrastructure/db/catalogue");

    expect(await getStorefrontCategory("kaos", "en")).toEqual({ slug: "kaos", name: "T-shirts" });
  });

  it("returns null for an unknown slug and for a DRAFT-only category", async () => {
    const { getStorefrontCategory } = await import("@/infrastructure/db/catalogue");

    expect(await getStorefrontCategory("tidak-ada", "id")).toBeNull();
    expect(await getStorefrontCategory("draf", "id")).toBeNull();
    expect(await getStorefrontCategory("kosong", "id")).toBeNull();
  });
});
