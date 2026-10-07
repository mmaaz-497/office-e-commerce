import { uploadNameSchema } from "@/infrastructure/storage/upload-name";
import { readUpload } from "@/infrastructure/storage/uploads";

export const runtime = "nodejs";

const CONTENT_TYPE: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const notFound = () => new Response(null, { status: 404 });

/**
 * Serves an uploaded product image (contracts/uploads.md; research R-306).
 * Public, no session. The segment is parsed with the upload-name schema
 * before anything else, so traversal attempts, dotfiles, temp files and other
 * extensions are a 404 with no file-system access. Names are content hashes,
 * so the bytes behind a URL never change and can be cached forever.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const parsed = uploadNameSchema.safeParse((await params).file);
  if (!parsed.success) return notFound();

  const bytes = await readUpload(parsed.data);
  if (!bytes) return notFound();

  const extension = parsed.data.slice(parsed.data.lastIndexOf(".") + 1);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": CONTENT_TYPE[extension],
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
