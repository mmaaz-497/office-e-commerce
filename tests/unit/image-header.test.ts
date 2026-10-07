import { describe, expect, it } from "vitest";
import { detectFormat, isAnimated, readDimensions } from "@/infrastructure/storage/image-header";
import {
  gif,
  heic,
  jpeg,
  jpegWithoutFrame,
  noise,
  pdf,
  png,
  svg,
  webpExtended,
  webpLossless,
  webpLossy,
} from "../helpers/image-bytes";

/** Research R-303 (magic bytes) and R-304 (dimensions from the header, no dependency). */
describe("detectFormat", () => {
  it.each([
    ["PNG", png(1200, 1200), "png"],
    ["JPEG", jpeg(1000, 1015), "jpeg"],
    ["progressive JPEG", jpeg(1200, 1200, { sof: 0xc2 }), "jpeg"],
    ["WebP VP8", webpLossy(800, 800), "webp"],
    ["WebP VP8L", webpLossless(1200, 1200), "webp"],
    ["WebP VP8X", webpExtended(1200, 1200), "webp"],
  ])("recognises %s", (_name, bytes, format) => {
    expect(detectFormat(bytes)).toBe(format);
  });

  it.each([
    ["GIF89a", gif()],
    ["PDF", pdf()],
    ["SVG", svg()],
    ["HEIC", heic()],
    ["10 random bytes", noise()],
    ["empty input", new Uint8Array(0)],
    ["a truncated PNG signature", png(1200, 1200).slice(0, 4)],
  ])("refuses %s", (_name, bytes) => {
    expect(detectFormat(bytes)).toBeNull();
  });
});

describe("readDimensions", () => {
  it("reads a PNG IHDR", () => {
    expect(readDimensions(png(1200, 1200), "png")).toEqual({ width: 1200, height: 1200 });
  });

  it("walks past APP0 to SOF0 in a JPEG", () => {
    expect(readDimensions(jpeg(1000, 1015), "jpeg")).toEqual({ width: 1000, height: 1015 });
  });

  it("reads a progressive (SOF2) JPEG", () => {
    expect(readDimensions(jpeg(1200, 900, { sof: 0xc2 }), "jpeg")).toEqual({
      width: 1200,
      height: 900,
    });
  });

  it("returns null for a JPEG truncated before any SOF", () => {
    expect(readDimensions(jpegWithoutFrame(), "jpeg")).toBeNull();
  });

  it("reads WebP VP8, VP8L and VP8X", () => {
    expect(readDimensions(webpLossy(800, 800), "webp")).toEqual({ width: 800, height: 800 });
    expect(readDimensions(webpLossless(1200, 1200), "webp")).toEqual({
      width: 1200,
      height: 1200,
    });
    expect(readDimensions(webpExtended(1200, 1200), "webp")).toEqual({
      width: 1200,
      height: 1200,
    });
  });

  it("returns null instead of throwing on truncated input", () => {
    expect(readDimensions(png(1200, 1200).slice(0, 20), "png")).toBeNull();
    expect(readDimensions(webpLossy(800, 800).slice(0, 24), "webp")).toBeNull();
    expect(readDimensions(jpeg(1200, 1200).slice(0, 25), "jpeg")).toBeNull();
    expect(readDimensions(noise(), "webp")).toBeNull();
  });
});

describe("isAnimated", () => {
  it("flags a PNG with acTL before IDAT", () => {
    expect(isAnimated(png(1200, 1200, { animated: true }), "png")).toBe(true);
    expect(isAnimated(png(1200, 1200), "png")).toBe(false);
  });

  it("flags a VP8X WebP with the animation bit", () => {
    expect(isAnimated(webpExtended(1200, 1200, { animated: true }), "webp")).toBe(true);
    expect(isAnimated(webpExtended(1200, 1200), "webp")).toBe(false);
    expect(isAnimated(webpLossy(800, 800), "webp")).toBe(false);
    expect(isAnimated(webpLossless(1200, 1200), "webp")).toBe(false);
  });

  it("never flags a JPEG", () => {
    expect(isAnimated(jpeg(1200, 1200), "jpeg")).toBe(false);
  });
});
