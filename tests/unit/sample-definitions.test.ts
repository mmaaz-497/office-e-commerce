import { describe, expect, it } from "vitest";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { SLUG_PATTERN, productInputSchema } from "@/domain/catalogue/product-schema";
import { sampleProductInput } from "@/domain/catalogue/samples";

/**
 * T035 (005 US1, R-411). The 10 sample definitions are the plan's list, each
 * one a valid COMING_SOON product with its own placeholder and tint, and their
 * copy makes no claims (FR-006, Constitution VIII).
 */

/** docs/redesign-plan.md §6 item 8, in order. */
const PLAN_NAMES = [
  "Sandal Slide Cloud Tebal",
  "Sandal Jepit Karet Klasik",
  "Sandal Rumah Bulu Lembut",
  "Sandal Selop Anyaman",
  "Sandal Slide Strap Ganda",
  "Sandal Platform Kasual",
  "Sandal Gunung Tali Velcro",
  "Sandal Rumah Waffle",
  "Sandal Slide Anak Pastel",
  "Sandal Jepit Sol Tebal",
];

const PLAN_TINTS = [
  "#F3EADD",
  "#F3E7DC",
  "#FBEBD3",
  "#FAF6F0",
  "#EADBC8",
  "#E8D5C0",
  "#F0E2CD",
  "#EDE3D6",
  "#F6E9D7",
  "#E4D3BF",
];

const CLAIMS = [/\d+\s*%/, /terbaik/i, /\bbest\b/i, /#1/, /nomor 1/i];

describe("sample definitions (R-411)", () => {
  it("has exactly 10 entries", () => {
    expect(SAMPLE_DEFINITIONS).toHaveLength(10);
  });

  it("has unique slugs matching the shared slug pattern", () => {
    const slugs = SAMPLE_DEFINITIONS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(10);
    for (const slug of slugs) expect(slug).toMatch(SLUG_PATTERN);
  });

  it("uses the plan's Indonesian names, in order", () => {
    expect(SAMPLE_DEFINITIONS.map((d) => d.id.name)).toEqual(PLAN_NAMES);
  });

  it.each(SAMPLE_DEFINITIONS.map((d) => [d.slug, d] as const))(
    "%s is a valid COMING_SOON ProductInput",
    (_slug, definition) => {
      const input = sampleProductInput(definition);
      expect(input.status).toBe("COMING_SOON");
      expect(input.images).toHaveLength(1);
      const parsed = productInputSchema.safeParse(input);
      expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    },
  );

  it("points at sample-01.png … sample-10.png, all distinct", () => {
    const images = SAMPLE_DEFINITIONS.map((d) => d.image);
    expect(images).toEqual(
      PLAN_NAMES.map((_, i) => `/images/placeholders/sample-${String(i + 1).padStart(2, "0")}.png`),
    );
    expect(new Set(images).size).toBe(10);
  });

  it("uses the plan's 10 distinct tints, in order", () => {
    const tints = SAMPLE_DEFINITIONS.map((d) => d.tint);
    expect(tints).toEqual(PLAN_TINTS);
    expect(new Set(tints).size).toBe(10);
  });

  it("keeps every short description within 20–155 characters", () => {
    for (const d of SAMPLE_DEFINITIONS) {
      for (const t of [d.id, d.en]) {
        expect(t.shortDescription.length).toBeGreaterThanOrEqual(20);
        expect(t.shortDescription.length).toBeLessThanOrEqual(155);
      }
    }
  });

  it("makes no claims in any description", () => {
    for (const d of SAMPLE_DEFINITIONS) {
      for (const text of [
        d.id.shortDescription,
        d.id.longDescription,
        d.en.shortDescription,
        d.en.longDescription,
      ]) {
        for (const claim of CLAIMS) expect(text).not.toMatch(claim);
      }
    }
  });
});
