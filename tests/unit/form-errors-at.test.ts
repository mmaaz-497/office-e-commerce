import { describe, expect, it } from "vitest";
import { fieldErrorsAt } from "@/components/admin/catalogue/form-errors";

describe("fieldErrorsAt", () => {
  it("gives [] for a field with no errors, so an untouched form renders", () => {
    expect(fieldErrorsAt({}, "slug")).toEqual([]);
    expect(fieldErrorsAt({ sku: [{ key: "skuFormat" }] }, "slug")).toEqual([]);
  });

  it("gives a field its own errors", () => {
    expect(fieldErrorsAt({ slug: [{ key: "slugFormat" }] }, "slug")).toEqual([
      { key: "slugFormat" },
    ]);
  });

  it("shows errors on single sizes on the sizes input", () => {
    const errors = {
      sizes: [{ key: "sizesDuplicate" }],
      "sizes.2": [{ key: "invalid" }],
      sizesX: [{ key: "other" }],
    };
    expect(fieldErrorsAt(errors, "sizes")).toEqual([{ key: "sizesDuplicate" }, { key: "invalid" }]);
  });
});
