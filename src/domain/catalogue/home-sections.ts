import type { ProductStatus } from "./status";

/**
 * The homepage section thresholds (006 FR-022c, R-507; revised by 007 R-708):
 * one named rule, computed from each render's data. A section whose list is
 * empty renders nothing (honest content).
 *
 * The featured product has its own full block on the homepage, so the "more on
 * sale" grid holds the other ACTIVE products. Categories now appear in the
 * quick-access row, which has no threshold, so they are no longer planned here.
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export const SHOWCASE_MINIMUM = 2;

export function meetsShowcaseMinimum(count: number): boolean {
  return count >= SHOWCASE_MINIMUM;
}

/** The reviews section shows only real, published reviews (R-513). */
export function hasPublishedReviews(stats: { count: number }): boolean {
  return stats.count > 0;
}

export interface HomeSectionsPlan<P> {
  /** ACTIVE products other than the featured one; none below the minimum. */
  moreOnSale: P[];
  /** COMING_SOON products in catalogue order; none below the minimum. */
  comingSoonGrid: P[];
}

export function planHomeSections<P extends { id: string; status: ProductStatus }>({
  products,
  featuredId,
}: {
  products: readonly P[];
  featuredId: string | null;
}): HomeSectionsPlan<P> {
  const others = products.filter(
    (product) => product.status === "ACTIVE" && product.id !== featuredId,
  );
  const comingSoon = products.filter((product) => product.status === "COMING_SOON");
  return {
    moreOnSale: meetsShowcaseMinimum(others.length) ? others : [],
    comingSoonGrid: meetsShowcaseMinimum(comingSoon.length) ? comingSoon : [],
  };
}
