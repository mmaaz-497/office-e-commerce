import { describe, expect, it } from "vitest";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { planSampleSeed, type SampleSeedState } from "@/domain/catalogue/samples";

/** T037 (005 R-412): the seed's pure planner. */
const REAL = { id: "real-1", categoryId: "cat-1", updatedAt: new Date("2026-10-01") };

function state(overrides: Partial<SampleSeedState> = {}): SampleSeedState {
  return { activeRealProducts: [REAL], existing: [], maxPosition: 4, ...overrides };
}

describe("planSampleSeed", () => {
  it("refuses with no ACTIVE real product", () => {
    expect(planSampleSeed(state({ activeRealProducts: [] }), SAMPLE_DEFINITIONS)).toEqual({
      kind: "refuse",
      reason: "activeCount",
      count: 0,
    });
  });

  it("refuses with two ACTIVE real products", () => {
    const second = { ...REAL, id: "real-2" };
    expect(
      planSampleSeed(state({ activeRealProducts: [REAL, second] }), SAMPLE_DEFINITIONS),
    ).toEqual({ kind: "refuse", reason: "activeCount", count: 2 });
  });

  it("creates all 10 in definition order, after the highest position", () => {
    const plan = planSampleSeed(state(), SAMPLE_DEFINITIONS);
    expect(plan.kind).toBe("plan");
    if (plan.kind !== "plan") return;
    expect(plan.categoryId).toBe("cat-1");
    expect(plan.create.map((c) => c.definition.slug)).toEqual(
      SAMPLE_DEFINITIONS.map((d) => d.slug),
    );
    expect(plan.create.map((c) => c.position)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(plan.skip).toEqual([]);
  });

  it("creates 7 and skips 3 when 3 samples already exist", () => {
    const existing = SAMPLE_DEFINITIONS.slice(0, 3).map((d) => ({ slug: d.slug, isSample: true }));
    const plan = planSampleSeed(state({ existing }), SAMPLE_DEFINITIONS);
    expect(plan.kind).toBe("plan");
    if (plan.kind !== "plan") return;
    expect(plan.create.map((c) => c.definition.slug)).toEqual(
      SAMPLE_DEFINITIONS.slice(3).map((d) => d.slug),
    );
    expect(plan.skip).toEqual(SAMPLE_DEFINITIONS.slice(0, 3).map((d) => d.slug));
  });

  it("creates nothing when all 10 exist", () => {
    const existing = SAMPLE_DEFINITIONS.map((d) => ({ slug: d.slug, isSample: true }));
    const plan = planSampleSeed(state({ existing }), SAMPLE_DEFINITIONS);
    expect(plan).toMatchObject({ kind: "plan", create: [] });
    if (plan.kind !== "plan") return;
    expect(plan.skip).toHaveLength(10);
  });

  it("refuses a slug owned by a real product, even with others to create", () => {
    const taken = SAMPLE_DEFINITIONS[4].slug;
    const plan = planSampleSeed(
      state({ existing: [{ slug: taken, isSample: false }] }),
      SAMPLE_DEFINITIONS,
    );
    expect(plan).toEqual({ kind: "refuse", reason: "slugTaken", slug: taken });
  });
});
