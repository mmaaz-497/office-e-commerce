import { getAdminTranslations } from "@/i18n/admin";
import { getAdminReviewList } from "@/infrastructure/db/admin-reviews";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";
import { ReviewModeration } from "@/components/admin/ReviewModeration";
import { AddOwnerReviewForm } from "@/components/admin/AddOwnerReviewForm";

export default async function AdminReviewsPage() {
  const [t, reviews, errorMessages] = await Promise.all([
    getAdminTranslations("admin.reviews"),
    getAdminReviewList(),
    getAdminErrorMessages(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>

      <section>
        <h2 className="mb-2 font-bold">{t("addOwnerReview")}</h2>
        <AddOwnerReviewForm
          labels={{
            rating: t("form.rating"),
            reviewerName: t("form.reviewerName"),
            comment: t("form.comment"),
            reviewedAt: t("form.reviewedAt"),
            submit: t("form.submit"),
            submitting: t("form.submitting"),
          }}
          errorMessages={errorMessages}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold">{t("list")}</h2>
        {reviews.map((review) => (
          <div
            key={review.id}
            className="border-brown flex flex-col gap-1 rounded border p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {review.reviewerName} — {"★".repeat(review.rating)}
              </span>
              <span className={review.published ? "text-green-700" : "text-amber-700"}>
                {review.published ? t("published") : t("unpublished")}
              </span>
            </div>
            {review.comment && <p>{review.comment}</p>}
            <p className="text-xs">
              {review.origin} · {review.reviewedAt.toISOString().slice(0, 10)}
              {review.order && ` · ${review.order.orderNumber}`}
            </p>
            <ReviewModeration
              reviewId={review.id}
              published={review.published}
              labels={{
                approve: t("actions.approve"),
                unpublish: t("actions.unpublish"),
                delete: t("actions.delete"),
              }}
              errorMessages={errorMessages}
            />
          </div>
        ))}
      </section>
    </main>
  );
}
