import { describe, expect, it } from "vitest";
import { cardBadges, productCardState } from "@/domain/catalogue/card-state";

/**
 * 006 T013 — the product card rules (data-model.md §ProductCardState,
 * research R-504). The discount rounds down so it never overstates.
 */

const active = (priceIDR: number, compareAtPriceIDR: number | null = null) => ({
  status: "ACTIVE" as const,
  priceIDR,
  compareAtPriceIDR,
});

describe("productCardState", () => {
  it("COMING_SOON is comingSoon, with no price or stock state", () => {
    expect(
      productCardState({ status: "COMING_SOON", priceIDR: 150000, compareAtPriceIDR: 200000 }, 0),
    ).toEqual({ kind: "comingSoon" });
  });

  it("ACTIVE without compare-at and in stock has no discount and is not out of stock", () => {
    expect(productCardState(active(169000), 5)).toEqual({
      kind: "active",
      priceIDR: 169000,
      compareAtPriceIDR: null,
      discountPercent: null,
      outOfStock: false,
    });
  });

  it("ACTIVE with compare-at above price carries the floored discount", () => {
    expect(productCardState(active(169999, 199999), 5)).toMatchObject({
      compareAtPriceIDR: 199999,
      discountPercent: 15,
      outOfStock: false,
    });
  });

  it("a discount below 1 % (here 0.5 %) is not shown", () => {
    expect(productCardState(active(199000, 200000), 5)).toMatchObject({
      compareAtPriceIDR: 200000,
      discountPercent: null,
    });
  });

  it("compare-at equal to or below the price gives no discount and no compare-at", () => {
    for (const compareAt of [169000, 150000]) {
      expect(productCardState(active(169000, compareAt), 5)).toMatchObject({
        compareAtPriceIDR: null,
        discountPercent: null,
      });
    }
  });

  it("stock null is unknown (not out of stock); 0 and -1 are out of stock", () => {
    expect(productCardState(active(169000), null)).toMatchObject({ outOfStock: false });
    expect(productCardState(active(169000), 0)).toMatchObject({ outOfStock: true });
    expect(productCardState(active(169000), -1)).toMatchObject({ outOfStock: true });
  });

  it("discounted and out of stock carries both", () => {
    expect(productCardState(active(150000, 200000), 0)).toMatchObject({
      discountPercent: 25,
      outOfStock: true,
    });
  });
});

describe("cardBadges", () => {
  it("coming soon carries exactly one badge", () => {
    expect(cardBadges({ kind: "comingSoon" })).toEqual(["comingSoon"]);
  });

  it("a plain active card carries none", () => {
    expect(cardBadges(productCardState(active(169000), 5))).toEqual([]);
  });

  it("orders out of stock before discount, and never exceeds two", () => {
    const badges = cardBadges(productCardState(active(150000, 200000), 0));
    expect(badges).toEqual(["outOfStock", "discount"]);
    expect(badges.length).toBeLessThanOrEqual(2);
  });

  it("discount alone and out of stock alone", () => {
    expect(cardBadges(productCardState(active(150000, 200000), 5))).toEqual(["discount"]);
    expect(cardBadges(productCardState(active(150000), 0))).toEqual(["outOfStock"]);
  });
});
