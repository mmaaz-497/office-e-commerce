"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { lookupOrder } from "@/app/actions/lookup";
import { submitReview } from "@/app/actions/review";

type Stage =
  | { step: "credentials" }
  | { step: "form"; orderNumber: string; phone: string; reviewerName: string };

/**
 * Two steps because the reviewer name is pre-filled from the order (spec
 * A-003), which requires knowing the order before the rating form can
 * render — reuses lookupOrder for that verification rather than a second,
 * near-identical "check eligibility" action.
 */
export function ReviewForm() {
  const t = useTranslations("review");
  // errorKey already carries the "errors." prefix, so resolve it at the root.
  const tErrors = useTranslations();

  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [stage, setStage] = useState<Stage>({ step: "credentials" });
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyError(null);

    const result = await lookupOrder({ orderNumber: orderNumber.trim(), phone });

    setVerifying(false);
    if (!result.ok) {
      setVerifyError(tErrors(result.errorKey));
      return;
    }
    if (result.order.status !== "COMPLETED") {
      setVerifyError(tErrors("reviewNotEligible"));
      return;
    }
    setReviewerName(result.order.customerName);
    setStage({
      step: "form",
      orderNumber: orderNumber.trim(),
      phone,
      reviewerName: result.order.customerName,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    if (stage.step !== "form") return;
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    const result = await submitReview({
      orderNumber: stage.orderNumber,
      phone: stage.phone,
      rating,
      comment: comment || undefined,
      reviewerName,
    });

    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(tErrors(result.errorKey));
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-lg p-4">
        <p className="text-brown-dark text-lg font-semibold">{t("submitted")}</p>
      </main>
    );
  }

  if (stage.step === "credentials") {
    return (
      <main className="mx-auto max-w-lg p-4">
        <form onSubmit={handleVerify} className="flex flex-col gap-4">
          <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("form.orderNumber")}</span>
            <input
              required
              className="border-brown rounded border px-3 py-2 font-mono uppercase"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("form.phone")}</span>
            <input
              required
              type="tel"
              className="border-brown rounded border px-3 py-2"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          {verifyError && (
            <p role="alert" className="text-sm text-red-700">
              {verifyError}
            </p>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {verifying ? t("form.verifying") : t("form.verify")}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>

        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">{t("form.rating")}</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                aria-label={t("form.starLabel", { star })}
                aria-pressed={star <= rating}
                className={`text-3xl ${star <= rating ? "text-brown" : "text-cream-dark"}`}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("form.reviewerName")}</span>
          <input
            required
            minLength={2}
            maxLength={60}
            className="border-brown rounded border px-3 py-2"
            value={reviewerName}
            onChange={(e) => setReviewerName(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("form.comment")}</span>
          <textarea
            maxLength={1000}
            className="border-brown rounded border px-3 py-2"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>

        {submitError && (
          <p role="alert" className="text-sm text-red-700">
            {submitError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>
      </form>
    </main>
  );
}
