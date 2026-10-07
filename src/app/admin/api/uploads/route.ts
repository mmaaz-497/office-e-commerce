import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { AdminSessionError } from "@/domain/errors";
import { MAX_UPLOAD_BYTES, MIME_FOR_FORMAT, checkImage } from "@/domain/catalogue/image-rules";
import { detectFormat, isAnimated, readDimensions } from "@/infrastructure/storage/image-header";
import { storeUpload } from "@/infrastructure/storage/uploads";
import { UPLOAD_URL_PREFIX } from "@/infrastructure/storage/upload-name";

export const runtime = "nodejs";

/** 2 MB of file plus 64 KB for the multipart framing around it. */
const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 64 * 1024;
const FORMATS = ["JPEG", "PNG", "WebP"];

type UploadError =
  | "unauthorized"
  | "forbidden"
  | "lengthRequired"
  | "tooLarge"
  | "validation"
  | "unsupportedFormat"
  | "unreadable"
  | "animated"
  | "tooSmall"
  | "notSquare";

function refuse(status: number, error: UploadError, limit?: Record<string, unknown>) {
  return NextResponse.json(limit ? { error, limit } : { error }, { status });
}

/** Exactly one `file` entry, and it must be a file rather than a text field. */
const uploadFormSchema = z.array(z.instanceof(File)).length(1);

/**
 * Exact host equality between Origin and the host the request was addressed
 * to (research R-302): never a prefix or suffix test, so
 * tokoshopee.com.evil.example cannot pass for tokoshopee.com. The scheme is
 * not compared because nginx terminates TLS. A missing, `null` or unparsable
 * Origin fails.
 */
function originMatches(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Accepts one product image (contracts/uploads.md). The checks run cheapest
 * first and nothing touches disk until all of them pass. A route handler, not
 * a server action, so the 2 MB limit applies here alone (R-302). The database
 * is not touched: an upload is attached to a product only by saveProduct.
 */
export async function POST(request: Request) {
  try {
    await requireAdminSession();
  } catch (err) {
    if (err instanceof AdminSessionError) return refuse(401, "unauthorized");
    throw err;
  }

  if (!originMatches(request)) return refuse(403, "forbidden");

  const declaredLength = request.headers.get("content-length");
  if (declaredLength === null) return refuse(411, "lengthRequired");
  const length = Number(declaredLength);
  if (!Number.isInteger(length) || length < 0) return refuse(400, "validation");
  if (length > MAX_REQUEST_BYTES) return refuse(413, "tooLarge", { maxBytes: MAX_UPLOAD_BYTES });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, "validation");
  }
  const parsed = uploadFormSchema.safeParse(form.getAll("file"));
  if (!parsed.success) return refuse(400, "validation");
  const [file] = parsed.data;

  if (file.size > MAX_UPLOAD_BYTES) return refuse(413, "tooLarge", { maxBytes: MAX_UPLOAD_BYTES });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = detectFormat(bytes);
  if (!format || MIME_FOR_FORMAT[format] !== file.type) {
    return refuse(415, "unsupportedFormat", { formats: FORMATS });
  }

  const dimensions = readDimensions(bytes, format);
  if (!dimensions) return refuse(422, "unreadable");
  if (isAnimated(bytes, format)) return refuse(422, "animated");

  const check = checkImage({ size: bytes.byteLength, ...dimensions });
  if (!check.ok) {
    return refuse(check.rule === "tooLarge" ? 413 : 422, check.rule, check.limit);
  }

  const { name, created } = await storeUpload(bytes, format);
  return NextResponse.json(
    { url: `${UPLOAD_URL_PREFIX}${name}`, ...dimensions, orientation: "square" },
    { status: created ? 201 : 200 },
  );
}
