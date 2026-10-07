import { describe, expect, it } from "vitest";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import { heroSlideSets } from "@/components/home/hero-config";

/**
 * T031 (005 R-407). The hero's slide selection, extracted from the homepage so
 * the desktop fallback is testable: the existing product's sets are exactly
 * what the page selected before, and a product with only a square image still
 * fills both breakpoints.
 */
const featured = (catalogue as Product[])[0];

describe("heroSlideSets", () => {
  it("gives the existing product the same sets as before", () => {
    const { desktop, mobile } = heroSlideSets(featured.images);

    expect(desktop).toEqual(featured.images.filter((image) => image.orientation === "landscape"));
    expect(mobile).toEqual(
      featured.images.filter(
        (image) => image.orientation === "portrait" || image.orientation === "square",
      ),
    );
    expect(desktop.length).toBeGreaterThan(0);
    expect(desktop.some((image) => mobile.includes(image))).toBe(false);
  });

  it("falls back to the mobile set on desktop for a single square image", () => {
    const square = { src: "/placeholder.png", orientation: "square" as const };
    const { desktop, mobile } = heroSlideSets([square]);

    expect(mobile).toEqual([square]);
    expect(desktop).toEqual(mobile);
    expect(desktop).toHaveLength(1);
  });
});
