import { randomInt } from "node:crypto";

/**
 * Crockford base32 — excludes I, L, O and U so a customer reading a number
 * aloud over the phone can't confuse it with 1, 1, 0 or a typo, and two
 * consecutive numbers give no hint of order (FR-017, research R-013).
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SUFFIX_LENGTH = 5;

const ORDER_NUMBER_PATTERN = /^TKS-\d{6}-[0-9A-HJKMNP-TV-Z]{5}$/;

function randomSuffix(): string {
  let out = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

function datePart(date: Date): string {
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Produces `TKS-YYMMDD-XXXXX` from a CSPRNG. Retry on the vanishingly rare
 * unique-constraint collision happens at the persistence layer, not here. */
export function generateOrderNumber(date: Date = new Date()): string {
  return `TKS-${datePart(date)}-${randomSuffix()}`;
}

export function isValidOrderNumberFormat(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}
