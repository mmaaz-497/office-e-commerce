import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  issueToFieldError,
  resolveFieldError,
  toFieldErrors,
} from "@/components/admin/catalogue/form-errors";
import { productInputSchema } from "@/domain/catalogue/product-schema";

/**
 * The admin form shows zod issues as translated messages (Principle I): each
 * issue becomes a message key plus the limit it needs, keyed by its dotted
 * path. Issues come from real zod schemas, so a zod upgrade that changes an
 * issue shape fails here rather than in the owner's browser.
 */

function issuesOf(schema: z.ZodType, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a failure");
  return result.error.issues;
}

function firstIssue(schema: z.ZodType, input: unknown) {
  return issuesOf(schema, input)[0];
}

describe("issueToFieldError", () => {
  it("too_small on a string → tooShort with minimum", () => {
    expect(issueToFieldError(firstIssue(z.string().min(3), "x"))).toEqual({
      key: "tooShort",
      values: { minimum: 3 },
    });
  });

  it("too_big on a string → tooLong with maximum", () => {
    expect(issueToFieldError(firstIssue(z.string().max(2), "xyz"))).toEqual({
      key: "tooLong",
      values: { maximum: 2 },
    });
  });

  it("too_big on the images array → tooManyImages with maximum 8", () => {
    const schema = z.object({ images: z.array(z.number()).max(8) });
    expect(issueToFieldError(firstIssue(schema, { images: Array(9).fill(1) }))).toEqual({
      key: "tooManyImages",
      values: { maximum: 8 },
    });
  });

  it("too_small / too_big on a number → numberMin / numberMax", () => {
    expect(issueToFieldError(firstIssue(z.number().min(1000), 5))).toEqual({
      key: "numberMin",
      values: { minimum: 1000 },
    });
    expect(issueToFieldError(firstIssue(z.number().max(5), 9))).toEqual({
      key: "numberMax",
      values: { maximum: 5 },
    });
  });

  it("a regex failure on slug → slugFormat; on sku → skuFormat", () => {
    const schema = z.object({
      slug: z.string().regex(/^[a-z]+$/),
      sku: z.string().regex(/^[A-Z]+$/),
    });
    const issues = issuesOf(schema, { slug: "A", sku: "a" });
    expect(issueToFieldError(issues.find((i) => i.path[0] === "slug")!)).toEqual({
      key: "slugFormat",
    });
    expect(issueToFieldError(issues.find((i) => i.path[0] === "sku")!)).toEqual({
      key: "skuFormat",
    });
  });

  it("invalid_type → required", () => {
    expect(issueToFieldError(firstIssue(z.object({ a: z.string() }), {}))).toEqual({
      key: "required",
    });
  });

  it("a custom issue with params.key → that key", () => {
    const issue = firstIssue(productInputSchema, {
      slug: "abc",
      sku: null,
      status: "ACTIVE",
      priceIDR: null,
      compareAtPriceIDR: null,
      images: [],
      video: null,
      translations: {
        id: translation(),
        en: translation(),
      },
    });
    expect(issueToFieldError(issue)).toEqual({ key: "activeNeedsPrice" });
  });
});

describe("toFieldErrors", () => {
  it("joins paths with dots and groups issues per path", () => {
    const schema = z.object({
      translations: z.object({
        en: z.object({ highlights: z.array(z.string().min(1).max(3)) }),
      }),
    });
    const errors = toFieldErrors(
      issuesOf(schema, { translations: { en: { highlights: ["ok", "ok", ""] } } }),
    );
    expect(errors).toEqual({
      "translations.en.highlights.2": [{ key: "tooShort", values: { minimum: 1 } }],
    });
  });

  it("collects several issues on one path", () => {
    const errors = toFieldErrors([
      { code: "custom", path: ["slug"], message: "a", params: { key: "slugTaken" } },
      { code: "custom", path: ["slug"], message: "b", params: { key: "slugLocked" } },
    ] as never);
    expect(errors.slug).toEqual([{ key: "slugTaken" }, { key: "slugLocked" }]);
  });
});

describe("resolveFieldError", () => {
  it("interpolates minimum and maximum", () => {
    const messages = { tooShort: "At least {minimum} characters", tooLong: "At most {maximum}" };
    expect(resolveFieldError({ key: "tooShort", values: { minimum: 3 } }, messages)).toBe(
      "At least 3 characters",
    );
    expect(resolveFieldError({ key: "tooLong", values: { maximum: 60 } }, messages)).toBe(
      "At most 60",
    );
  });

  it("falls back to the generic message for an unknown key", () => {
    expect(resolveFieldError({ key: "nope" }, { invalid: "Check this field" })).toBe(
      "Check this field",
    );
  });
});

function translation() {
  return {
    name: "Sandal Gemoy",
    shortDescription: "Empuk & nyaman · Anti slip · Desain lucu",
    longDescription: "",
    highlights: [],
    specs: [],
    seoTitle: null,
    seoDescription: null,
    videoAlt: null,
  };
}

describe("Phase 2c status field errors", () => {
  it.each(["id", "en"] as const)(
    "resolves stockRequired and sampleStatusLocked from the %s catalogue",
    async (locale) => {
      const messages = (await import(`@/messages/${locale}.json`)).default as {
        admin: { productForm: { errors: Record<string, string> } };
      };
      const formErrors = messages.admin.productForm.errors;
      for (const key of ["stockRequired", "sampleStatusLocked"]) {
        expect(formErrors[key]).toBeTruthy();
        expect(resolveFieldError({ key }, formErrors)).toBe(formErrors[key]);
      }
    },
  );
});
