import { readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { png } from "../helpers/image-bytes";

// Wrap readUpload so the test can prove an invalid name never reaches the
// file system (Principle IX, analysis C1).
vi.mock("@/infrastructure/storage/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/infrastructure/storage/uploads")>();
  return { ...actual, readUpload: vi.fn(actual.readUpload) };
});

const UPLOAD_DIR = process.env.UPLOAD_DIR!;
const NAME = "0123456789abcdef.png";

async function get(file: string) {
  const { GET } = await import("@/app/uploads/[file]/route");
  return GET(new Request(`http://localhost:3000/uploads/${encodeURIComponent(file)}`), {
    params: Promise.resolve({ file }),
  });
}

/** contracts/uploads.md GET /uploads/[file]; research R-306. */
describe("GET /uploads/[file] (integration)", () => {
  beforeEach(async () => {
    for (const entry of readdirSync(UPLOAD_DIR)) {
      rmSync(path.join(UPLOAD_DIR, entry), { recursive: true, force: true });
    }
    const { readUpload } = await import("@/infrastructure/storage/uploads");
    vi.mocked(readUpload).mockClear();
  });

  it("serves a stored file with its exact bytes and immutable headers", async () => {
    const bytes = png(1200, 1200);
    writeFileSync(path.join(UPLOAD_DIR, NAME), bytes);

    const response = await get(NAME);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
  });

  it("answers 404 for a valid name that is missing", async () => {
    const response = await get("fedcba9876543210.webp");
    expect(response.status).toBe(404);
  });

  it.each([
    "../../package.json",
    "..%2f..%2fpackage.json",
    "..\\.env",
    ".tmp-abc",
    "ABCDEF0123456789.jpg",
    "0123456789abcdef.gif",
    "",
  ])("answers 404 for %j without touching the file system", async (file) => {
    const { readUpload } = await import("@/infrastructure/storage/uploads");
    const response = await get(file);
    expect(response.status).toBe(404);
    expect(readUpload).not.toHaveBeenCalled();
  });
});
