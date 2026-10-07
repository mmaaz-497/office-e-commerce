import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/infrastructure/db/prisma";
import { checkAndExpireOrRescue } from "@/infrastructure/db/order-transaction";
import { MidtransProvider } from "@/infrastructure/payment/midtrans-provider";
import { env } from "@/config";

const paymentProvider = new MidtransProvider();
const PURGE_AFTER_DAYS = 90;
const RATE_LIMIT_RETENTION_DAYS = 1;

/** Bearer JOB_SECRET, compared in constant time. */
function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.JOB_SECRET}`;
  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(header, "utf-8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Selects PENDING_PAYMENT orders past expiresAt and, for each, re-queries
 * the provider before deciding (checkAndExpireOrRescue — the identical
 * function T078's lazy-read path calls, so expiry behaviour is one thing,
 * not two). Also purges notification payload fields older than 90 days
 * (T075) and prunes RateLimit rows older than a day (research R-011).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const candidates = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", expiresAt: { lt: new Date() } },
    select: { orderNumber: true },
  });

  let expired = 0;
  let rescued = 0;
  let skipped = 0;

  for (const { orderNumber } of candidates) {
    const result = await checkAndExpireOrRescue(orderNumber, paymentProvider);
    switch (result.action) {
      case "expired":
        expired++;
        break;
      case "rescued":
      case "rescued-conflict":
        rescued++;
        break;
      case "skipped":
        skipped++;
        break;
      case "none":
        break;
    }
  }

  const purgeCutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const purgeResult = await prisma.processedNotification.updateMany({
    where: {
      createdAt: { lt: purgeCutoff },
      OR: [
        { grossAmount: { not: null } },
        { paymentType: { not: null } },
        { transactionTime: { not: null } },
        { signatureKey: { not: null } },
      ],
    },
    data: { grossAmount: null, paymentType: null, transactionTime: null, signatureKey: null },
  });

  const rateLimitCutoff = new Date(Date.now() - RATE_LIMIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.rateLimit.deleteMany({ where: { windowStart: { lt: rateLimitCutoff } } });

  return NextResponse.json({ expired, rescued, skipped, purged: purgeResult.count });
}
