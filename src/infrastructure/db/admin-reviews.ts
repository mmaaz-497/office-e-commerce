import { prisma } from "./prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";

/** All reviews, published and unpublished, newest first — the moderation
 * queue needs both, unlike the public product page which only ever reads
 * published = true. */
export async function getAdminReviewList() {
  await requireAdminSession();
  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    include: { order: { select: { orderNumber: true } } },
  });
}
