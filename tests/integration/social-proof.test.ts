import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-SPF${String(orderNumberCounter).padStart(2, "0")}`;
}

/** FR-047, FR-049, FR-053, SC-013: hidden-when-empty rule. */
describe("hidden-when-empty social proof (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("with zero published reviews the aggregate returns null, not 0", async () => {
    const { getReviewStats } = await import("@/infrastructure/db/review-stats");

    const stats = await getReviewStats();

    expect(stats.average).toBeNull();
    expect(stats.count).toBe(0);
    expect(stats.breakdown).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });

  it("unpublished reviews affect neither the average nor the breakdown", async () => {
    const { getReviewStats } = await import("@/infrastructure/db/review-stats");

    await prisma.review.create({
      data: {
        origin: "OWNER_ENTERED",
        rating: 1,
        reviewerName: "Unpublished Reviewer",
        published: false,
        reviewedAt: new Date(),
      },
    });

    const stats = await getReviewStats();

    expect(stats.average).toBeNull();
    expect(stats.count).toBe(0);
    expect(stats.breakdown[1]).toBe(0);
  });

  it("published reviews are aggregated correctly once they exist", async () => {
    const { getReviewStats } = await import("@/infrastructure/db/review-stats");

    await prisma.review.createMany({
      data: [
        {
          origin: "OWNER_ENTERED",
          rating: 5,
          reviewerName: "A",
          published: true,
          reviewedAt: new Date(),
        },
        {
          origin: "OWNER_ENTERED",
          rating: 3,
          reviewerName: "B",
          published: true,
          reviewedAt: new Date(),
        },
        // still unpublished — must not shift the average
        {
          origin: "OWNER_ENTERED",
          rating: 1,
          reviewerName: "C",
          published: false,
          reviewedAt: new Date(),
        },
      ],
    });

    const stats = await getReviewStats();

    expect(stats.count).toBe(2);
    expect(stats.average).toBe(4); // (5 + 3) / 2
    expect(stats.breakdown).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 });
  });

  it("with a zero sold total, getSoldCount returns null", async () => {
    const { getSoldCount } = await import("@/infrastructure/db/sold-count");

    const soldCount = await getSoldCount();

    expect(soldCount).toBeNull();
  });

  it("getSoldCount sums the baseline and completed-order quantities, excluding a RETURNED order", async () => {
    const { getSoldCount } = await import("@/infrastructure/db/sold-count");

    // 003: the baseline lives on the product (spec Assumptions)
    await prisma.product.update({
      where: { slug: "slippers-gemoy" },
      data: { soldCountBaseline: 10 },
    });
    await prisma.order.create({
      data: testOrderData({ orderNumber: validOrderNumber(), status: "COMPLETED", quantity: 3 }),
    });
    await prisma.order.create({
      data: testOrderData({ orderNumber: validOrderNumber(), status: "RETURNED", quantity: 5 }),
    });

    const soldCount = await getSoldCount();

    expect(soldCount).toBe(13); // 10 baseline + 3 completed; the returned order's 5 is excluded
  });
});
