import { describe, expect, it } from "vitest";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";

/**
 * T036 (005 R-413). The placeholder's name is drawn in ink and its wordmark
 * in ink-2; both must reach WCAG AA (4.5:1) on every sample tint. Computed,
 * not asserted by eye.
 */
const INK = "#2E1B10";
const INK_2 = "#5C4434";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("placeholder contrast (R-413)", () => {
  it("computes known ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    // CLAUDE.md design tokens: ink on surface is 16.40.
    expect(contrastRatio(INK, "#FFFFFF")).toBeCloseTo(16.4, 1);
  });

  it.each(SAMPLE_DEFINITIONS.map((d) => [d.slug, d.tint] as const))(
    "ink and ink-2 reach 4.5:1 on %s",
    (_slug, tint) => {
      expect(contrastRatio(INK, tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(INK_2, tint)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
