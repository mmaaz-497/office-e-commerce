import { describe, expect, it } from "vitest";
import {
  isComingSoon,
  isIndexable,
  isListed,
  isOnSale,
  isPurchasable,
  storefrontDisplay,
  type CatalogueProductLike,
} from "@/domain/catalogue/status";

/**
 * FR-012 — the status outcome table (spec.md, data-model.md "Status rules").
 * One row per test so a regression names the exact cell that moved.
 */
const activePriced: CatalogueProductLike = { status: "ACTIVE", priceIDR: 169999 };
const comingSoon: CatalogueProductLike = { status: "COMING_SOON", priceIDR: null };
const comingSoonPriced: CatalogueProductLike = { status: "COMING_SOON", priceIDR: 99000 };
const draft: CatalogueProductLike = { status: "DRAFT", priceIDR: 50000 };

describe("catalogue status rules (FR-012)", () => {
  it("ACTIVE with a price is listed, indexable and on sale", () => {
    expect(isListed(activePriced)).toBe(true);
    expect(isIndexable(activePriced)).toBe(true);
    expect(isOnSale(activePriced)).toBe(true);
  });

  it("ACTIVE is purchasable only while stock covers the quantity", () => {
    expect(isPurchasable(activePriced, 5, 2)).toBe(true);
    expect(isPurchasable(activePriced, 2, 2)).toBe(true);
    expect(isPurchasable(activePriced, 1, 2)).toBe(false);
  });

  it("ACTIVE with zero stock stays listed and indexable but is not purchasable", () => {
    expect(isListed(activePriced)).toBe(true);
    expect(isIndexable(activePriced)).toBe(true);
    expect(isOnSale(activePriced)).toBe(true);
    expect(isPurchasable(activePriced, 0, 1)).toBe(false);
  });

  it("COMING_SOON is listed but neither indexable, on sale nor purchasable — even with a price", () => {
    for (const product of [comingSoon, comingSoonPriced]) {
      expect(isListed(product)).toBe(true);
      expect(isIndexable(product)).toBe(false);
      expect(isOnSale(product)).toBe(false);
      expect(isPurchasable(product, 100, 1)).toBe(false);
    }
  });

  it("DRAFT is not listed, not indexable, not on sale and not purchasable", () => {
    expect(isListed(draft)).toBe(false);
    expect(isIndexable(draft)).toBe(false);
    expect(isOnSale(draft)).toBe(false);
    expect(isPurchasable(draft, 100, 1)).toBe(false);
  });

  it("an ACTIVE row without a price is never on sale (defence behind the DB CHECK)", () => {
    const unpriced: CatalogueProductLike = { status: "ACTIVE", priceIDR: null };
    expect(isOnSale(unpriced)).toBe(false);
    expect(isPurchasable(unpriced, 10, 1)).toBe(false);
  });

  it("a non-positive or fractional quantity is never purchasable", () => {
    expect(isPurchasable(activePriced, 10, 0)).toBe(false);
    expect(isPurchasable(activePriced, 10, -1)).toBe(false);
    expect(isPurchasable(activePriced, 10, 1.5)).toBe(false);
  });
});

describe("storefront display (R-408)", () => {
  it("COMING_SOON with a stored price shows no price, purchase or social proof", () => {
    expect(isComingSoon(comingSoonPriced)).toBe(true);
    expect(storefrontDisplay(comingSoonPriced)).toEqual({
      onSale: false,
      comingSoon: true,
      showPrice: false,
      showPurchase: false,
      showSocialProof: false,
      indexable: false,
    });
  });

  it("ACTIVE with a price shows everything and is indexable", () => {
    expect(isComingSoon(activePriced)).toBe(false);
    expect(storefrontDisplay(activePriced)).toEqual({
      onSale: true,
      comingSoon: false,
      showPrice: true,
      showPurchase: true,
      showSocialProof: true,
      indexable: true,
    });
  });

  it("DRAFT is neither coming soon nor indexable", () => {
    const display = storefrontDisplay(draft);
    expect(display.comingSoon).toBe(false);
    expect(display.indexable).toBe(false);
    expect(display.showPrice).toBe(false);
  });
});
