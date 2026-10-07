"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { switchLocalePath } from "@/i18n/pathnames";
import { cx } from "./cx";

const LABELS: Record<AppLocale, string> = { id: "ID", en: "EN" };

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

function SwitcherLinks({ query }: { query: string }) {
  // next/navigation's usePathname reports the pathname the visitor actually
  // sees, i.e. after next-intl's slug rewrite — so "/en/check-order", not the
  // internal "/en/cek-pesanan". That is exactly what switchLocalePath expects.
  const pathname = usePathname();
  const active = pathname.split("/")[1];

  return (
    <nav
      aria-label="Language"
      // A segmented control rather than "ID | EN": it reads as a two-state
      // switch with one state already chosen, which is what it is.
      className="border-border-strong flex items-center rounded-md border"
    >
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={withQuery(switchLocalePath(pathname, locale), query)}
          hrefLang={locale}
          aria-current={locale === active ? "true" : undefined}
          className={cx(
            "inline-flex h-11 min-w-11 items-center justify-center px-3 text-sm font-semibold transition-colors duration-150 ease-out first:rounded-l-md last:rounded-r-md",
            locale === active
              ? "bg-primary-soft text-primary"
              : "text-ink-2 hover:bg-surface-muted",
          )}
        >
          {LABELS[locale]}
        </Link>
      ))}
    </nav>
  );
}

/**
 * ID | EN switcher (FR-067). Rendered in the header of every public page, so
 * it must survive static rendering: useSearchParams opts a statically
 * rendered route out of prerendering unless it sits behind a Suspense
 * boundary. Rather than drop the switcher from the static HTML, the boundary
 * falls back to the same switcher without the query string, and the
 * query-preserving version takes over on hydration. Either way the visitor
 * lands on the same page in the other language, never on the home page.
 */
export function LocaleSwitcher() {
  const query = useSearchParams().toString();
  return <SwitcherLinks query={query} />;
}

export function LocaleSwitcherFallback() {
  return <SwitcherLinks query="" />;
}
