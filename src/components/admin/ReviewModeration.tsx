"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { moderateReview } from "@/app/actions/admin/reviews";

export function ReviewModeration({
  reviewId,
  published,
  labels,
  errorMessages,
}: {
  reviewId: string;
  published: boolean;
  labels: { approve: string; unpublish: string; delete: string };
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "APPROVE" | "UNPUBLISH" | "DELETE") {
    setPending(true);
    setError(null);
    const result = await moderateReview({ reviewId, action });
    setPending(false);
    if (!result.ok) {
      setError(errorMessages[result.errorKey] ?? result.errorKey);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        {!published && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run("APPROVE")}
            className="bg-brown rounded px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {labels.approve}
          </button>
        )}
        {published && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run("UNPUBLISH")}
            className="border-brown text-brown rounded border px-3 py-2 text-sm disabled:opacity-50"
          >
            {labels.unpublish}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run("DELETE")}
          className="rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {labels.delete}
        </button>
      </div>
    </div>
  );
}
