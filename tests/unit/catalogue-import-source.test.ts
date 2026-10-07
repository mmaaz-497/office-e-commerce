import { describe, expect, it } from "vitest";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import id from "@/messages/id.json";
import en from "@/messages/en.json";
import { buildImportSource } from "@/infrastructure/db/catalogue-import";
import { productInputSchema } from "@/domain/catalogue/product-schema";

/**
 * T011 — the import source maps the repository catalogue and the product.*
 * message values exactly as research R-207 specifies. This is what makes the
 * storefront's output identical after the move: every string the shopper sees
 * today must arrive in the database unchanged.
 */
const PRODUCT = (catalogue as Product[])[0];

function message(messages: Record<string, unknown>, key: string): string {
  const value = key.split(".").reduce<unknown>((node, part) => {
    return (node as Record<string, unknown>)[part];
  }, messages);
  if (typeof value !== "string") throw new Error(`missing message ${key}`);
  return value;
}

describe("buildImportSource (R-207)", () => {
  const source = buildImportSource();
  const input = source.products[0];

  it("creates the Sandal / Sandals category", () => {
    expect(source.category).toEqual({ slug: "sandal", nameId: "Sandal", nameEn: "Sandals" });
  });

  it("carries the existing slug, price and status unchanged", () => {
    expect(source.products).toHaveLength(1);
    expect(input.slug).toBe("slippers-gemoy");
    expect(input.priceIDR).toBe(PRODUCT.priceIDR);
    expect(input.status).toBe("ACTIVE");
    expect(input.compareAtPriceIDR).toBeNull();
    expect(input.sku).toBeNull();
  });

  it("maps name, highlights, short description and SEO texts per locale", () => {
    for (const [locale, messages] of [
      ["id", id],
      ["en", en],
    ] as const) {
      const t = input.translations[locale];
      const highlights = PRODUCT.benefitKeys.map((key) => message(messages, key));
      expect(t.name).toBe(message(messages, PRODUCT.nameKey));
      expect(t.highlights).toEqual(highlights);
      expect(t.shortDescription).toBe(highlights.join(" · "));
      expect(t.longDescription).toBe("");
      expect(t.specs).toEqual([]);
      expect(t.seoTitle).toBe(message(messages, "product.metadata.title"));
      expect(t.seoDescription).toBe(message(messages, "product.metadata.description"));
      expect(t.videoAlt).toBe(message(messages, PRODUCT.video!.altKey));
    }
  });

  it("keeps image order, sizes, orientation and both alt texts", () => {
    expect(input.images).toEqual(
      PRODUCT.images.map((image) => ({
        url: image.src,
        width: image.width,
        height: image.height,
        orientation: image.orientation,
        altId: message(id, image.altKey),
        altEn: message(en, image.altKey),
      })),
    );
  });

  it("keeps the video and its poster", () => {
    expect(input.video).toEqual({ url: PRODUCT.video!.src, posterUrl: PRODUCT.video!.poster });
  });

  it("passes the shared schema as an ACTIVE product", () => {
    const result = productInputSchema.safeParse(input);
    expect(result.success ? [] : result.error.issues).toEqual([]);
  });
});
