/**
 * Joins the truthy class-name parts with spaces. Six lines of string joining
 * do not justify a clsx dependency (research R-503, Constitution Principle X).
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
