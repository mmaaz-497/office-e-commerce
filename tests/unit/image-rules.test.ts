import { describe, expect, it } from "vitest";
import {
  EXTENSION_FOR_FORMAT,
  MAX_UPLOAD_BYTES,
  MIME_FOR_FORMAT,
  MIN_SIDE,
  checkImage,
} from "@/domain/catalogue/image-rules";

/** Research R-304: the size rules, separate from the header parser. */
describe("checkImage", () => {
  const square = { width: 1200, height: 1200 };

  it("accepts exactly 2 MB and refuses one byte more", () => {
    expect(checkImage({ size: 2_097_152, ...square })).toEqual({ ok: true });
    expect(checkImage({ size: 2_097_153, ...square })).toEqual({
      ok: false,
      rule: "tooLarge",
      limit: { maxBytes: 2_097_152 },
    });
  });

  it("refuses 799×799 and accepts 800×800", () => {
    expect(checkImage({ size: 1000, width: 799, height: 799 })).toEqual({
      ok: false,
      rule: "tooSmall",
      limit: { minSide: 800 },
    });
    expect(checkImage({ size: 1000, width: 800, height: 800 })).toEqual({ ok: true });
  });

  it("allows ±2% from square in either direction", () => {
    expect(checkImage({ size: 1000, width: 1000, height: 1015 })).toEqual({ ok: true });
    expect(checkImage({ size: 1000, width: 1015, height: 1000 })).toEqual({ ok: true });
    expect(checkImage({ size: 1000, width: 1000, height: 1040 })).toEqual({
      ok: false,
      rule: "notSquare",
      limit: { tolerancePercent: 2 },
    });
  });

  it("exports the limits it enforces", () => {
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024);
    expect(MIN_SIDE).toBe(800);
  });
});

describe("format maps", () => {
  it("maps each format to its MIME type and stored extension", () => {
    expect(MIME_FOR_FORMAT).toEqual({
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    });
    expect(EXTENSION_FOR_FORMAT).toEqual({ jpeg: "jpg", png: "png", webp: "webp" });
  });
});
