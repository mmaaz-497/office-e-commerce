import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/config";
import type { ImageFormat } from "@/domain/catalogue/image-rules";
import { UPLOAD_URL_PREFIX, uploadNameFor, uploadNameSchema } from "./upload-name";

/**
 * Content-addressed storage for uploaded product images (research R-305,
 * R-306). UPLOAD_DIR is absolute and outside the release, created by
 * deploy.sh in production; only development creates it on demand. Files are
 * never deleted by the app (FR-018): removing an image from a product only
 * removes its row.
 */

let ensured: Promise<void> | null = null;

function ensureUploadDir(): Promise<void> {
  if (process.env.NODE_ENV === "production") return Promise.resolve();
  ensured ??= fs.promises.mkdir(env.UPLOAD_DIR, { recursive: true, mode: 0o750 }).then(() => {});
  return ensured;
}

/**
 * The absolute path for a stored name, or null. Two guards: the name must
 * pass the schema, and the resolved file must sit directly in UPLOAD_DIR —
 * the second holds even if the pattern is ever loosened.
 */
export function resolveUploadPath(name: string): string | null {
  if (!uploadNameSchema.safeParse(name).success) return null;
  const root = path.resolve(env.UPLOAD_DIR);
  const resolved = path.resolve(root, name);
  if (path.dirname(resolved) !== root) return null;
  return resolved;
}

/**
 * Writes the bytes under their content name. A temp file renamed into place
 * means a reader (or the other PM2 worker) never sees a half-written image;
 * if the name already exists the bytes are identical, so nothing is written.
 */
export async function storeUpload(
  bytes: Uint8Array,
  format: ImageFormat,
): Promise<{ name: string; created: boolean }> {
  await ensureUploadDir();
  const name = uploadNameFor(bytes, format);
  const target = resolveUploadPath(name);
  if (!target) throw new Error(`Generated upload name failed validation: ${name}`);

  if (fs.existsSync(target)) return { name, created: false };

  const temp = path.join(path.resolve(env.UPLOAD_DIR), `.tmp-${randomUUID()}`);
  try {
    await fs.promises.writeFile(temp, bytes, { mode: 0o644, flag: "wx" });
    await fs.promises.rename(temp, target);
  } catch (err) {
    await fs.promises.unlink(temp).catch(() => {});
    throw err;
  }
  return { name, created: true };
}

export async function readUpload(name: string): Promise<Buffer | null> {
  const file = resolveUploadPath(name);
  if (!file) return null;
  try {
    return await fs.promises.readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** True for an `/uploads/<name>` URL whose file is stored. */
export async function uploadExists(url: string): Promise<boolean> {
  if (!url.startsWith(UPLOAD_URL_PREFIX)) return false;
  const file = resolveUploadPath(url.slice(UPLOAD_URL_PREFIX.length));
  if (!file) return false;
  try {
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}
