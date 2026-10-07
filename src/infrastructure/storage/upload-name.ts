import { createHash } from "node:crypto";
import { z } from "zod";
import type { ImageFormat } from "@/domain/catalogue/image-rules";

/**
 * The naming rules for uploaded images (research R-305, R-306). Imports only
 * node:crypto and zod (plus an erased type): never @/config, which validates
 * the whole environment on import, so these rules stay importable from unit
 * tests and client-safe code. The file I/O lives in ./uploads.ts.
 *
 * A name is the first 16 hex characters of the SHA-256 of the bytes plus the
 * detected format's extension: content-addressed, so identical bytes always
 * map to one file, and nothing user-supplied ever reaches a path.
 */

export const UPLOAD_NAME_PATTERN = /^[0-9a-f]{16}\.(jpg|png|webp)$/;
export const UPLOAD_URL_PREFIX = "/uploads/";

/** Every server boundary that takes an upload name parses it with this first (Principle IX). */
export const uploadNameSchema = z.string().regex(UPLOAD_NAME_PATTERN);

export const uploadUrlSchema = z
  .string()
  .refine(
    (url) =>
      url.startsWith(UPLOAD_URL_PREFIX) &&
      uploadNameSchema.safeParse(url.slice(UPLOAD_URL_PREFIX.length)).success,
  );

export function isValidUploadName(name: string): boolean {
  return uploadNameSchema.safeParse(name).success;
}

// Mirrors EXTENSION_FOR_FORMAT in src/domain/catalogue/image-rules.ts and the
// extensions in UPLOAD_NAME_PATTERN; kept local so this module has no runtime
// imports beyond crypto and zod.
const EXTENSION: Readonly<Record<ImageFormat, string>> = { jpeg: "jpg", png: "png", webp: "webp" };

export function uploadNameFor(bytes: Uint8Array, format: ImageFormat): string {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return `${hash.slice(0, 16)}.${EXTENSION[format]}`;
}
