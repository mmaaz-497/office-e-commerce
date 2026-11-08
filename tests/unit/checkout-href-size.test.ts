import { describe, expect, it } from "vitest";
import { checkoutHref } from "@/components/product/checkout-href";

describe("checkoutHref size", () => {
  it("carries the chosen size to checkout in both languages", () => {
    expect(checkoutHref("id", "slippers-gemoy", 2, "40")).toBe(
      "/id/checkout?product=slippers-gemoy&quantity=2&size=40",
    );
    expect(checkoutHref("en", "slippers-gemoy", 1, "38/39")).toMatch(
      /\?product=slippers-gemoy&quantity=1&size=38%2F39$/,
    );
  });

  it("adds no size parameter when none is chosen", () => {
    expect(checkoutHref("id", "slippers-gemoy", 1)).toBe(
      "/id/checkout?product=slippers-gemoy&quantity=1",
    );
    expect(checkoutHref("id", "slippers-gemoy", 1, null)).not.toContain("size=");
  });
});
