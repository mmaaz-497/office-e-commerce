import { prisma } from "./prisma";
import { getLegacyProductId, productScope } from "./catalogue";

const PAGE_SIZE = 10;

export type ReviewBreakdown = Record<1 | 2 | 3 | 4 | 5, number>;

export type ReviewStats = {
  /** null, never 0, when there are no published reviews — the UI hides the
   * entire rating block on null rather than rendering a misleading "0"
   * (FR-047, SC-013). */
  average: number | null;
  count: number;
  breakdown: ReviewBreakdown;
};

const EMPTY_BREAKDOWN: ReviewBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

/**
 * The "published reviews of this product" filter (FR-019). Omitting the
 * product means the legacy product, which keeps every pre-catalogue call site
 * valid (/sp.analyze H2); null when there is no catalogue yet.
 */
async function publishedReviewsOf(productId: string | undefined) {
  const legacyProductId = await getLegacyProductId();
  const id = productId ?? legacyProductId;
  if (!id) return null;
  return { published: true, ...productScope(id, legacyProductId) };
}

/** Aggregates only published reviews (FR-046, FR-047) — an unpublished
 * review, however old, affects neither the average nor the breakdown. Scoped
 * to one product; unattributed rows count for the legacy product (R-202). */
export async function getReviewStats(productId?: string): Promise<ReviewStats> {
  const where = await publishedReviewsOf(productId);
  if (!where) return { average: null, count: 0, breakdown: { ...EMPTY_BREAKDOWN } };

  const [aggregate, grouped] = await Promise.all([
    prisma.review.aggregate({
      where,
      _avg: { rating: true },
      _count: true,
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where,
      _count: true,
    }),
  ]);

  const breakdown: ReviewBreakdown = { ...EMPTY_BREAKDOWN };
  for (const row of grouped) {
    breakdown[row.rating as 1 | 2 | 3 | 4 | 5] = row._count;
  }

  return {
    average: aggregate._count > 0 ? aggregate._avg.rating : null,
    count: aggregate._count,
    breakdown,
  };
}

export type PublishedReviewsPage = {
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    reviewerName: string;
    reviewedAt: Date;
  }>;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** 10 per page, newest first (spec A-006), for one product (FR-019). */
export async function getPublishedReviews(
  page: number,
  productId?: string,
): Promise<PublishedReviewsPage> {
  const safePage = Math.max(1, page);
  const where = await publishedReviewsOf(productId);
  if (!where) return { reviews: [], page: safePage, pageSize: PAGE_SIZE, totalPages: 1 };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { reviewedAt: "desc" },
      skip: (safePage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, rating: true, comment: true, reviewerName: true, reviewedAt: true },
    }),
    prisma.review.count({ where }),
  ]);

  return {
    reviews,
    page: safePage,
    pageSize: PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
