import { describe, expect, it } from "vitest";
import { productInputSchema, type ProductInput } from "@/domain/catalogue/product-schema";

/**
 * FR-013 — every boundary of the shared product schema. The 2b admin form and
 * the server both use this one definition, so a boundary that moves here moves
 * for both.
 */

function translation(overrides: Partial<ProductInput["translations"]["id"]> = {}) {
  return {
    name: "Sandal Gemoy",
    shortDescription: "Empuk & nyaman · Anti slip · Desain lucu",
    longDescription: "",
    highlights: ["Empuk & nyaman"],
    specs: [],
    seoTitle: null,
    seoDescription: null,
    videoAlt: null,
    ...overrides,
  };
}

function valid(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    slug: "slippers-gemoy",
    sku: null,
    status: "ACTIVE",
    priceIDR: 169999,
    compareAtPriceIDR: null,
    video: null,
    images: [
      {
        url: "/images/product/a.png",
        width: 1200,
        height: 1200,
        orientation: "square",
        altId: "Foto produk",
        altEn: "Product photo",
      },
    ],
    translations: { id: translation(), en: translation({ name: "Gemoy Slippers" }) },
    ...overrides,
  };
}

function issuePaths(input: unknown): string[] {
  const result = productInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

function accepts(input: unknown): boolean {
  return productInputSchema.safeParse(input).success;
}

describe("productInputSchema — field limits (FR-013)", () => {
  it("accepts a complete ACTIVE product", () => {
    expect(issuePaths(valid())).toEqual([]);
  });

  it("slug: 3–80 chars, lowercase letters, digits and single hyphens", () => {
    expect(accepts(valid({ slug: "ab" }))).toBe(false);
    expect(accepts(valid({ slug: "abc" }))).toBe(true);
    expect(accepts(valid({ slug: "a".repeat(80) }))).toBe(true);
    expect(accepts(valid({ slug: "a".repeat(81) }))).toBe(false);
    expect(accepts(valid({ slug: "Slippers" }))).toBe(false);
    expect(accepts(valid({ slug: "slip--pers" }))).toBe(false);
    expect(accepts(valid({ slug: "-slippers" }))).toBe(false);
  });

  it("sku: optional, 3–32 uppercase letters, digits or hyphens", () => {
    expect(accepts(valid({ sku: null }))).toBe(true);
    expect(accepts(valid({ sku: "AB" }))).toBe(false);
    expect(accepts(valid({ sku: "ABC" }))).toBe(true);
    expect(accepts(valid({ sku: "A".repeat(32) }))).toBe(true);
    expect(accepts(valid({ sku: "A".repeat(33) }))).toBe(false);
    expect(accepts(valid({ sku: "abc-1" }))).toBe(false);
  });

  it("name: 3–120 chars per locale", () => {
    const withName = (name: string) =>
      valid({ translations: { id: translation({ name }), en: translation() } });
    expect(accepts(withName("ab"))).toBe(false);
    expect(accepts(withName("abc"))).toBe(true);
    expect(accepts(withName("a".repeat(120)))).toBe(true);
    expect(accepts(withName("a".repeat(121)))).toBe(false);
  });

  it("shortDescription: 20–200 chars", () => {
    const withShort = (shortDescription: string) =>
      valid({ translations: { id: translation(), en: translation({ shortDescription }) } });
    expect(accepts(withShort("a".repeat(19)))).toBe(false);
    expect(accepts(withShort("a".repeat(20)))).toBe(true);
    expect(accepts(withShort("a".repeat(200)))).toBe(true);
    expect(accepts(withShort("a".repeat(201)))).toBe(false);
  });

  it("longDescription: at most 5000 chars, may be empty", () => {
    const withLong = (longDescription: string) =>
      valid({ translations: { id: translation({ longDescription }), en: translation() } });
    expect(accepts(withLong(""))).toBe(true);
    expect(accepts(withLong("a".repeat(5000)))).toBe(true);
    expect(accepts(withLong("a".repeat(5001)))).toBe(false);
  });

  it("highlights: at most 6 items of 1–80 chars", () => {
    const withHighlights = (highlights: string[]) =>
      valid({ translations: { id: translation({ highlights }), en: translation() } });
    expect(accepts(withHighlights(Array(6).fill("ok")))).toBe(true);
    expect(accepts(withHighlights(Array(7).fill("ok")))).toBe(false);
    expect(accepts(withHighlights(["a".repeat(80)]))).toBe(true);
    expect(accepts(withHighlights(["a".repeat(81)]))).toBe(false);
  });

  it("specs: at most 20 rows; label ≤ 40, value ≤ 200", () => {
    const withSpecs = (specs: Array<{ label: string; value: string }>) =>
      valid({ translations: { id: translation({ specs }), en: translation() } });
    const row = { label: "Bahan", value: "EVA" };
    expect(accepts(withSpecs(Array(20).fill(row)))).toBe(true);
    expect(accepts(withSpecs(Array(21).fill(row)))).toBe(false);
    expect(accepts(withSpecs([{ label: "a".repeat(41), value: "x" }]))).toBe(false);
    expect(accepts(withSpecs([{ label: "x", value: "a".repeat(201) }]))).toBe(false);
  });

  it("seoTitle ≤ 60 and seoDescription ≤ 160 (Principle VIII)", () => {
    const withSeo = (seoTitle: string, seoDescription: string) =>
      valid({ translations: { id: translation({ seoTitle, seoDescription }), en: translation() } });
    expect(accepts(withSeo("a".repeat(60), "a".repeat(160)))).toBe(true);
    expect(accepts(withSeo("a".repeat(61), "ok"))).toBe(false);
    expect(accepts(withSeo("ok", "a".repeat(161)))).toBe(false);
  });

  it("priceIDR: whole rupiah between 1.000 and 100.000.000", () => {
    expect(accepts(valid({ priceIDR: 999 }))).toBe(false);
    expect(accepts(valid({ priceIDR: 1000 }))).toBe(true);
    expect(accepts(valid({ priceIDR: 100_000_000 }))).toBe(true);
    expect(accepts(valid({ priceIDR: 100_000_001 }))).toBe(false);
    expect(accepts(valid({ priceIDR: 1500.5 }))).toBe(false);
  });
});

describe("productInputSchema — compare-at price", () => {
  it("must be strictly above the price", () => {
    expect(accepts(valid({ priceIDR: 100000, compareAtPriceIDR: 120000 }))).toBe(true);
    expect(accepts(valid({ priceIDR: 100000, compareAtPriceIDR: 100000 }))).toBe(false);
    expect(accepts(valid({ priceIDR: 100000, compareAtPriceIDR: 90000 }))).toBe(false);
  });

  it("is rejected without a price", () => {
    expect(
      issuePaths(valid({ status: "DRAFT", priceIDR: null, compareAtPriceIDR: 120000 })),
    ).toContain("compareAtPriceIDR");
  });
});

describe("productInputSchema — ACTIVE requirements", () => {
  it("names each missing item", () => {
    expect(issuePaths(valid({ priceIDR: null }))).toContain("priceIDR");
    expect(issuePaths(valid({ images: [] }))).toContain("images");
    expect(
      issuePaths(valid({ translations: { id: translation(), en: translation({ name: "" }) } })),
    ).toContain("translations.en.name");
  });

  it("requires both alt texts on every image", () => {
    const images = [{ ...valid().images[0], altEn: "" }];
    expect(issuePaths(valid({ images }))).toContain("images.0.altEn");
  });

  it("requires videoAlt in both locales when there is a video", () => {
    const video = { url: "/videos/a.mp4", posterUrl: "/videos/a.jpg" };
    expect(issuePaths(valid({ video }))).toEqual(
      expect.arrayContaining(["translations.id.videoAlt", "translations.en.videoAlt"]),
    );
    expect(
      accepts(
        valid({
          video,
          translations: {
            id: translation({ videoAlt: "Video produk" }),
            en: translation({ videoAlt: "Product video" }),
          },
        }),
      ),
    ).toBe(true);
  });
});

describe("productInputSchema — COMING_SOON and DRAFT", () => {
  it("COMING_SOON is accepted without a price", () => {
    expect(issuePaths(valid({ status: "COMING_SOON", priceIDR: null }))).toEqual([]);
  });

  it("COMING_SOON still needs a short description in both locales", () => {
    expect(
      issuePaths(
        valid({
          status: "COMING_SOON",
          priceIDR: null,
          translations: { id: translation(), en: translation({ shortDescription: "" }) },
        }),
      ),
    ).toContain("translations.en.shortDescription");
  });

  it("COMING_SOON still needs at least one image", () => {
    expect(issuePaths(valid({ status: "COMING_SOON", priceIDR: null, images: [] }))).toContain(
      "images",
    );
  });

  it("DRAFT applies field rules only", () => {
    expect(issuePaths(valid({ status: "DRAFT", priceIDR: null, images: [] }))).toEqual([]);
  });
});

describe("productInputSchema — branding (Principle II)", () => {
  it("rejects a third-party marketplace name in any text field", () => {
    expect(
      accepts(
        valid({ translations: { id: translation({ name: "Sandal Shopee" }), en: translation() } }),
      ),
    ).toBe(false);
    expect(
      accepts(
        valid({
          translations: { id: translation(), en: translation({ highlights: ["Like shopee"] }) },
        }),
      ),
    ).toBe(false);
  });

  it("accepts the store's own name", () => {
    expect(
      accepts(
        valid({
          translations: { id: translation({ name: "Sandal Tokoshopee" }), en: translation() },
        }),
      ),
    ).toBe(true);
  });
});

describe("productInputSchema — image count (2b, FR-018)", () => {
  it("accepts 8 images and rejects 9 at path images", () => {
    const image = valid().images[0];
    expect(accepts(valid({ images: Array(8).fill(image) }))).toBe(true);
    expect(issuePaths(valid({ images: Array(9).fill(image) }))).toContain("images");
  });
});

describe("productInputSchema — translatable issue keys (2b, R-308)", () => {
  type Issue = { path: PropertyKey[]; message: string; params?: { key?: string } };

  function customIssues(input: unknown): Issue[] {
    const result = productInputSchema.safeParse(input);
    if (result.success) return [];
    return (result.error.issues as Issue[]).filter(
      (issue) => (issue as { code?: string }).code === "custom",
    );
  }

  function issueAt(input: unknown, path: string): Issue | undefined {
    return customIssues(input).find((issue) => issue.path.join(".") === path);
  }

  it("compareAtNeedsPrice, with its English message unchanged", () => {
    const issue = issueAt(
      valid({ status: "DRAFT", priceIDR: null, compareAtPriceIDR: 120000 }),
      "compareAtPriceIDR",
    );
    expect(issue?.params?.key).toBe("compareAtNeedsPrice");
    expect(issue?.message).toBe("An original price needs a selling price.");
  });

  it("compareAtAbovePrice, with its English message unchanged", () => {
    const issue = issueAt(
      valid({ priceIDR: 100000, compareAtPriceIDR: 90000 }),
      "compareAtPriceIDR",
    );
    expect(issue?.params?.key).toBe("compareAtAbovePrice");
    expect(issue?.message).toBe("The original price must be higher than the selling price.");
  });

  it("videoNeedsAlt, with its English message unchanged", () => {
    const video = { url: "/videos/a.mp4", posterUrl: "/videos/a.jpg" };
    const issue = issueAt(valid({ video }), "translations.id.videoAlt");
    expect(issue?.params?.key).toBe("videoNeedsAlt");
    expect(issue?.message).toBe("A video needs a description in both languages.");
  });

  it("activeNeedsPrice, with its English message unchanged", () => {
    const issue = issueAt(valid({ priceIDR: null }), "priceIDR");
    expect(issue?.params?.key).toBe("activeNeedsPrice");
    expect(issue?.message).toBe("An active product needs a price.");
  });

  it("listedNeedsImage, with its English message unchanged", () => {
    const issue = issueAt(valid({ images: [] }), "images");
    expect(issue?.params?.key).toBe("listedNeedsImage");
    expect(issue?.message).toBe("A listed product needs at least one image.");
  });

  it("marketplaceBrand, with its English message unchanged", () => {
    const issue = issueAt(
      valid({ translations: { id: translation({ name: "Sandal Shopee" }), en: translation() } }),
      "translations.id.name",
    );
    expect(issue?.params?.key).toBe("marketplaceBrand");
    expect(issue?.message).toBe("Third-party marketplace names are not allowed (Principle II).");
  });

  it("every custom issue carries params.key", () => {
    const video = { url: "/videos/a.mp4", posterUrl: "/videos/a.jpg" };
    const issues = customIssues(
      valid({
        priceIDR: null,
        compareAtPriceIDR: 120000,
        images: [],
        video,
        translations: { id: translation({ name: "Sandal Shopee" }), en: translation() },
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) expect(issue.params?.key).toEqual(expect.any(String));
  });
});
