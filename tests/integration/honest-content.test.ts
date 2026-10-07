import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { assertSeedAllowed } from "@/infrastructure/db/seed-guard";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getReviewStats } from "@/infrastructure/db/review-stats";
import { getSoldCount } from "@/infrastructure/db/sold-count";
import { resetDb, seedProduct, seedStockLevel, testOrderData } from "./helpers/db";

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-HNC${String(orderNumberCounter).padStart(2, "0")}`;
}

/** FR-052, SC-012, Constitution Principle VII: no fabricated social proof
 * can reach production. */
describe("no fabricated social proof reaches production (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("every published review is either OWNER_ENTERED or tied to a real completed order", async () => {
    const completedOrder = await prisma.order.create({
      data: testOrderData({ orderNumber: validOrderNumber(), status: "COMPLETED" }),
    });
    await prisma.review.create({
      data: {
        orderId: completedOrder.id,
        origin: "VERIFIED_PURCHASE",
        rating: 5,
        reviewerName: "Real Customer",
        published: true,
        reviewedAt: new Date(),
      },
    });
    await prisma.review.create({
      data: {
        orderId: null,
        origin: "OWNER_ENTERED",
        rating: 4,
        reviewerName: "Offline Customer",
        published: true,
        reviewedAt: new Date(),
      },
    });

    const published = await prisma.review.findMany({
      where: { published: true },
      include: { order: true },
    });

    expect(published).toHaveLength(2);
    for (const review of published) {
      const isHonest =
        review.origin === "OWNER_ENTERED" ||
        (review.origin === "VERIFIED_PURCHASE" && review.order !== null);
      expect(isHonest).toBe(true);
    }
  });

  /**
   * Confirmed twice over: (1) by actually running `npm run seed:production`
   * against a freshly wiped database during this task and observing
   * `prisma.review.count()` return 0 — seed.production.ts never creates a
   * Review row at all, so there is nothing for the reviews section to render
   * on a fresh production database; (2) here, by actually invoking the same
   * guard the dev seed calls, under both disqualifying conditions, rather
   * than asserting from reading seed.dev.ts's source.
   */
  it("the dev seed's guard refuses under NODE_ENV=production", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: "postgresql://x/y" }),
    ).toThrow(/NODE_ENV=production/);
  });

  it("the dev seed's guard refuses under a production-shaped DATABASE_URL even with NODE_ENV unset", () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL:
          "postgresql://prod_user:secret@prod-db.tokoshopee.example.com:5432/tokoshopee_production",
      }),
    ).toThrow(/not a recognised local database/);
  });
});

/**
 * 007 T008 — the homepage buy box shows only real data (FR-015, FR-024,
 * research R-710). The rating line and the sold count key off these readers'
 * "nothing yet" values, and the trust row carries facts, not slogans.
 */
describe("the buy box shows only real data (007, integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("a product with no published reviews and no completed orders has nothing to show", async () => {
    const product = await seedProduct({
      slug: "honest-buy-box",
      status: "ACTIVE",
      priceIDR: 169999,
      stock: 5,
    });
    await prisma.product.update({ where: { id: product.id }, data: { soldCountBaseline: 0 } });

    expect((await getReviewStats(product.id)).count).toBe(0);
    expect(await getSoldCount(product.id)).toBeNull();
  });

  it("the buy box and its trust row carry no unverifiable store slogans", () => {
    for (const file of ["BuyBox.tsx", "TrustRow.tsx"]) {
      const source = readFileSync(path.join("src/components/product", file), "utf8");
      expect(source).not.toMatch(/trust\.(premium|fastDelivery)/);
    }
  });
});
