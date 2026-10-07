/**
 * The rules an uploaded product image must meet (spec US2; research R-304).
 * Pure: the header parser in src/infrastructure/storage/image-header.ts
 * supplies width and height, and the upload route applies these rules after
 * it. "Square" is |w − h| / max(w, h) ≤ 2%, so 1000×1015 (1.48%) passes and
 * 1000×1040 (3.85%) does not, as the spec's edge cases require.
 */

export type ImageFormat = "jpeg" | "png" | "webp";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MIN_SIDE = 800;
export const RECOMMENDED_SIDE = 1200;
export const SQUARE_TOLERANCE = 0.02;

export const MIME_FOR_FORMAT: Readonly<Record<ImageFormat, string>> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** The stored extension comes from the detected format, never the uploaded filename (R-303). */
export const EXTENSION_FOR_FORMAT: Readonly<Record<ImageFormat, string>> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
};

export type ImageCheck =
  | { ok: true }
  | { ok: false; rule: "tooLarge"; limit: { maxBytes: number } }
  | { ok: false; rule: "tooSmall"; limit: { minSide: number } }
  | { ok: false; rule: "notSquare"; limit: { tolerancePercent: number } };

/** Checks in the contract's order: size, then minimum side, then squareness. */
export function checkImage({
  size,
  width,
  height,
}: {
  size: number;
  width: number;
  height: number;
}): ImageCheck {
  if (size > MAX_UPLOAD_BYTES) {
    return { ok: false, rule: "tooLarge", limit: { maxBytes: MAX_UPLOAD_BYTES } };
  }
  if (width < MIN_SIDE || height < MIN_SIDE) {
    return { ok: false, rule: "tooSmall", limit: { minSide: MIN_SIDE } };
  }
  if (Math.abs(width - height) / Math.max(width, height) > SQUARE_TOLERANCE) {
    return {
      ok: false,
      rule: "notSquare",
      limit: { tolerancePercent: Math.round(SQUARE_TOLERANCE * 100) },
    };
  }
  return { ok: true };
}
