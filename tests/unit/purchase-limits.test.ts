import { describe, expect, it } from "vitest";
import {
  LOW_STOCK_THRESHOLD,
  MAX_ORDER_QUANTITY,
  maxOrderQuantity,
  stockBadge,
} from "@/domain/catalogue/purchase-limits";

/**
 * 007 T003 — the buy box's quantity cap and stock badge (data-model.md
 * §purchase-limits, research R-703). The cap is a convenience only: checkout
 * re-checks stock in its own transaction (Constitution VI).
 */

describe("maxOrderQuantity", () => {
  it.each([
    [0, 0],
    [3, 3],
    [10, 10],
    [50, 10],
    [-2, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [2.7, 2],
  ])("stock %s → %s", (stock, expected) => {
    expect(maxOrderQuantity(stock)).toBe(expected);
  });

  it("never exceeds the checkout schema's maximum of 10", () => {
    expect(MAX_ORDER_QUANTITY).toBe(10);
  });
});

describe("stockBadge", () => {
  it("is out at zero or below", () => {
    expect(stockBadge(0)).toEqual({ kind: "out" });
    expect(stockBadge(-1)).toEqual({ kind: "out" });
  });

  it("is low from 1 up to the threshold, with the real remaining count", () => {
    expect(LOW_STOCK_THRESHOLD).toBe(5);
    expect(stockBadge(1)).toEqual({ kind: "low", remaining: 1 });
    expect(stockBadge(5)).toEqual({ kind: "low", remaining: 5 });
  });

  it("is in stock above the threshold", () => {
    expect(stockBadge(6)).toEqual({ kind: "inStock" });
    expect(stockBadge(240)).toEqual({ kind: "inStock" });
  });
});
