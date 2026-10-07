import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
// Only this module: it must not import @/config, which validates the whole
// environment at load and cannot be satisfied by the unit project (R-305).
import {
  isValidUploadName,
  uploadNameFor,
  uploadNameSchema,
  uploadUrlSchema,
} from "@/infrastructure/storage/upload-name";

describe("uploadNameFor", () => {
  const bytes = Uint8Array.from([1, 2, 3, 4, 5]);
  const prefix = createHash("sha256").update(bytes).digest("hex").slice(0, 16);

  it("is the first 16 hex characters of the sha256 plus the format's extension", () => {
    expect(uploadNameFor(bytes, "jpeg")).toBe(`${prefix}.jpg`);
    expect(uploadNameFor(bytes, "png")).toBe(`${prefix}.png`);
    expect(uploadNameFor(bytes, "webp")).toBe(`${prefix}.webp`);
  });

  it("is deterministic for the same bytes", () => {
    expect(uploadNameFor(Uint8Array.from(bytes), "png")).toBe(uploadNameFor(bytes, "png"));
    expect(uploadNameFor(Uint8Array.from([1, 2, 3, 4, 6]), "png")).not.toBe(
      uploadNameFor(bytes, "png"),
    );
  });
});

describe("uploadNameSchema / isValidUploadName", () => {
  it.each(["0123456789abcdef.jpg", "0123456789abcdef.png", "3f9a0c1d2e4b5a69.webp"])(
    "accepts %s",
    (name) => {
      expect(uploadNameSchema.safeParse(name).success).toBe(true);
      expect(isValidUploadName(name)).toBe(true);
    },
  );

  it.each([
    "../x.jpg",
    "a/b.jpg",
    "a\\b.jpg",
    ".tmp-x",
    "0123456789ABCDEF.jpg",
    "0123456789abcde.jpg",
    "0123456789abcdef0.jpg",
    "0123456789abcdef.gif",
    "0123456789abcdef.jpeg",
    "",
    "../0123456789abcdef.jpg",
    "0123456789abcdef.jpg/",
  ])("rejects %j", (name) => {
    expect(uploadNameSchema.safeParse(name).success).toBe(false);
    expect(isValidUploadName(name)).toBe(false);
  });
});

describe("uploadUrlSchema", () => {
  it("accepts /uploads/<valid name> only", () => {
    expect(uploadUrlSchema.safeParse("/uploads/0123456789abcdef.webp").success).toBe(true);
    for (const url of [
      "0123456789abcdef.webp",
      "/uploads/../0123456789abcdef.webp",
      "/uploads/x.webp",
      "/images/product/0123456789abcdef.webp",
      "https://evil.example/uploads/0123456789abcdef.webp",
      "/uploads/0123456789abcdef.webp?x=1",
    ]) {
      expect(uploadUrlSchema.safeParse(url).success).toBe(false);
    }
  });
});
