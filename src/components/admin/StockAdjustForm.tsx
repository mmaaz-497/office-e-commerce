"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/app/actions/admin/stock";

export function StockAdjustForm({
  labels,
  errorMessages,
}: {
  labels: { delta: string; note: string; submit: string; submitting: string };
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await adjustStock({ delta: Number(delta), note });

    setSubmitting(false);
    if (!result.ok) {
      setError(errorMessages[result.errorKey] ?? result.errorKey);
      return;
    }
    setDelta("");
    setNote("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.delta}</span>
        <input
          required
          type="number"
          step={1}
          className="border-brown rounded border px-3 py-2"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{labels.note}</span>
        <input
          required
          minLength={1}
          maxLength={500}
          className="border-brown rounded border px-3 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
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
