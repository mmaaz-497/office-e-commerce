import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SHOWCASE_MINIMUM,
  hasPublishedReviews,
  meetsShowcaseMinimum,
  planHomeSections,
} from "@/domain/catalogue/home-sections";
import type { ProductStatus } from "@/domain/catalogue/status";

/**
 * 006 T014, revised by 007 T024 — the homepage section thresholds (FR-022,
 * research R-708). The featured product has its own full block, so the
 * "more on sale" grid holds the other ACTIVE products; both grids appear only
 * from SHOWCASE_MINIMUM items.
 */

const product = (id: string, status: ProductStatus) => ({ id, status });
const actives = (n: number) => Array.from({ length: n }, (_, i) => product(`a${i}`, "ACTIVE"));
const samples = (n: number) => Array.from({ length: n }, (_, i) => product(`s${i}`, "COMING_SOON"));

describe("planHomeSections — more on sale", () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 2],
    [4, 3],
  ])("%i ACTIVE products (one featured) give a grid of %i", (count, expected) => {
    const plan = planHomeSections({ products: actives(count), featuredId: "a0" });
    expect(plan.moreOnSale).toHaveLength(expected);
  });

  it("never repeats the featured product", () => {
    const plan = planHomeSections({ products: actives(4), featuredId: "a2" });
    expect(plan.moreOnSale.map((p) => p.id)).toEqual(["a0", "a1", "a3"]);
  });

  it("with no featured product, every ACTIVE product counts", () => {
    expect(planHomeSections({ products: actives(2), featuredId: null }).moreOnSale).toHaveLength(2);
  });
});

describe("planHomeSections — Segera hadir grid", () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 2],
    [10, 10],
  ])("%i COMING_SOON products give a grid of %i", (count, expected) => {
    const plan = planHomeSections({
      products: [...actives(1), ...samples(count)],
      featuredId: "a0",
    });
    expect(plan.comingSoonGrid).toHaveLength(expected);
  });

  it("keeps catalogue order", () => {
    const plan = planHomeSections({ products: [...samples(3), ...actives(1)], featuredId: "a0" });
    expect(plan.comingSoonGrid.map((p) => p.id)).toEqual(["s0", "s1", "s2"]);
  });

  it("the current dev data shape: 1 ACTIVE (featured) + 10 samples", () => {
    const plan = planHomeSections({ products: [...actives(1), ...samples(10)], featuredId: "a0" });
    expect(plan).toEqual({ moreOnSale: [], comingSoonGrid: samples(10) });
  });
});

describe("planHomeSections — DRAFT", () => {
  it("never appears in any list", () => {
    const plan = planHomeSections({
      products: [...actives(3), ...samples(2), product("d1", "DRAFT"), product("d2", "DRAFT")],
      featuredId: "a0",
    });
    const ids = [...plan.moreOnSale, ...plan.comingSoonGrid].map((p) => p.id);
    expect(ids).not.toContain("d1");
    expect(ids).not.toContain("d2");
  });

  it("does not count toward the minimum", () => {
    const plan = planHomeSections({
      products: [...actives(2), product("d1", "DRAFT"), product("d2", "DRAFT")],
      featuredId: "a0",
    });
    expect(plan.moreOnSale).toEqual([]);
  });
});

describe("thresholds and reviews", () => {
  it("SHOWCASE_MINIMUM is 2 and meetsShowcaseMinimum follows it", () => {
    expect(SHOWCASE_MINIMUM).toBe(2);
    expect(meetsShowcaseMinimum(1)).toBe(false);
    expect(meetsShowcaseMinimum(2)).toBe(true);
  });

  it("hasPublishedReviews is false at 0 and true at 1", () => {
    expect(hasPublishedReviews({ count: 0 })).toBe(false);
    expect(hasPublishedReviews({ count: 1 })).toBe(true);
  });

  it("home-sections.ts contains the literal 2 only in the SHOWCASE_MINIMUM declaration", () => {
    const source = readFileSync(
      join(process.cwd(), "src/domain/catalogue/home-sections.ts"),
      "utf-8",
    );
    const linesWithTwo = source.split("\n").filter((line) => /\b2\b/.test(line));
    expect(linesWithTwo).toEqual(["export const SHOWCASE_MINIMUM = 2;"]);
  });
});
