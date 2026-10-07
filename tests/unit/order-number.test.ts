import { describe, expect, it } from "vitest";
import { generateOrderNumber, isValidOrderNumberFormat } from "@/domain/order/order-number";

const EXCLUDED_CHARS = ["I", "L", "O", "U"];

describe("generateOrderNumber", () => {
  it("matches the TKS-YYMMDD-XXXXX format", () => {
    const n = generateOrderNumber(new Date("2026-09-19T00:00:00Z"));
    expect(n).toMatch(/^TKS-260919-[0-9A-Z]{5}$/);
    expect(isValidOrderNumberFormat(n)).toBe(true);
  });

  it("contains no excluded characters and matches the format across 10,000 generations", () => {
    for (let i = 0; i < 10_000; i++) {
      const n = generateOrderNumber();
      for (const bad of EXCLUDED_CHARS) {
        expect(n).not.toContain(bad);
      }
      expect(isValidOrderNumberFormat(n)).toBe(true);
    }
  });

  it("duplicate rate across 10,000 generations matches true randomness, not a broken generator", () => {
    // The 5-character suffix has 32^5 = 33,554,432 possible values. By the
    // birthday paradox, 10,000 draws from that space have an ~77% chance of
    // AT LEAST ONE collision (expected count ≈ 10000²/(2·33,554,432) ≈ 1.49)
    // — a real, occasional collision here is expected math, not a defect;
    // it is exactly why R-013/T025 puts a unique constraint plus retry at
    // the persistence layer rather than relying on this pure generator alone.
    // Asserting zero duplicates would therefore fail roughly 3 out of 4 runs
    // of this very test. What DOES indicate a broken generator is a duplicate
    // count far above the ~1-2 true randomness predicts — e.g. a generator
    // that only produces a handful of distinct values. 10,000 as a Poisson
    // upper-bound margin around λ≈1.49 comfortably tolerates true-random
    // collisions while still catching that failure mode.
    const seen = new Map<string, number>();
    for (let i = 0; i < 10_000; i++) {
      const n = generateOrderNumber();
      seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    const duplicateCount = 10_000 - seen.size;
    expect(duplicateCount).toBeLessThan(50);
  });

  it("does not produce sequentially related consecutive numbers", () => {
    const suffixes = Array.from({ length: 20 }, () => generateOrderNumber().split("-")[2]);

    // No two consecutive draws are identical, and the sequence is not simply
    // counting up one alphabet position at a time — either would indicate a
    // non-random, guessable generator.
    for (let i = 1; i < suffixes.length; i++) {
      expect(suffixes[i]).not.toBe(suffixes[i - 1]);
    }

    const allSameFirstChar = suffixes.every((s) => s[0] === suffixes[0][0]);
    expect(allSameFirstChar).toBe(false);
  });
});
