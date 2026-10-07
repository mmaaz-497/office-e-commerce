/**
 * The header search's query rule (007 data-model.md §search-query, research
 * R-704). The query crosses a server boundary, so it is normalised and capped
 * before it reaches the catalogue reader (Constitution IX).
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export const SEARCH_QUERY_MAX = 80;

/** One results page; the catalogue is small, so there is no pagination. */
export const SEARCH_RESULTS_MAX = 48;

export type SearchQuery = { q: string; empty: boolean };

export function parseSearchQuery(raw: unknown): SearchQuery {
  const first = Array.isArray(raw) ? raw[0] : raw;
  const text = typeof first === "string" ? first : "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  // Cap by code point, so a cut never leaves half a surrogate pair.
  const q = [...collapsed].slice(0, SEARCH_QUERY_MAX).join("").trim();
  return { q, empty: q === "" };
}

/** Escapes LIKE's wildcards and its escape character, so a query matches literally. */
export function escapeLikePattern(q: string): string {
  return q.replace(/[\\%_]/g, (character) => "\\" + character);
}
