import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCTS_PER_PAGE,
  paginate,
  parseProductListingQuery,
  sortListedProducts,
} from "@/domain/catalogue/product-listing";
import type { ProductStatus } from "@/domain/catalogue/status";

/**
 * The all-products page's rules (/produk, /en/products): query parsing, the
 * three sorts and pagination.
 */

const product = (
  id: string,
  status: ProductStatus,
  priceIDR: number | null,
  createdAt: string,
) => ({ id, status, priceIDR, createdAt: new Date(createdAt) });

const ids = (products: Array<{ id: string }>) => products.map((p) => p.id);

describe("parseProductListingQuery", () => {
  it("defaults to newest, page 1", () => {
    expect(parseProductListingQuery({})).toEqual({ sort: "newest", page: 1 });
    expect(DEFAULT_PRODUCT_SORT).toBe("newest");
  });

  it.each(["newest", "price-asc", "price-desc"] as const)("accepts sort=%s", (sort) => {
    expect(parseProductListingQuery({ sort }).sort).toBe(sort);
  });

  it.each([["cheapest"], [""], [42], [["price-desc", "newest"]]])(
    "reads %j as the default sort unless it is a known first value",
    (sort) => {
      const parsed = parseProductListingQuery({ sort });
      expect(parsed.sort).toBe(Array.isArray(sort) ? "price-desc" : "newest");
    },
  );

  it.each([
    ["3", 3],
    [["2", "5"], 2],
    ["0", 1],
    ["-1", 1],
    ["2.5", 1],
    ["1e3", 1],
    ["abc", 1],
    ["01", 1],
    ["9999999", 1],
  ])("reads page=%j as %i", (page, expected) => {
    expect(parseProductListingQuery({ page }).page).toBe(expected);
  });
});

describe("sortListedProducts", () => {
  const products = [
    product("old-active", "ACTIVE", 50_000, "2026-01-01"),
    product("soon-priced", "COMING_SOON", 1_000, "2026-03-01"),
    product("new-active", "ACTIVE", 200_000, "2026-04-01"),
    product("soon", "COMING_SOON", null, "2026-02-01"),
    product("mid-active", "ACTIVE", 100_000, "2026-02-15"),
  ];

  it("newest puts the most recently created first, whatever the status", () => {
    expect(ids(sortListedProducts(products, "newest"))).toEqual([
      "new-active",
      "soon-priced",
      "mid-active",
      "soon",
      "old-active",
    ]);
  });

  it("price low to high ranks products on sale, then Coming Soon in catalogue order", () => {
    expect(ids(sortListedProducts(products, "price-asc"))).toEqual([
      "old-active",
      "mid-active",
      "new-active",
      "soon-priced",
      "soon",
    ]);
  });

  it("price high to low still keeps Coming Soon after every product on sale", () => {
    expect(ids(sortListedProducts(products, "price-desc"))).toEqual([
      "new-active",
      "mid-active",
      "old-active",
      "soon-priced",
      "soon",
    ]);
  });

  it("a stored price on a Coming Soon product never decides its place (R-408)", () => {
    const soon = [
      product("a", "COMING_SOON", 90_000, "2026-01-01"),
      product("b", "COMING_SOON", 10_000, "2026-01-01"),
    ];
    expect(ids(sortListedProducts(soon, "price-asc"))).toEqual(["a", "b"]);
    expect(ids(sortListedProducts(soon, "price-desc"))).toEqual(["a", "b"]);
  });

  it("does not reorder its input", () => {
    const input = [...products];
    sortListedProducts(input, "price-asc");
    expect(input).toEqual(products);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: PRODUCTS_PER_PAGE * 2 + 1 }, (_, i) => i);

  it("splits into pages of PRODUCTS_PER_PAGE", () => {
    expect(paginate(items, 1)).toMatchObject({ page: 1, pageCount: 3, total: items.length });
    expect(paginate(items, 1).items).toHaveLength(PRODUCTS_PER_PAGE);
    expect(paginate(items, 3).items).toEqual([PRODUCTS_PER_PAGE * 2]);
  });

  it("a page past the last is the last page", () => {
    expect(paginate(items, 4)).toEqual(paginate(items, 3));
    expect(paginate(items, 99).page).toBe(3);
  });

  it("an empty list is one empty page, so the empty state can render", () => {
    expect(paginate([], 1)).toEqual({ items: [], page: 1, pageCount: 1, total: 0 });
    expect(paginate([], 2)).toEqual(paginate([], 1));
  });
});
