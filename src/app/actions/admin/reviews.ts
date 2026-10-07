"use server";

import { prisma } from "@/infrastructure/db/prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { getLegacyProductId } from "@/infrastructure/db/catalogue";
import { moderateReviewInputSchema, addOwnerReviewInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type AdminReviewResult = { ok: true } | { ok: false; errorKey: string };

/** Approve, unpublish and delete — origin is never touched here (FR-050). */
export async function moderateReview(rawInput: unknown): Promise<AdminReviewResult> {
  await requireAdminSession();
  const parsed = moderateReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { reviewId, action } = parsed.data;

  try {
    if (action === "APPROVE") {
      await prisma.review.update({ where: { id: reviewId }, data: { published: true } });
    } else if (action === "UNPUBLISH") {
      await prisma.review.update({ where: { id: reviewId }, data: { published: false } });
    } else {
      await prisma.review.delete({ where: { id: reviewId } });
    }
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

/**
 * A historical review the owner collected offline. Origin is set explicitly
 * to OWNER_ENTERED here — never inferred from orderId being null elsewhere
 * (FR-051) — and published immediately, since the owner has already vetted
 * it before entering it.
 */
export async function addOwnerReview(rawInput: unknown): Promise<AdminReviewResult> {
  await requireAdminSession();
  const parsed = addOwnerReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { rating, comment, reviewerName, reviewedAt } = parsed.data;

  try {
    await prisma.review.create({
      data: {
        orderId: null,
        // Until the 2b per-product admin, owner reviews are about the legacy
        // product (003 US4).
        productId: await getLegacyProductId(),
        origin: "OWNER_ENTERED",
        rating,
        comment,
        reviewerName,
        published: true,
        reviewedAt,
      },
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
