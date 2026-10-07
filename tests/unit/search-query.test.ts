import { describe, expect, it } from "vitest";
import {
  SEARCH_QUERY_MAX,
  SEARCH_RESULTS_MAX,
  escapeLikePattern,
  parseSearchQuery,
} from "@/domain/catalogue/search-query";

/**
 * 007 T040 — the header search's query rule (data-model.md §search-query,
 * research R-704). The query crosses a server boundary, so it is normalised
 * and capped before it reaches the catalogue reader (Constitution IX).
 */

describe("parseSearchQuery", () => {
  it("treats a missing or non-string query as empty", () => {
    expect(parseSearchQuery(undefined)).toEqual({ q: "", empty: true });
    expect(parseSearchQuery(null)).toEqual({ q: "", empty: true });
    expect(parseSearchQuery(42)).toEqual({ q: "", empty: true });
  });

  it("takes the first value of a repeated parameter", () => {
    expect(parseSearchQuery(["sandal", "gemoy"])).toEqual({ q: "sandal", empty: false });
    expect(parseSearchQuery([])).toEqual({ q: "", empty: true });
  });

  it("trims and collapses internal whitespace", () => {
    expect(parseSearchQuery("  sandal   gemoy \n")).toEqual({ q: "sandal gemoy", empty: false });
  });

  it("is empty for whitespace only", () => {
    expect(parseSearchQuery(" \t ")).toEqual({ q: "", empty: true });
  });

  it("caps the query at 80 characters", () => {
    expect(SEARCH_QUERY_MAX).toBe(80);
    const { q } = parseSearchQuery("a".repeat(100));
    expect(q).toHaveLength(80);
  });

  it("caps by code point, never splitting a character in two", () => {
    const { q } = parseSearchQuery("😀".repeat(90));
    expect([...q]).toHaveLength(80);
    expect(q).toBe("😀".repeat(80));
  });

  it("re-trims after capping so a cut never leaves trailing space", () => {
    const { q } = parseSearchQuery(`${"a".repeat(79)} b`);
    expect(q).toBe("a".repeat(79));
  });
});

describe("escapeLikePattern", () => {
  it("escapes the LIKE wildcards and the escape character itself", () => {
    expect(escapeLikePattern("50%_\\")).toBe("50\\%\\_\\\\");
  });

  it("leaves ordinary text unchanged", () => {
    expect(escapeLikePattern("Sandal Gemoy")).toBe("Sandal Gemoy");
  });
});

describe("SEARCH_RESULTS_MAX", () => {
  it("caps one results page at 48 products", () => {
    expect(SEARCH_RESULTS_MAX).toBe(48);
  });
});
