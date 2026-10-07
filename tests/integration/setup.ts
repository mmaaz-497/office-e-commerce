import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Integration and concurrency tests truncate every table in beforeEach and
 * afterEach (helpers/db.ts) — that is what makes them reliable, and it is
 * also why they must never be pointed at the database the dev server serves.
 * Run against the DATABASE_URL in .env, one `npm run test:integration` silently
 * deletes the operator's real orders, stock level and settings, and the next
 * visit to /admin/dashboard shows an empty store with no error to explain it.
 *
 * So the suite picks its own database rather than inheriting one: an explicit
 * TEST_DATABASE_URL when set, otherwise the configured database name with a
 * `_test` suffix on the same server. Deriving it instead of requiring a second
 * URL in .env keeps the credentials in one place and means a fresh checkout
 * needs no extra configuration beyond creating the database:
 *
 *   createdb tokoshopee_test
 *   DATABASE_URL=postgresql://.../tokoshopee_test npx prisma migrate deploy
 *
 * The final assertion is the actual guarantee. Whatever route the URL arrived
 * by — derived here, or handed in through TEST_DATABASE_URL — a name that does
 * not end in `_test` stops the run before the first truncation rather than
 * after it, because there is no undoing the delete once it has happened.
 */
const TEST_DATABASE_SUFFIX = "_test";

function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  if (explicit) return explicit;

  const configured = process.env.DATABASE_URL?.trim();
  if (!configured) {
    throw new Error(
      "Refusing to run the test suite: neither TEST_DATABASE_URL nor DATABASE_URL is set.",
    );
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Refusing to run the test suite: DATABASE_URL is not a valid URL.");
  }

  const databaseName = url.pathname.replace(/^\//, "");
  if (!databaseName) {
    throw new Error("Refusing to run the test suite: DATABASE_URL names no database.");
  }
  if (databaseName.endsWith(TEST_DATABASE_SUFFIX)) return configured;

  url.pathname = `/${databaseName}${TEST_DATABASE_SUFFIX}`;
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");

if (!testDatabaseName.endsWith(TEST_DATABASE_SUFFIX)) {
  throw new Error(
    `Refusing to run the test suite against "${testDatabaseName}": these tests truncate ` +
      `every table, so the database name must end in "${TEST_DATABASE_SUFFIX}". ` +
      "Create one and point TEST_DATABASE_URL at it.",
  );
}

// Set before any test file imports src/config or infrastructure/db/prisma —
// both read DATABASE_URL once, at module load, and Vitest runs setupFiles
// first for exactly this kind of override.
process.env.DATABASE_URL = testDatabaseUrl;

/**
 * Upload tests write and delete files, so they must never touch the operator's
 * upload directory. Like the database above, the suite picks its own: an
 * explicit TEST_UPLOAD_DIR when set, otherwise a fresh temp directory. The
 * operator's UPLOAD_DIR from .env (already loaded by dotenv/config above) is
 * deliberately overridden rather than inherited — "only when unset" would
 * never fire on a machine whose .env has it. Must run before anything
 * imports @/config, which validates UPLOAD_DIR at load.
 */
process.env.UPLOAD_DIR =
  process.env.TEST_UPLOAD_DIR?.trim() ||
  fs.mkdtempSync(path.join(os.tmpdir(), "tokoshopee-uploads-"));
