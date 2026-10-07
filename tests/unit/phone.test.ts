import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/domain/phone";

describe("normalizePhone", () => {
  it("collapses leading-0, +62 and bare-62 variants of the same number", () => {
    // All four represent the same underlying number, written with a leading
    // 0, a +62 prefix, spaces instead of dashes, and parentheses.
    const sameNumber = [
      "0812-3456-7890",
      "+62 812 3456 7890",
      "0812 3456 7890",
      "(0812) 3456-7890",
    ];

    const normalized = new Set(sameNumber.map(normalizePhone));
    expect(normalized.size).toBe(1);
    expect([...normalized][0]).toBe("+6281234567890");
  });

  it("collapses the bare-62 form with the +62 form of the same number", () => {
    expect(normalizePhone("62 8123456790")).toBe(normalizePhone("+628123456790"));
    expect(normalizePhone("62 8123456790")).toBe("+628123456790");
  });

  it("tolerates spaces, dashes and parentheses", () => {
    expect(normalizePhone("0812-3456-7890")).toBe(normalizePhone("0812 3456 7890"));
    expect(normalizePhone("0812-3456-7890")).toBe(normalizePhone("(0812) 3456-7890"));
  });

  it("never collides two genuinely different numbers", () => {
    expect(normalizePhone("0812-3456-7890")).not.toBe(normalizePhone("62 8123456789"));
    expect(normalizePhone("081234567890")).not.toBe(normalizePhone("081234567891"));
  });
});
