"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { buttonClass, inputClass, labelClass } from "./styles";

export type FilterOption = { value: string; label: string };

export type ProductFilterLabels = {
  legend: string;
  status: string;
  statusAll: string;
  category: string;
  categoryAll: string;
  search: string;
  searchPlaceholder: string;
  clear: string;
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The products list filters (spec FR-003). The URL is the only state, as in
 * OrderFilters: selects navigate at once, the search box after a 300ms pause,
 * and router.replace keeps typing out of the back-button history. The page
 * parses the query with zod and ignores invalid values.
 */
export function ProductFilters({
  statuses,
  categories,
  labels,
}: {
  statuses: FilterOption[];
  categories: FilterOption[];
  labels: ProductFilterLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get("status") ?? "";
  const category = params.get("category") ?? "";
  const urlQuery = params.get("q") ?? "";
  const [q, setQ] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A navigation that changes ?q (Clear filters, back button) resets the box.
  useEffect(() => setQ(urlQuery), [urlQuery]);
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  function navigate(next: { status?: string; category?: string; q?: string }) {
    const merged = { status, category, q: urlQuery, ...next };
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      const trimmed = value.trim();
      if (trimmed) query.set(key, trimmed);
    }
    const search = query.toString();
    startTransition(() => router.replace(search ? `${pathname}?${search}` : pathname));
  }

  // A select change carries the typed search with it and cancels the pending
  // debounce, whose closure still holds the old status and category.
  function onSelect(next: { status?: string; category?: string }) {
    if (timer.current) clearTimeout(timer.current);
    navigate({ ...next, q });
  }

  function onSearch(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value }), SEARCH_DEBOUNCE_MS);
  }

  const anyActive = status !== "" || category !== "" || urlQuery !== "";

  return (
    <form
      role="search"
      aria-label={labels.legend}
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate({ q });
      }}
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,16rem))_auto]"
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>{labels.status}</span>
        <select
          className={inputClass}
          value={status}
          onChange={(event) => onSelect({ status: event.target.value })}
        >
          <option value="">{labels.statusAll}</option>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>{labels.category}</span>
        <select
          className={inputClass}
          value={category}
          onChange={(event) => onSelect({ category: event.target.value })}
        >
          <option value="">{labels.categoryAll}</option>
          {categories.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className={labelClass}>{labels.search}</span>
        <input
          type="search"
          className={inputClass}
          placeholder={labels.searchPlaceholder}
          maxLength={100}
          value={q}
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>

      {anyActive && (
        <button
          type="button"
          className={buttonClass.ghost}
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            setQ("");
            startTransition(() => router.replace(pathname));
          }}
        >
          {labels.clear}
        </button>
      )}
    </form>
  );
}
