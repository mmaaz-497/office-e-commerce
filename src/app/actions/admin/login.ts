"use server";

import bcrypt from "bcrypt";
import { env } from "@/config";
import { checkRateLimit } from "@/infrastructure/rate-limit/pg-rate-limiter";
import { issueAdminSession, clearAdminSession } from "@/infrastructure/auth/session";
import { getClientIdentifier } from "@/infrastructure/http/client-identifier";
import { loginInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type LoginResult = { ok: true } | { ok: false; errorKey: string };

const LOGIN_RATE_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

// A syntactically valid bcrypt hash with no matching plaintext, compared
// against on every failed-username attempt so the compare's timing is
// identical whether or not the username matched — a failed login must never
// reveal whether the username exists (FR-056).
const DUMMY_HASH = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8i8OWaXFVHNqiuA5CztsY1MZfxOF9O";

export async function login(rawInput: unknown): Promise<LoginResult> {
  try {
    await checkRateLimit({
      bucket: "ADMIN_LOGIN",
      identifierRaw: await getClientIdentifier(),
      limit: LOGIN_RATE_LIMIT,
      windowMs: LOGIN_WINDOW_MS,
    });
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = loginInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: "errors.validation" };
  }
  const { username, password } = parsed.data;

  const usernameMatches = username === env.ADMIN_USERNAME;
  const hashToCompare = usernameMatches ? env.ADMIN_PASSWORD_HASH : DUMMY_HASH;
  const passwordMatches = await bcrypt.compare(password, hashToCompare);

  if (!usernameMatches || !passwordMatches) {
    return { ok: false, errorKey: "errors.invalidCredentials" };
  }

  await issueAdminSession();
  return { ok: true };
}

export async function logout(): Promise<void> {
  await clearAdminSession();
}
