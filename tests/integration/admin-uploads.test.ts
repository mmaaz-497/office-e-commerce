import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { gif, heic, jpeg, jpegWithoutFrame, pdf, png, webpLossy } from "../helpers/image-bytes";

const { cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieStore: {
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
      clear: () => store.clear(),
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

// Set by tests/integration/setup.ts to a temp directory, never the operator's.
const UPLOAD_DIR = process.env.UPLOAD_DIR!;
const URL_BASE = "http://localhost:3000/admin/api/uploads";

type Part = { name: string; filename?: string; type?: string; data: Uint8Array | string };

/**
 * A multipart body as bytes, so the request can carry an explicit
 * Content-Length: Node does not set one for a FormData body, and the route
 * refuses a request without it (contracts/uploads.md check 3a).
 */
function multipartBody(parts: Part[]): { body: Uint8Array<ArrayBuffer>; contentType: string } {
  const boundary = "----tokoshopee-test-boundary-7d1f";
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"`;
    head += "\r\n";
    if (part.type) head += `Content-Type: ${part.type}\r\n`;
    head += "\r\n";
    chunks.push(encoder.encode(head));
    chunks.push(typeof part.data === "string" ? encoder.encode(part.data) : part.data);
    chunks.push(encoder.encode("\r\n"));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function filePart(data: Uint8Array, type: string, filename = "photo"): Part {
  return { name: "file", filename, type, data };
}

function uploadRequest(
  parts: Part[],
  {
    headers = {},
    omit = [],
    url = URL_BASE,
  }: { headers?: Record<string, string>; omit?: string[]; url?: string } = {},
): Request {
  const { body, contentType } = multipartBody(parts);
  const all: Record<string, string> = {
    Host: "localhost:3000",
    Origin: "http://localhost:3000",
    "Content-Type": contentType,
    "Content-Length": String(body.byteLength),
    ...headers,
  };
  const h = new Headers();
  for (const [name, value] of Object.entries(all)) {
    if (!omit.includes(name)) h.set(name, value);
  }
  return new Request(url, { method: "POST", headers: h, body });
}

async function post(request: Request) {
  const { POST } = await import("@/app/admin/api/uploads/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

const listUploads = () => readdirSync(UPLOAD_DIR).sort();

/** Asserts a refused request wrote nothing: no new file and no leftover .tmp-*. */
async function expectRefused(request: Request, status: number, error: string) {
  const before = listUploads();
  const result = await post(request);
  expect(result.status).toBe(status);
  expect(result.body.error).toBe(error);
  expect(listUploads()).toEqual(before);
  expect(listUploads().filter((f) => f.startsWith(".tmp-"))).toEqual([]);
  return result;
}

/** Spec US2, contracts/uploads.md POST /admin/api/uploads. */
describe("POST /admin/api/uploads (integration)", () => {
  beforeEach(async () => {
    cookieStore.clear();
    for (const entry of readdirSync(UPLOAD_DIR)) {
      rmSync(path.join(UPLOAD_DIR, entry), { recursive: true, force: true });
    }
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(() => {
    cookieStore.clear();
  });

  it.each([
    ["PNG", png(1200, 1200), "image/png", ".png"],
    ["JPEG", jpeg(1200, 1200), "image/jpeg", ".jpg"],
    ["WebP", webpLossy(1200, 1200), "image/webp", ".webp"],
  ])("stores a valid 1200×1200 %s and answers 201", async (_name, bytes, type, ext) => {
    const result = await post(uploadRequest([filePart(bytes, type)]));
    expect(result.status).toBe(201);
    expect(result.body).toEqual({
      url: expect.stringMatching(new RegExp(`^/uploads/[0-9a-f]{16}\\${ext}$`)),
      width: 1200,
      height: 1200,
      orientation: "square",
    });
    const stored = path.join(UPLOAD_DIR, result.body.url.slice("/uploads/".length));
    expect(existsSync(stored)).toBe(true);
    expect(new Uint8Array(readFileSync(stored))).toEqual(bytes);
  });

  it("answers 200 with the same url for identical bytes, keeping one file", async () => {
    const bytes = png(1200, 1200);
    const first = await post(uploadRequest([filePart(bytes, "image/png")]));
    const second = await post(uploadRequest([filePart(bytes, "image/png", "again.png")]));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(listUploads()).toHaveLength(1);
  });

  it("answers 401 with no session and writes nothing", async () => {
    cookieStore.clear();
    await expectRefused(
      uploadRequest([filePart(png(1200, 1200), "image/png")]),
      401,
      "unauthorized",
    );
  });

  describe("Origin (R-302, check 2)", () => {
    const file = () => [filePart(png(1200, 1200), "image/png")];

    it("refuses a foreign Origin", async () => {
      await expectRefused(
        uploadRequest(file(), { headers: { Origin: "https://evil.example" } }),
        403,
        "forbidden",
      );
    });

    it("refuses a missing Origin", async () => {
      await expectRefused(uploadRequest(file(), { omit: ["Origin"] }), 403, "forbidden");
    });

    it("refuses Origin: null", async () => {
      await expectRefused(uploadRequest(file(), { headers: { Origin: "null" } }), 403, "forbidden");
    });

    it("refuses an Origin whose port differs", async () => {
      await expectRefused(
        uploadRequest(file(), { headers: { Origin: "http://localhost:3001" } }),
        403,
        "forbidden",
      );
    });

    it("accepts the forwarded host behind the proxy", async () => {
      const result = await post(
        uploadRequest(file(), {
          url: "http://127.0.0.1:3000/admin/api/uploads",
          headers: {
            Host: "127.0.0.1:3000",
            "X-Forwarded-Host": "tokoshopee.com",
            Origin: "https://tokoshopee.com",
          },
        }),
      );
      expect(result.status).toBe(201);
    });

    it("refuses a suffix match on the forwarded host", async () => {
      await expectRefused(
        uploadRequest(file(), {
          url: "http://127.0.0.1:3000/admin/api/uploads",
          headers: {
            Host: "127.0.0.1:3000",
            "X-Forwarded-Host": "tokoshopee.com",
            Origin: "https://tokoshopee.com.evil.example",
          },
        }),
        403,
        "forbidden",
      );
    });
  });

  it("answers 411 lengthRequired with no Content-Length and writes nothing", async () => {
    await expectRefused(
      uploadRequest([filePart(png(1200, 1200), "image/png")], { omit: ["Content-Length"] }),
      411,
      "lengthRequired",
    );
  });

  it("answers 413 when Content-Length is over the limit", async () => {
    const result = await expectRefused(
      uploadRequest([filePart(png(1200, 1200, { size: 2_200_000 }), "image/png")]),
      413,
      "tooLarge",
    );
    expect(result.body.limit).toEqual({ maxBytes: 2_097_152 });
  });

  it("answers 413 for a file over 2 MB that fits the multipart allowance", async () => {
    const request = uploadRequest([filePart(png(1200, 1200, { size: 2_097_153 }), "image/png")]);
    expect(Number(request.headers.get("content-length"))).toBeLessThanOrEqual(2_162_688);
    await expectRefused(request, 413, "tooLarge");
  });

  it.each([
    ["a GIF", gif(), "image/gif", "x.gif"],
    ["a HEIC", heic(), "image/heic", "x.heic"],
    ["a PNG declared as image/jpeg", png(1200, 1200), "image/jpeg", "x.jpg"],
    ["a PDF named x.jpg", pdf(), "image/jpeg", "x.jpg"],
  ])("answers 415 for %s", async (_name, bytes, type, filename) => {
    const result = await expectRefused(
      uploadRequest([filePart(bytes, type, filename)]),
      415,
      "unsupportedFormat",
    );
    expect(result.body.limit).toEqual({ formats: ["JPEG", "PNG", "WebP"] });
  });

  it.each([
    ["tooSmall", png(799, 799), "image/png", { minSide: 800 }],
    ["notSquare", png(1000, 1040), "image/png", { tolerancePercent: 2 }],
    ["animated", png(1200, 1200, { animated: true }), "image/png", undefined],
    ["unreadable", jpegWithoutFrame(), "image/jpeg", undefined],
  ])("answers 422 %s", async (error, bytes, type, limit) => {
    const result = await expectRefused(uploadRequest([filePart(bytes, type)]), 422, error);
    expect(result.body.limit).toEqual(limit);
  });

  it("answers 400 for two files", async () => {
    await expectRefused(
      uploadRequest([
        filePart(png(1200, 1200), "image/png"),
        filePart(jpeg(1200, 1200), "image/jpeg"),
      ]),
      400,
      "validation",
    );
  });

  it("answers 400 for no file", async () => {
    await expectRefused(uploadRequest([{ name: "note", data: "hello" }]), 400, "validation");
  });

  it("answers 400 when the file field is plain text", async () => {
    await expectRefused(uploadRequest([{ name: "file", data: "not a file" }]), 400, "validation");
  });
});

/** Analysis L1, T017: the middleware answers /admin/api/* with JSON, not a redirect. */
describe("middleware on /admin/api/* (integration)", () => {
  it("answers 401 JSON for an upload with no session cookie", async () => {
    const { default: middleware } = await import("@/middleware");
    const response = await middleware(
      new NextRequest("http://localhost:3000/admin/api/uploads", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("still redirects an admin page with no session cookie to /admin/login", async () => {
    const { default: middleware } = await import("@/middleware");
    const response = await middleware(new NextRequest("http://localhost:3000/admin/products"));
    expect([307, 308]).toContain(response.status);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/admin/login");
  });
});
