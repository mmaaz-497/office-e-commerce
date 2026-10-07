// Bare "path", not "node:path": instrumentation.ts loads this module through a
// dynamic import, so Turbopack gives each external it reaches its own chunk,
// named after the specifier. "node:path" becomes `[externals]_node:path_*.js`,
// and `:` is not a legal Windows filename character, so the standalone copy in
// `next build` fails there. Same builtin either way.
import path from "path";
import { z } from "zod";

/**
 * Pure schema definition — no side effects, no process.env read. Kept
 * separate from index.ts's eager loader so tests can validate the schema
 * against fixture data without needing real secrets present, and without
 * triggering index.ts's fail-fast throw as an import side effect.
 */
export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_BASE_URL: z.string().url(),
  // Defaults closed: a staging deployment that forgets to set this stays
  // unindexed, rather than a production deployment that forgets it leaking
  // into search results (T134 — robots.txt must block staging, allow prod).
  NEXT_PUBLIC_ALLOW_INDEXING: z
    .string()
    .optional()
    .transform((v) => v ?? "false")
    .refine((v) => v === "true" || v === "false", {
      message: "NEXT_PUBLIC_ALLOW_INDEXING must be exactly 'true' or 'false'",
    })
    .transform((v) => v === "true"),
  MIDTRANS_SERVER_KEY: z.string().min(1),
  MIDTRANS_CLIENT_KEY: z.string().min(1),
  MIDTRANS_IS_PRODUCTION: z
    .string()
    .refine((v) => v === "true" || v === "false", {
      message: "MIDTRANS_IS_PRODUCTION must be exactly 'true' or 'false'",
    })
    .transform((v) => v === "true"),
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD_HASH: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  JOB_SECRET: z.string().min(16),
  // Uploaded product images. Absolute and outside the release, so a deploy
  // never touches it; created by deploy/deploy.sh, backed up by backup.sh.
  // See specs/004-catalogue-admin/research.md R-307.
  UPLOAD_DIR: z
    .string()
    .min(1)
    .refine((v) => path.isAbsolute(v), { message: "UPLOAD_DIR must be an absolute path" }),
});

export type EnvConfig = z.infer<typeof envSchema>;
