import type { core } from "zod";

/**
 * Maps zod issues to translatable field errors (Principle I, research R-308).
 * The admin form and the saveProduct action both use it: the form for its own
 * pre-submit check, the action for its fieldErrors result, so the same input
 * yields the same keys on either side. The key names an
 * admin.productForm.errors.* message; `values` carries the limit it shows.
 *
 * Pure and client-safe: zod types only, no server imports.
 */

export interface FieldError {
  key: string;
  values?: Record<string, number | string>;
}

type Issue = core.$ZodIssue;

/** Path → the message key used for a pattern failure on that field. */
const FORMAT_KEYS: Record<string, string> = { slug: "slugFormat", sku: "skuFormat" };

function lastSegment(path: readonly PropertyKey[]): string {
  const last = path[path.length - 1];
  return typeof last === "string" ? last : "";
}

export function issueToFieldError(issue: Issue): FieldError {
  switch (issue.code) {
    case "custom": {
      const key = (issue.params as { key?: unknown } | undefined)?.key;
      return { key: typeof key === "string" ? key : "invalid" };
    }
    case "too_small": {
      const minimum = Number(issue.minimum);
      if (issue.origin === "string") return { key: "tooShort", values: { minimum } };
      if (issue.origin === "number") return { key: "numberMin", values: { minimum } };
      return { key: "tooFew", values: { minimum } };
    }
    case "too_big": {
      const maximum = Number(issue.maximum);
      if (issue.origin === "string") return { key: "tooLong", values: { maximum } };
      if (issue.origin === "number") return { key: "numberMax", values: { maximum } };
      if (lastSegment(issue.path) === "images")
        return { key: "tooManyImages", values: { maximum } };
      return { key: "tooMany", values: { maximum } };
    }
    case "invalid_format":
      return { key: FORMAT_KEYS[lastSegment(issue.path)] ?? "invalid" };
    case "invalid_type":
      return { key: issue.expected === "int" ? "wholeNumber" : "required" };
    case "invalid_value":
      return { key: "required" };
    default:
      return { key: "invalid" };
  }
}

export function toFieldErrors(issues: readonly Issue[]): Record<string, FieldError[]> {
  const errors: Record<string, FieldError[]> = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join(".");
    (errors[path] ??= []).push(issueToFieldError(issue));
  }
  return errors;
}

/**
 * Fills {placeholders} in a raw message template. Admin client components get
 * raw templates as props (the admin tree has no NextIntlClientProvider) and
 * only ever use simple {name} arguments, never ICU plurals.
 */
export function fillTemplate(
  template: string,
  values: Record<string, number | string> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/** The message for `err` from `messages` (keyed by error key), with {placeholders} filled. */
export function resolveFieldError(err: FieldError, messages: Record<string, string>): string {
  const template = messages[err.key] ?? messages.invalid ?? err.key;
  return fillTemplate(template, err.values);
}
