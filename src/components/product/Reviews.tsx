import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { ReviewStats } from "@/infrastructure/db/review-stats";
import type { PublishedReviewsPage } from "@/infrastructure/db/review-stats";

/**
 * Renders nothing at all when there are no published reviews (FR-047,
 * SC-013) — no "0 reviews" placeholder, no empty breakdown, no pagination
 * controls with nowhere to go. This is the hidden-when-empty rule, not a
 * loading state.
 *
 * Pagination stays on the page that shows the reviews — the homepage or the
 * product page — and lands on this section (007 FR-019, research R-711).
 */

const PAGE_LINK =
  "text-primary inline-flex min-h-11 items-center px-3 font-semibold underline underline-offset-4";

export async function Reviews({
  stats,
  page,
  locale,
  basePath,
}: {
  stats: ReviewStats;
  page: PublishedReviewsPage;
  locale: string;
  /** The current page's path, without query or hash. */
  basePath: string;
}) {
  if (stats.count === 0 || stats.average === null) return null;

  const t = await getTranslations("reviews");
  const pageHref = (n: number) => `${basePath}?reviewsPage=${n}#ulasan`;

  return (
    <section
      id="ulasan"
      aria-labelledby="ulasan-title"
      className="flex scroll-mt-28 flex-col gap-6"
    >
      <h2
        id="ulasan-title"
        className="text-ink text-xl leading-7 font-semibold lg:text-2xl lg:leading-8"
      >
        {t("title")}
      </h2>

      <div className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:gap-8 sm:p-6">
        <p className="flex items-baseline gap-1">
          <span className="text-ink text-[40px] leading-[48px] font-bold tabular-nums">
            {stats.average.toFixed(1)}
          </span>
          <span className="text-ink-3 text-sm">/ 5</span>
        </p>
        <div className="flex flex-col gap-1">
          {([5, 4, 3, 2, 1] as const).map((star) => (
            <div key={star} className="text-ink-2 flex items-center gap-2 text-sm">
              <span className="w-3 tabular-nums">{star}</span>
              <Icon name="star" className="text-accent h-3.5 w-3.5" />
              <div className="bg-surface-muted h-2 w-32 rounded-sm sm:w-48">
                <div
                  className="bg-accent h-2 rounded-sm"
                  style={{ width: `${(stats.breakdown[star] / stats.count) * 100}%` }}
                />
              </div>
              <span className="w-6 tabular-nums">{stats.breakdown[star]}</span>
            </div>
          ))}
        </div>
      </div>

      <ol className="flex flex-col">
        {page.reviews.map((review) => (
          <li key={review.id} className="border-border flex flex-col gap-1 border-t py-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-ink font-semibold">{review.reviewerName}</span>
              <span className="text-accent flex" aria-label={`${review.rating} / 5`}>
                {Array.from({ length: review.rating }, (_, index) => (
                  <Icon key={index} name="star" className="h-4 w-4" />
                ))}
              </span>
            </div>
            {review.comment && <p className="text-ink-2 text-base">{review.comment}</p>}
            <p className="text-ink-3 text-sm">{review.reviewedAt.toLocaleDateString(locale)}</p>
          </li>
        ))}
      </ol>

      {page.totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2">
          {page.page > 1 && (
            <Link href={pageHref(page.page - 1)} className={PAGE_LINK}>
              {t("previous")}
            </Link>
          )}
          <span className="text-ink-2 text-sm tabular-nums">
            {page.page} / {page.totalPages}
          </span>
          {page.page < page.totalPages && (
            <Link href={pageHref(page.page + 1)} className={PAGE_LINK}>
              {t("next")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
