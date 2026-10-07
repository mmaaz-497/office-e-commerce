"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export type FilterOption = { value: string; label: string };

export type OrderFilterLabels = {
  status: string;
  allStatuses: string;
  paymentMethod: string;
  allPaymentMethods: string;
  period: string;
  allTime: string;
  search: string;
  searchPlaceholder: string;
  apply: string;
  applying: string;
  reset: string;
};

/**
 * The order list's filter row.
 *
 * It was a plain `<form method="get">` whose only way to take effect was the
 * Apply button — change a dropdown and the page sat there, which reads exactly
 * like a filter that does not work. Selecting now navigates immediately, and
 * `useTransition` dims the row while the server re-queries, so the click is
 * visibly doing something.
 *
 * Two deliberate choices keep it honest:
 *
 *  - The URL is the only state. Each control is uncontrolled with a `key` taken
 *    from the URL, so the browser keeps the operator's pick with no flicker, and
 *    a navigation that changes the query — "Reset filters", the back button, a
 *    link in from the dashboard — remounts the controls to match. Holding the
 *    values in `useState` instead would leave the dropdowns showing a filter
 *    that is no longer applied.
 *  - Submitting reads the live form with `FormData`, so the four fields are
 *    always read together and cannot drift apart.
 *
 * The form keeps its `method="get"` and its field names, so with JavaScript
 * unavailable it still submits natively the way it always did — everything here
 * is an enhancement, not the mechanism.
 */
export function OrderFilters({
  statuses,
  paymentMethods,
  periods,
  labels,
}: {
  statuses: FilterOption[];
  paymentMethods: FilterOption[];
  periods: FilterOption[];
  labels: OrderFilterLabels;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const current = {
    status: params.get("status") ?? "",
    paymentMethod: params.get("paymentMethod") ?? "",
    period: params.get("period") ?? "",
    search: params.get("search") ?? "",
  };
  const anyActive = Object.values(current).some((value) => value !== "");

  function submit(form: HTMLFormElement) {
    // Empty fields are left out rather than sent as `status=&search=`, so the
    // URL the operator can bookmark or share says only what is actually filtered.
    const next = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      const trimmed = String(value).trim();
      if (trimmed) next.set(key, trimmed);
    }
    const query = next.toString();
    startTransition(() => router.push(query ? `/admin/orders?${query}` : "/admin/orders"));
  }

  const selectClass =
    "border-brown bg-shell text-brown-dark rounded border px-2 py-2 text-sm disabled:opacity-60";
  const fieldLabelClass = "text-brown/70 text-[11px] font-medium";

  return (
    <form
      method="get"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      className={`flex flex-wrap items-end gap-2 transition-opacity ${pending ? "opacity-60" : ""}`}
    >
      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>{labels.status}</span>
        <select
          key={`status-${current.status}`}
          name="status"
          className={selectClass}
          defaultValue={current.status}
          disabled={pending}
          onChange={(event) => submit(event.currentTarget.form!)}
        >
          <option value="">{labels.allStatuses}</option>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>{labels.paymentMethod}</span>
        <select
          key={`payment-${current.paymentMethod}`}
          name="paymentMethod"
          className={selectClass}
          defaultValue={current.paymentMethod}
          disabled={pending}
          onChange={(event) => submit(event.currentTarget.form!)}
        >
          <option value="">{labels.allPaymentMethods}</option>
          {paymentMethods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={fieldLabelClass}>{labels.period}</span>
        <select
          key={`period-${current.period}`}
          name="period"
          className={selectClass}
          defaultValue={current.period}
          disabled={pending}
          onChange={(event) => submit(event.currentTarget.form!)}
        >
          <option value="">{labels.allTime}</option>
          {periods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-xs">
        <span className={fieldLabelClass}>{labels.search}</span>
        {/* Not disabled while pending, and it does not navigate as you type — a
            query per keystroke, and a box that goes dead mid-word, are both
            worse than waiting for Enter. */}
        <input
          key={`search-${current.search}`}
          type="text"
          name="search"
          className="border-brown bg-shell text-brown-dark min-w-0 rounded border px-2 py-2 text-sm"
          placeholder={labels.searchPlaceholder}
          defaultValue={current.search}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="bg-brown hover:bg-brown-dark rounded px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60"
      >
        {pending ? labels.applying : labels.apply}
      </button>

      {/* A link, not a button, so clearing works without JavaScript too. */}
      {anyActive && (
        <Link
          href="/admin/orders"
          className="text-brown hover:text-brown-dark px-2 py-2 text-sm font-semibold underline underline-offset-2"
        >
          {labels.reset}
        </Link>
      )}
    </form>
  );
}
