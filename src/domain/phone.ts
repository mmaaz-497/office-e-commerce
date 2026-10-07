/**
 * `0812-3456-7890`, `+62 812 3456 7890` and `62 8123456789` all normalise to
 * the identical string, so lookup and review-eligibility matching tolerate
 * common formatting differences without treating two written forms of the
 * same number as different customers (FR-039).
 */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");

  let subscriber: string;
  if (digitsOnly.startsWith("62")) {
    subscriber = digitsOnly.slice(2);
  } else if (digitsOnly.startsWith("0")) {
    subscriber = digitsOnly.slice(1);
  } else {
    subscriber = digitsOnly;
  }

  return `+62${subscriber}`;
}
