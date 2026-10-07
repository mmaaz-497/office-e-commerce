import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { imageSizeProblems } from "../../scripts/catalogue/image-size-check";
import { placeholderProblems } from "../../scripts/catalogue/placeholder-check";
import { png } from "../helpers/image-bytes";

/**
 * Invariants C-1 to C-7 from specs/002-homepage/contracts/catalogue.md §2.
 *
 * C-3 and C-4 are the ones that matter most and are easiest to miss: the hero
 * art-directs by orientation, so an empty landscape or portrait set renders an
 * empty hero at one breakpoint while the other looks fine — a content error
 * that survives every visual check done on a single screen size.
 */

const PRODUCTS = catalogue as Product[];
const PUBLIC_DIR = join(process.cwd(), "public");

describe("catalogue media registration (FR-005, FR-006)", () => {
  it("registers at least one product", () => {
    expect(PRODUCTS.length).toBeGreaterThan(0);
  });

  it("C-5: slugs are unique", () => {
    const slugs = PRODUCTS.map((product) => product.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(PRODUCTS.map((product) => [product.slug, product] as const))(
    "%s",
    (_slug, product) => {
      it("C-7: has at least one image", () => {
        expect(product.images.length).toBeGreaterThan(0);
      });

      it("C-1: every image path is public-relative and exists on disk", () => {
        for (const image of product.images) {
          expect(image.src.startsWith("/")).toBe(true);
          expect(existsSync(join(PUBLIC_DIR, image.src.slice(1)))).toBe(true);
        }
      });

      it("C-2: every image declares an alt message key", () => {
        for (const image of product.images) {
          expect(image.altKey).toMatch(/^[\w.]+$/);
        }
      });

      it("C-3: at least one landscape image exists for the desktop hero", () => {
        const landscape = product.images.filter((image) => image.orientation === "landscape");
        expect(landscape.length).toBeGreaterThan(0);
      });

      it("C-4: at least one portrait or square image exists for the mobile hero", () => {
        const upright = product.images.filter(
          (image) => image.orientation === "portrait" || image.orientation === "square",
        );
        expect(upright.length).toBeGreaterThan(0);
      });

      it("declares a known orientation on every image", () => {
        for (const image of product.images) {
          expect(["landscape", "portrait", "square"]).toContain(image.orientation);
        }
      });

      it("C-6: a registered video carries a poster, and both exist on disk", () => {
        if (product.video === null) return;

        expect(product.video.poster.length).toBeGreaterThan(0);
        for (const path of [product.video.src, product.video.poster]) {
          expect(path.startsWith("/")).toBe(true);
          expect(existsSync(join(PUBLIC_DIR, path.slice(1)))).toBe(true);
        }
        expect(product.video.altKey).toMatch(/^[\w.]+$/);
      });
    },
  );

  it("does not reference the same file twice across images", () => {
    for (const product of PRODUCTS) {
      const sources = product.images.map((image) => image.src);
      expect(new Set(sources).size).toBe(sources.length);
    }
  });
});

// check:media: the size the import stores is each file's real size.
describe("catalogue image sizes", () => {
  const readPublic = (publicPath: string) => {
    const file = join(PUBLIC_DIR, publicPath.slice(1));
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
  };

  it("every declared size matches the committed file", () => {
    expect(imageSizeProblems(PRODUCTS, readPublic)).toEqual([]);
  });

  it("fails a size that differs from the file", () => {
    const [product] = PRODUCTS;
    const target = product.images[0];
    const problems = imageSizeProblems(PRODUCTS, (path) =>
      path === target.src ? png(target.width + 2, target.height - 1) : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`${target.width + 2}×${target.height - 1}`);
    expect(problems[0]).toContain(`declares ${target.width}×${target.height}`);
  });

  it("fails a file whose header cannot be read", () => {
    const target = PRODUCTS[0].images[1];
    const problems = imageSizeProblems(PRODUCTS, (path) =>
      path === target.src ? new Uint8Array([1, 2, 3]) : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("no readable image header");
  });

  it("leaves a missing file to the path check", () => {
    const target = PRODUCTS[0].images[2];
    expect(
      imageSizeProblems(PRODUCTS, (path) => (path === target.src ? null : readPublic(path))),
    ).toEqual([]);
  });
});

// 005 T042, R-413: the sample placeholder rules check:media enforces.
describe("sample placeholders (R-413)", () => {
  const readPublic = (publicPath: string) => {
    const file = join(PUBLIC_DIR, publicPath.slice(1));
    return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
  };

  it("the committed placeholders pass", () => {
    expect(placeholderProblems(SAMPLE_DEFINITIONS, readPublic)).toEqual([]);
  });

  it("fails a missing file", () => {
    const missing = SAMPLE_DEFINITIONS[3].image;
    const problems = placeholderProblems(SAMPLE_DEFINITIONS, (path) =>
      path === missing ? null : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not exist");
  });

  it("fails a wrong size", () => {
    const wrong = SAMPLE_DEFINITIONS[6].image;
    const problems = placeholderProblems(SAMPLE_DEFINITIONS, (path) =>
      path === wrong ? png(1200, 800) : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("1200×800");
  });

  it("fails two identical files", () => {
    const problems = placeholderProblems(SAMPLE_DEFINITIONS, (path) =>
      path === SAMPLE_DEFINITIONS[1].image
        ? readPublic(SAMPLE_DEFINITIONS[0].image)
        : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("identical");
  });

  it("fails a file of 200 KB or more", () => {
    const big = SAMPLE_DEFINITIONS[9].image;
    const problems = placeholderProblems(SAMPLE_DEFINITIONS, (path) =>
      path === big ? png(1200, 1200, { size: 204_800 }) : readPublic(path),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("under 200 KB");
  });
});
