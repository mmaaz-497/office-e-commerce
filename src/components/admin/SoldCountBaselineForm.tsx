"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSoldCountBaseline } from "@/app/actions/admin/settings";

export function SoldCountBaselineForm({
  initialValue,
  labels,
  errorMessages,
}: {
  initialValue: number;
  labels: { baseline: string; submit: string; submitting: string };
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [baseline, setBaseline] = useState(String(initialValue));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await setSoldCountBaseline({ baseline: Number(baseline) });

    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessages[result.errorKey] ?? result.errorKey);
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.baseline}</span>
        <input
          required
          type="number"
          min={0}
          step={1}
          className="border-brown rounded border px-3 py-2"
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
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
