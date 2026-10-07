import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { checkRateLimit, hashIdentifier } from "@/infrastructure/rate-limit/pg-rate-limiter";
import { RateLimitedError } from "@/domain/errors";
import { resetDb } from "./helpers/db";

describe("PostgreSQL rate limiter (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await resetDb();
  });

  it("refuses the (N+1)th attempt within a window", async () => {
    const args = {
      bucket: "ORDER_LOOKUP" as const,
      identifierRaw: "203.0.113.1",
      limit: 3,
      windowMs: 60_000,
    };

    await checkRateLimit(args);
    await checkRateLimit(args);
    await checkRateLimit(args);
    await expect(checkRateLimit(args)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("a new window resets the count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const args = {
      bucket: "ADMIN_LOGIN" as const,
      identifierRaw: "203.0.113.2",
      limit: 2,
      windowMs: 60_000,
    };

    await checkRateLimit(args);
    await checkRateLimit(args);
    await expect(checkRateLimit(args)).rejects.toBeInstanceOf(RateLimitedError);

    // Advance past the window boundary — a fresh window, fresh count.
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));

    await expect(checkRateLimit(args)).resolves.toBeUndefined();
    await expect(checkRateLimit(args)).resolves.toBeUndefined();
    await expect(checkRateLimit(args)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("two concurrent increments do not lose a count", async () => {
    const args = {
      bucket: "REVIEW_SUBMIT" as const,
      identifierRaw: "203.0.113.3",
      limit: 100, // high enough that neither concurrent call is refused
      windowMs: 60_000,
    };

    await Promise.all([checkRateLimit(args), checkRateLimit(args)]);

    const identifier = hashIdentifier(args.identifierRaw);
    const rows = await prisma.rateLimit.findMany({
      where: { bucket: args.bucket, identifier },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it("stores the identifier hashed, not as plaintext", async () => {
    const args = {
      bucket: "ORDER_LOOKUP" as const,
      identifierRaw: "198.51.100.7",
      limit: 5,
      windowMs: 60_000,
    };
    await checkRateLimit(args);

    const rows = await prisma.rateLimit.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).not.toBe(args.identifierRaw);
    expect(rows[0].identifier).toBe(hashIdentifier(args.identifierRaw));
  });
});
