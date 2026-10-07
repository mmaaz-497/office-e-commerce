import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel, testOrderData } from "./helpers/db";

/**
 * T022 — FR-019: a product's review summary, review list and sold count include
 * only that product's reviews and completed orders, plus its own baseline.
 * Rows with no product belong to the legacy product (R-202), and calling
 * without a product means the legacy product (/sp.analyze H2).
 */
let counter = 0;
function orderNumber(): string {
  counter += 1;
  return `TKS-PERPRD-${String(counter).padStart(5, "0")}`;
}

async function review(productId: string | null, rating: number) {
  await prisma.review.create({
    data: {
      origin: "OWNER_ENTERED",
      rating,
      reviewerName: "Uji",
      published: true,
      reviewedAt: new Date(),
      productId,
    },
  });
}

describe("reviews and sold count per product (integration)", () => {
  let legacyId: string;
  let otherId: string;

  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(5);
    legacyId = (await prisma.product.findUniqueOrThrow({ where: { slug: "slippers-gemoy" } })).id;
    otherId = (
      await seedProduct({ slug: "other-sandal", status: "ACTIVE", priceIDR: 99000, stock: 3 })
    ).id;
  });

  afterEach(async () => {
    await resetDb();
  });

  it("scopes the review summary to the product, counting unattributed rows for the legacy product", async () => {
    await review(legacyId, 5);
    await review(legacyId, 4);
    await review(null, 3);
    await review(otherId, 1);
    const { getReviewStats } = await import("@/infrastructure/db/review-stats");

    const legacy = await getReviewStats(legacyId);
    const other = await getReviewStats(otherId);

    expect(legacy.count).toBe(3);
    expect(legacy.average).toBe(4);
    expect(legacy.breakdown).toEqual({ 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 });
    expect(other.count).toBe(1);
    expect(other.average).toBe(1);
  });

  it("defaults to the legacy product when called without one", async () => {
    await review(legacyId, 5);
    await review(otherId, 1);
    const { getReviewStats, getPublishedReviews } =
      await import("@/infrastructure/db/review-stats");

    expect(await getReviewStats()).toEqual(await getReviewStats(legacyId));
    expect((await getPublishedReviews(1)).reviews).toHaveLength(1);
  });

  it("paginates the review list per product", async () => {
    for (let i = 0; i < 12; i += 1) await review(legacyId, 5);
    await review(otherId, 2);
    const { getPublishedReviews } = await import("@/infrastructure/db/review-stats");

    const page1 = await getPublishedReviews(1, legacyId);
    const page2 = await getPublishedReviews(2, legacyId);
    const other = await getPublishedReviews(1, otherId);

    expect(page1.reviews).toHaveLength(10);
    expect(page2.reviews).toHaveLength(2);
    expect(page1.totalPages).toBe(2);
    expect(other.reviews).toHaveLength(1);
    expect(other.totalPages).toBe(1);
  });

  it("sums each product's own baseline and completed orders", async () => {
    await prisma.product.update({ where: { id: legacyId }, data: { soldCountBaseline: 10 } });
    await prisma.product.update({ where: { id: otherId }, data: { soldCountBaseline: 4 } });
    await prisma.order.create({
      data: testOrderData({
        orderNumber: orderNumber(),
        status: "COMPLETED",
        quantity: 3,
        product: { connect: { id: legacyId } },
      }),
    });
    // Unattributed: belongs to the legacy product.
    await prisma.order.create({
      data: testOrderData({ orderNumber: orderNumber(), status: "COMPLETED", quantity: 2 }),
    });
    await prisma.order.create({
      data: testOrderData({
        orderNumber: orderNumber(),
        status: "COMPLETED",
        quantity: 7,
        product: { connect: { id: otherId } },
      }),
    });
    // Not completed: never counted.
    await prisma.order.create({
      data: testOrderData({
        orderNumber: orderNumber(),
        status: "SHIPPED",
        quantity: 9,
        product: { connect: { id: legacyId } },
      }),
    });
    const { getSoldCount } = await import("@/infrastructure/db/sold-count");

    expect(await getSoldCount(legacyId)).toBe(15); // 10 + 3 + 2
    expect(await getSoldCount(otherId)).toBe(11); // 4 + 7
    expect(await getSoldCount()).toBe(15);
  });

  it("returns null when a product's total is zero", async () => {
    const { getSoldCount } = await import("@/infrastructure/db/sold-count");

    expect(await getSoldCount(otherId)).toBeNull();
  });
});
