import { pathnames, routing, type AppLocale, type InternalPathname } from "./routing";

/**
 * Pure translation between the internal route manifest and the externally
 * visible, locale-prefixed URLs. Kept free of React and of next/navigation so
 * the switcher's behaviour (FR-067) can be asserted directly rather than
 * inferred from a rendered page — see tests/integration/locale-routing.test.ts.
 */

const INTERNAL_PATHNAMES = Object.keys(pathnames) as InternalPathname[];

function isAppLocale(value: string): value is AppLocale {
  return (routing.locales as readonly string[]).includes(value);
}

/**
 * Route params arrive typed as plain strings. The [locale] layout has already
 * called notFound() for anything outside routing.locales, so by the time a
 * page body runs this is a narrowing, not a validation.
 */
export function asAppLocale(value: string): AppLocale {
  return isAppLocale(value) ? value : routing.defaultLocale;
}

/** The externally visible slug template for one route in one language. */
export function externalTemplate(internal: InternalPathname, locale: AppLocale): string {
  const entry = pathnames[internal];
  return typeof entry === "string" ? entry : entry[locale];
}

function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment !== "");
}

/**
 * Matches a concrete path against a slug template, returning the captured
 * dynamic segments, or null when the shapes differ. Only [param] segments
 * exist in this manifest — there are no catch-all routes.
 */
function matchTemplate(template: string, pathname: string): Record<string, string> | null {
  const templateSegments = segmentsOf(template);
  const pathSegments = segmentsOf(pathname);
  if (templateSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (const [index, templateSegment] of templateSegments.entries()) {
    const pathSegment = pathSegments[index];
    if (templateSegment.startsWith("[") && templateSegment.endsWith("]")) {
      params[templateSegment.slice(1, -1)] = pathSegment;
      continue;
    }
    if (templateSegment !== pathSegment) return null;
  }
  return params;
}

function fillTemplate(template: string, params: Record<string, string>): string {
  return template.replace(/\[([^\]]+)\]/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(`Missing param "${name}" for pathname template "${template}"`);
    }
    return encodeURIComponent(value);
  });
}

/**
 * Builds the href for an internal route in a given language, e.g.
 * localeHref("/cek-pesanan", "en") → "/en/check-order".
 * Use this instead of interpolating `/${locale}/slug` by hand: the Indonesian
 * and English slugs differ for most routes, and a hand-built English href
 * would 404.
 */
export function localeHref(
  internal: InternalPathname,
  locale: AppLocale,
  params: Record<string, string> = {},
): string {
  const filled = fillTemplate(externalTemplate(internal, locale), params);
  return filled === "/" ? `/${locale}` : `/${locale}${filled}`;
}

/** Splits "/en/check-order" into its locale and the rest of the path. */
function splitLocale(pathname: string): { locale: AppLocale | null; rest: string } {
  const segments = segmentsOf(pathname);
  const [first, ...others] = segments;
  if (first !== undefined && isAppLocale(first)) {
    return { locale: first, rest: `/${others.join("/")}` };
  }
  return { locale: null, rest: pathname };
}

/**
 * The switcher's whole job: given the path the visitor is on, produce the
 * path for the same page in the other language (FR-067). Falls back to that
 * language's home page only when the current path matches no known route —
 * a 404, for instance, has no counterpart to switch to.
 */
export function switchLocalePath(currentPath: string, target: AppLocale): string {
  const { locale: source, rest } = splitLocale(currentPath);
  const from = source ?? routing.defaultLocale;

  for (const internal of INTERNAL_PATHNAMES) {
    const params = matchTemplate(externalTemplate(internal, from), rest);
    if (params) return localeHref(internal, target, params);
  }
  return `/${target}`;
}

/** The other language. There are exactly two (FR-064). */
export function otherLocale(locale: AppLocale): AppLocale {
  return locale === "id" ? "en" : "id";
}
