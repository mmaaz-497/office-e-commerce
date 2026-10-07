"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { findOrderByCredentials } from "@/infrastructure/db/order-lookup";
import { checkRateLimit } from "@/infrastructure/rate-limit/pg-rate-limiter";
import { getClientIdentifier } from "@/infrastructure/http/client-identifier";
import {
  OrderLookupFailedError,
  ReviewNotEligibleError,
  DuplicateReviewError,
} from "@/domain/errors";
import { submitReviewInputSchema } from "./schemas/review";
import { toErrorResult } from "./result";

export type SubmitReviewResult = { ok: true } | { ok: false; errorKey: string };

const REVIEW_RATE_LIMIT = 5;
const REVIEW_WINDOW_MS = 15 * 60 * 1000;
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Verifies order number + phone and COMPLETED status, then stores an
 * unpublished, VERIFIED_PURCHASE review (FR-048, FR-049; spec A-003). A
 * second submission for the same order is refused by Review.orderId's
 * database unique constraint — a check-then-insert would leave a race window
 * a concurrent double-submit could slip through.
 */
export async function submitReview(rawInput: unknown): Promise<SubmitReviewResult> {
  try {
    await checkRateLimit({
      bucket: "REVIEW_SUBMIT",
      identifierRaw: await getClientIdentifier(),
      limit: REVIEW_RATE_LIMIT,
      windowMs: REVIEW_WINDOW_MS,
    });
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = submitReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }
  const { orderNumber, phone, rating, comment, reviewerName } = parsed.data;

  const order = await findOrderByCredentials(orderNumber, phone);
  if (!order) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }

  // A RETURNED order's current status is RETURNED, not COMPLETED, so this
  // condition alone already excludes it (FR-048).
  if (order.status !== "COMPLETED") {
    return { ok: false, errorKey: new ReviewNotEligibleError().messageKey };
  }

  try {
    await prisma.review.create({
      data: {
        orderId: order.id,
        // The review belongs to what was bought (003 US4); a pre-catalogue
        // order has none and counts for the legacy product (R-202).
        productId: order.productId,
        origin: "VERIFIED_PURCHASE",
        rating,
        comment,
        reviewerName,
        published: false,
        reviewedAt: new Date(),
      },
    });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return toErrorResult(new DuplicateReviewError());
    }
    return toErrorResult(err);
  }
}
