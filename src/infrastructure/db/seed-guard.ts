/**
 * Two independent conditions guard the development seed (research R-018,
 * FR-052, SC-012, Constitution Principle VII): NODE_ENV=production, and a
 * DATABASE_URL host this project doesn't recognise as local. Either one
 * alone is sufficient to refuse — an accident needs to defeat both, not one.
 *
 * An allowlist of known-safe local hostnames, rather than a denylist of "the"
 * production host — this project has no production host configured yet, and
 * an allowlist fails closed by default: any DATABASE_URL this doesn't
 * recognise as local is refused, including a real production host nobody
 * remembered to add to a denylist.
 */
const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "db"]);

export function assertSeedAllowed(env: { NODE_ENV?: string; DATABASE_URL?: string }): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing to run development seed: NODE_ENV=production");
  }

  if (!env.DATABASE_URL) {
    throw new Error("Refusing to run development seed: DATABASE_URL is not set");
  }

  let host: string;
  try {
    host = new URL(env.DATABASE_URL).hostname;
  } catch {
    throw new Error("Refusing to run development seed: DATABASE_URL is not a valid URL");
  }

  if (!SAFE_LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run development seed: DATABASE_URL host "${host}" is not a recognised local database`,
    );
  }
}
