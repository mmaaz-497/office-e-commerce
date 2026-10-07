import type { ImageFormat } from "@/domain/catalogue/image-rules";

/**
 * Format, dimensions and animation read from an image's header bytes
 * (research R-303, R-304). No dependency and no decoding: three signatures and
 * three header layouts do not justify one. Pure byte logic, bounds-checked on
 * every read: malformed or truncated input yields null (or false), never a
 * throw, so the upload route can answer it with a 4xx.
 */

export type Dimensions = { width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string | null {
  if (bytes.length < offset + length) return null;
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16be(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 4) return null;
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function u16le(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 2) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 3) return null;
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "webp";
  return null;
}

function pngDimensions(bytes: Uint8Array): Dimensions | null {
  // The first chunk must be IHDR: width and height are big-endian at 16 and 20.
  if (ascii(bytes, 12, 4) !== "IHDR") return null;
  const width = u32be(bytes, 16);
  const height = u32be(bytes, 20);
  if (width === null || height === null) return null;
  return { width, height };
}

/** SOF0–SOF15, excluding DHT (C4), JPG (C8) and DAC (CC), which share the range. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpegDimensions(bytes: Uint8Array): Dimensions | null {
  let offset = 2; // past SOI
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    // Any number of 0xFF fill bytes may precede a marker.
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset++;
    // Standalone markers carry no length: TEM and RST0–RST7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // Start of scan or end of image before any frame header: nothing to read.
    if (marker === 0xda || marker === 0xd9) return null;
    const length = u16be(bytes, offset);
    if (length === null || length < 2) return null;
    if (isStartOfFrame(marker)) {
      const height = u16be(bytes, offset + 3);
      const width = u16be(bytes, offset + 5);
      if (height === null || width === null) return null;
      return { width, height };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): Dimensions | null {
  switch (ascii(bytes, 12, 4)) {
    case "VP8 ": {
      // Lossy: a 3-byte frame tag, the start code 9D 01 2A, then 14-bit sizes.
      if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
      const width = u16le(bytes, 26);
      const height = u16le(bytes, 28);
      if (width === null || height === null) return null;
      return { width: width & 0x3fff, height: height & 0x3fff };
    }
    case "VP8L": {
      // Lossless: signature 0x2F, then width-1 and height-1 packed as 14-bit fields.
      if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
      const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case "VP8X": {
      // Extended: flags, 3 reserved bytes, then 24-bit width-1 and height-1.
      const width = u24le(bytes, 24);
      const height = u24le(bytes, 27);
      if (width === null || height === null) return null;
      return { width: width + 1, height: height + 1 };
    }
    default:
      return null;
  }
}

export function readDimensions(bytes: Uint8Array, format: ImageFormat): Dimensions | null {
  switch (format) {
    case "png":
      return pngDimensions(bytes);
    case "jpeg":
      return jpegDimensions(bytes);
    case "webp":
      return webpDimensions(bytes);
  }
}

/** An APNG declares itself with an acTL chunk before the first IDAT. */
function pngIsAnimated(bytes: Uint8Array): boolean {
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    if (length === null || type === null) return false;
    if (type === "acTL") return true;
    if (type === "IDAT" || type === "IEND") return false;
    offset += 12 + length; // length, type, data, CRC
  }
  return false;
}

export function isAnimated(bytes: Uint8Array, format: ImageFormat): boolean {
  switch (format) {
    case "png":
      return pngIsAnimated(bytes);
    case "webp":
      // Only the extended format can animate; its flag byte has bit 1 set.
      return ascii(bytes, 12, 4) === "VP8X" && bytes.length > 20 && (bytes[20] & 0x02) !== 0;
    case "jpeg":
      return false;
  }
}
