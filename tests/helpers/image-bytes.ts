/**
 * Image headers built as bytes in the test run, so no binary fixtures are
 * committed (research R-304). Each builder writes only what the header parser
 * reads, then pads with zeros to `size` bytes; the result is a valid header,
 * not a decodable image, which is all the upload checks look at.
 */

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u24le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

function padded(bytes: number[], size: number): Uint8Array {
  const out = new Uint8Array(Math.max(size, bytes.length));
  out.set(bytes);
  return out;
}

function pngChunk(type: string, data: number[]): number[] {
  // CRC is not checked by the parser; zeros keep the builder small.
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

export function png(
  width: number,
  height: number,
  { animated = false, size = 1024 }: { animated?: boolean; size?: number } = {},
): Uint8Array {
  const ihdr = pngChunk("IHDR", [...u32be(width), ...u32be(height), 8, 6, 0, 0, 0]);
  const actl = animated ? pngChunk("acTL", [...u32be(2), ...u32be(0)]) : [];
  const idat = pngChunk("IDAT", [0, 0]);
  return padded([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...actl, ...idat], size);
}

const JPEG_APP0 = [
  0xff,
  0xe0,
  ...u16be(16),
  ...ascii("JFIF"),
  0,
  1,
  1,
  0,
  ...u16be(1),
  ...u16be(1),
  0,
  0,
];

export function jpeg(
  width: number,
  height: number,
  { sof = 0xc0, size = 1024 }: { sof?: number; size?: number } = {},
): Uint8Array {
  const frame = [0xff, sof, ...u16be(11), 8, ...u16be(height), ...u16be(width), 1, 1, 0x11, 0];
  return padded([0xff, 0xd8, ...JPEG_APP0, ...frame], size);
}

/** SOI and an APP0 segment, then nothing: no frame header to read. */
export function jpegWithoutFrame(): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, ...JPEG_APP0]);
}

function riff(chunk: string, data: number[], size: number): Uint8Array {
  const body = [...ascii("WEBP"), ...ascii(chunk), ...u32le(data.length), ...data];
  return padded([...ascii("RIFF"), ...u32le(body.length), ...body], size);
}

export function webpLossy(width: number, height: number, size = 1024): Uint8Array {
  return riff("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(width), ...u16le(height)], size);
}

export function webpLossless(width: number, height: number, size = 1024): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff("VP8L", [0x2f, ...u32le(bits)], size);
}

export function webpExtended(
  width: number,
  height: number,
  { animated = false, size = 1024 }: { animated?: boolean; size?: number } = {},
): Uint8Array {
  const flags = animated ? 0x02 : 0;
  return riff("VP8X", [flags, 0, 0, 0, ...u24le(width - 1), ...u24le(height - 1)], size);
}

export const gif = () => padded([...ascii("GIF89a"), ...u16le(1200), ...u16le(1200)], 64);
export const pdf = () => padded(ascii("%PDF-1.7\n%"), 64);
export const svg = () =>
  Uint8Array.from(ascii('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"/>'));
export const heic = () => padded([0, 0, 0, 0x18, ...ascii("ftypheic"), 0, 0, 0, 0], 64);
/** Fixed rather than random, so a run can never accidentally start with a signature. */
export const noise = () =>
  Uint8Array.from([0x13, 0x37, 0x42, 0x00, 0x99, 0x7e, 0x01, 0x5a, 0xc3, 0x10]);
