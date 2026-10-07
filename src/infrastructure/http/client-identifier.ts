import { headers } from "next/headers";

/** The rate limiter's per-source identifier (FR-041, FR-056) — shared by
 * every rate-limited server action (admin login, order lookup, review
 * submission) so "the client" means the same thing everywhere it's checked. */
export async function getClientIdentifier(): Promise<string> {
  const hdrs = await headers();
  const forwardedFor = hdrs.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? "unknown";
}
