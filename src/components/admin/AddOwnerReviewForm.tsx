"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addOwnerReview } from "@/app/actions/admin/reviews";

export function AddOwnerReviewForm({
  labels,
  errorMessages,
}: {
  labels: {
    rating: string;
    reviewerName: string;
    comment: string;
    reviewedAt: string;
    submit: string;
    submitting: string;
  };
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [reviewerName, setReviewerName] = useState("");
  const [comment, setComment] = useState("");
  const [reviewedAt, setReviewedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await addOwnerReview({
      rating,
      reviewerName,
      comment: comment || undefined,
      reviewedAt,
    });

    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessages[result.errorKey] ?? result.errorKey);
      return;
    }
    setReviewerName("");
    setComment("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="border-brown flex flex-col gap-3 rounded border p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.rating}</span>
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="border-brown rounded border px-3 py-2"
        >
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.reviewerName}</span>
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
        <span className="text-sm font-medium">{labels.comment}</span>
        <textarea
          maxLength={1000}
          className="border-brown rounded border px-3 py-2"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.reviewedAt}</span>
        <input
          required
          type="date"
          className="border-brown rounded border px-3 py-2"
          value={reviewedAt}
          onChange={(e) => setReviewedAt(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}
