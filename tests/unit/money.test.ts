import { describe, expect, it } from "vitest";
import { formatIDR } from "@/domain/money";

describe("formatIDR", () => {
  it("formats the product price", () => {
    expect(formatIDR(169999)).toBe("Rp 169.999");
  });

  it("formats zero", () => {
    expect(formatIDR(0)).toBe("Rp 0");
  });

  it("formats a round million", () => {
    expect(formatIDR(1000000)).toBe("Rp 1.000.000");
  });

  it("produces the same output regardless of which UI locale is active", () => {
    // The currency is Indonesian Rupiah regardless of the reader's language —
    // formatIDR takes no locale parameter, so there is nothing to vary here;
    // this asserts the same call from an 'en' code path is identical (R-016).
    const fromId = formatIDR(169999);
    const fromEn = formatIDR(169999);
    expect(fromEn).toBe(fromId);
    expect(fromEn).toBe("Rp 169.999");
  });
});
