"use client";

import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SEARCH_QUERY_MAX } from "@/domain/catalogue/search-query";

/**
 * The header search (007 FR-002 to FR-004, research R-704): a plain GET form,
 * so it works with JavaScript off. The only client part is reading `q` back
 * into the field on the results page; HeaderSearchFallback renders the same
 * form empty while that streams in, so the header never shifts.
 */

export interface HeaderSearchLabels {
  label: string;
  placeholder: string;
  submit: string;
}

function SearchForm({
  action,
  labels,
  defaultValue,
  idSuffix,
}: {
  action: string;
  labels: HeaderSearchLabels;
  defaultValue: string;
  /** The header renders two forms (desktop and mobile); ids must stay unique. */
  idSuffix: string;
}) {
  const inputId = `site-search-${idSuffix}`;
  return (
    <form role="search" method="get" action={action} className="relative flex w-full">
      <label htmlFor={inputId} className="sr-only">
        {labels.label}
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        defaultValue={defaultValue}
        maxLength={SEARCH_QUERY_MAX}
        enterKeyHint="search"
        autoComplete="off"
        placeholder={labels.placeholder}
        className="peer border-border-strong bg-surface text-ink placeholder:text-ink-3 hover:border-ink-3 focus:border-primary h-11 w-full min-w-0 rounded-md border pr-3 pl-12 text-base transition-colors duration-150 ease-out"
      />
      {/* The magnifier is the submit button, as in the marketplace search
          bars: one clean field, still submittable by pointer as well as Enter. */}
      <button
        type="submit"
        className="text-ink-3 hover:text-primary peer-focus:text-primary absolute inset-y-0 left-0 inline-flex w-11 items-center justify-center rounded-l-md transition-colors duration-150 ease-out"
      >
        <Icon name="search" className="h-5 w-5" />
        <span className="sr-only">{labels.submit}</span>
      </button>
    </form>
  );
}

export function HeaderSearch(props: {
  action: string;
  labels: HeaderSearchLabels;
  idSuffix: string;
}) {
  const q = useSearchParams().get("q") ?? "";
  // Keyed by the query, so a client-side navigation to new results refills the field.
  return <SearchForm key={q} {...props} defaultValue={q} />;
}

export function HeaderSearchFallback(props: {
  action: string;
  labels: HeaderSearchLabels;
  idSuffix: string;
}) {
  return <SearchForm {...props} defaultValue="" />;
}
