import { describe, expect, it } from "vitest";
import type { ProductInput } from "@/domain/catalogue/product-schema";
import { missingPublishRequirements } from "@/domain/catalogue/publish-requirements";

/**
 * The admin edit page's DRAFT notice: what saving the product as ACTIVE would
 * still refuse. Derived from productInputSchema, so each case below is one of
 * the schema's own ACTIVE rules.
 */

function translation(overrides: Partial<ProductInput["translations"]["id"]> = {}) {
  return {
    name: "Sandal Gemoy",
    shortDescription: "Empuk & nyaman · Anti slip · Desain lucu",
    longDescription: "",
    highlights: [],
    specs: [],
    seoTitle: null,
    seoDescription: null,
    videoAlt: null,
    ...overrides,
  };
}

function draft(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    slug: "sandal-baru",
    sku: null,
    status: "DRAFT",
    priceIDR: 120000,
    compareAtPriceIDR: null,
    video: null,
    images: [
      {
        url: "/uploads/0123456789abcdef.png",
        width: 1200,
        height: 1200,
        orientation: "square",
        altId: "Foto produk",
        altEn: "Product photo",
      },
    ],
    translations: { id: translation(), en: translation({ name: "New Sandals" }) },
    ...overrides,
  };
}

describe("missingPublishRequirements", () => {
  it("a complete draft with a stock row lacks nothing", () => {
    expect(missingPublishRequirements(draft(), true)).toEqual([]);
  });

  it("a fresh draft lists every gap, in display order", () => {
    const empty = translation({ name: "", shortDescription: "" });
    expect(
      missingPublishRequirements(
        draft({ priceIDR: null, images: [], translations: { id: empty, en: empty } }),
        false,
      ),
    ).toEqual(["price", "image", "contentId", "contentEn", "stock"]);
  });

  it("needs a selling price", () => {
    expect(missingPublishRequirements(draft({ priceIDR: null }), true)).toEqual(["price"]);
  });

  it("needs an image", () => {
    expect(missingPublishRequirements(draft({ images: [] }), true)).toEqual(["image"]);
  });

  it("reports a too-short short description against its own language only", () => {
    const short = translation({ shortDescription: "Terlalu pendek" });
    expect(
      missingPublishRequirements(
        draft({ translations: { id: short, en: translation({ name: "New Sandals" }) } }),
        true,
      ),
    ).toEqual(["contentId"]);
    expect(
      missingPublishRequirements(draft({ translations: { id: translation(), en: short } }), true),
    ).toEqual(["contentEn"]);
  });

  it("needs a stock row, which only the database knows", () => {
    expect(missingPublishRequirements(draft(), false)).toEqual(["stock"]);
  });

  it("files a field outside price, images and content under otherFields", () => {
    expect(missingPublishRequirements(draft({ slug: "Bukan Slug" }), true)).toEqual([
      "otherFields",
    ]);
  });

  it("does not care what the stored status is", () => {
    expect(missingPublishRequirements(draft({ status: "COMING_SOON" }), true)).toEqual([]);
  });
});
