import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/config";
import { AdminSessionError } from "@/domain/errors";

/**
 * Stateless signed session cookie (research R-010). There is exactly one
 * operator, so a session table would store at most one row; rotating
 * SESSION_SECRET is an adequate and instant "log everyone out" for that
 * scale. httpOnly/sameSite=lax/path=/admin per FR-054, FR-055.
 */
export const SESSION_COOKIE_NAME = "tokoshopee_admin_session";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function sign(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest("hex");
}

export function createSessionToken(issuedAt: number = Date.now()): string {
  const payload = String(issuedAt);
  return `${payload}.${sign(payload)}`;
}

/**
 * Pure and side-effect-free so it can back both the per-action guard (Node
 * runtime, via requireAdminSession below) and the middleware's defence-in-depth
 * check (also Node runtime here — see src/middleware.ts) with one verification
 * behaviour instead of two that could drift apart.
 */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;
  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return false;
  }

  const issuedAt = Number(payload);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < SESSION_DURATION_MS;
}

export async function issueAdminSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function hasValidAdminSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * The first statement of every admin server action and the first thing every
 * admin page reads, independent of the middleware guard (R-010, FR-055) —
 * middleware does not run for every invocation path, so a server action
 * reached directly must not depend on the matcher being right.
 */
export async function requireAdminSession(): Promise<void> {
  if (!(await hasValidAdminSession())) {
    throw new AdminSessionError();
  }
}
