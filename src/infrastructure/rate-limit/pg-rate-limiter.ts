import { createHash } from "node:crypto";
import { prisma } from "../db/prisma";
import { RateLimitedError } from "@/domain/errors";

export type RateLimitBucket = "ADMIN_LOGIN" | "ORDER_LOOKUP" | "REVIEW_SUBMIT";

/**
 * The identifier is stored hashed so the table is not a plain log of
 * visitor addresses (data-model.md).
 */
export function hashIdentifier(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Fixed-window counter, upserted on (bucket, identifier, windowStart), correct
 * across every PM2 worker process — an in-memory counter would be per-process
 * and silently allow N x worker-count attempts through (research R-011).
 *
 * Throws RateLimitedError once the window's count exceeds `limit`. The
 * window boundary is computed deterministically from the clock, not from
 * "first request in window", so concurrent first requests in a new window
 * still land in the same window row instead of each starting their own.
 */
export async function checkRateLimit(args: {
  bucket: RateLimitBucket;
  identifierRaw: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const { bucket, identifierRaw, limit, windowMs } = args;
  const identifier = hashIdentifier(identifierRaw);
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const result = await prisma.rateLimit.upsert({
    where: {
      bucket_identifier_windowStart: { bucket, identifier, windowStart },
    },
    create: { bucket, identifier, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (result.count > limit) {
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000),
    );
    throw new RateLimitedError(retryAfterSeconds);
  }
}
