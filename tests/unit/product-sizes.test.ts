import { describe, expect, it } from "vitest";
import {
  formatSizeList,
  parseSizeList,
  preselectedSize,
  resolveSizeChoice,
} from "@/domain/catalogue/sizes";
import { productInputSchema, type ProductInput } from "@/domain/catalogue/product-schema";

const SIZES = ["36", "38", "40", "42"];

describe("resolveSizeChoice", () => {
  it("accepts an offered size exactly as stored", () => {
    expect(resolveSizeChoice(SIZES, "38")).toEqual({ kind: "ok", size: "38" });
  });

  it("requires a size when the product offers sizes", () => {
    expect(resolveSizeChoice(SIZES, undefined)).toEqual({ kind: "required" });
    expect(resolveSizeChoice(SIZES, null)).toEqual({ kind: "required" });
    expect(resolveSizeChoice(SIZES, "")).toEqual({ kind: "required" });
  });

  it("refuses a size the product does not offer, including near misses", () => {
    expect(resolveSizeChoice(SIZES, "39")).toEqual({ kind: "unavailable" });
    expect(resolveSizeChoice(SIZES, " 38")).toEqual({ kind: "unavailable" });
  });

  it("records no size for a product without sizes, and refuses one sent anyway", () => {
    expect(resolveSizeChoice([], undefined)).toEqual({ kind: "ok", size: null });
    expect(resolveSizeChoice([], "38")).toEqual({ kind: "unavailable" });
  });
});

describe("preselectedSize", () => {
  it("keeps an offered ?size= and drops anything else", () => {
    expect(preselectedSize(SIZES, "40")).toBe("40");
    expect(preselectedSize(SIZES, "41")).toBeNull();
    expect(preselectedSize(SIZES, ["38", "40"])).toBeNull();
    expect(preselectedSize(SIZES, undefined)).toBeNull();
    expect(preselectedSize([], "38")).toBeNull();
  });
});

describe("parseSizeList / formatSizeList", () => {
  it("round-trips the admin's comma-separated text", () => {
    expect(parseSizeList(" 36, 38 ,,40,42 ")).toEqual(SIZES);
    expect(parseSizeList("")).toEqual([]);
    expect(formatSizeList(SIZES)).toBe("36, 38, 40, 42");
  });
});

describe("productInputSchema sizes", () => {
  const base: ProductInput = {
    slug: "sandal-uji",
    sku: null,
    status: "DRAFT",
    priceIDR: null,
    compareAtPriceIDR: null,
    images: [],
    video: null,
    translations: {
      id: {
        name: "Sandal Uji",
        shortDescription: "Deskripsi singkat produk uji coba.",
        longDescription: "",
        highlights: [],
        specs: [],
        seoTitle: null,
        seoDescription: null,
        videoAlt: null,
      },
      en: {
        name: "Test Sandal",
        shortDescription: "Short description of a test product.",
        longDescription: "",
        highlights: [],
        specs: [],
        seoTitle: null,
        seoDescription: null,
        videoAlt: null,
      },
    },
  };

  it("accepts no sizes, an empty list and a valid list", () => {
    expect(productInputSchema.safeParse(base).success).toBe(true);
    expect(productInputSchema.safeParse({ ...base, sizes: [] }).success).toBe(true);
    expect(productInputSchema.safeParse({ ...base, sizes: [...SIZES, "M", "38/39"] }).success).toBe(
      true,
    );
  });

  it("rejects a duplicate with the sizesDuplicate key", () => {
    const result = productInputSchema.safeParse({ ...base, sizes: ["38", "40", "38"] });
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join(".") === "sizes");
    expect((issue as { params?: { key?: string } }).params?.key).toBe("sizesDuplicate");
  });

  it("rejects malformed and over-long labels", () => {
    for (const bad of ["3 8", "38!", "-38", "12345678901"]) {
      expect(productInputSchema.safeParse({ ...base, sizes: [bad] }).success, bad).toBe(false);
    }
  });

  it("rejects more than 20 sizes", () => {
    const many = Array.from({ length: 21 }, (_, i) => String(20 + i));
    expect(productInputSchema.safeParse({ ...base, sizes: many }).success).toBe(false);
  });
});
