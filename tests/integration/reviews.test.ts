import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }),
}));

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-RVW${String(orderNumberCounter).padStart(2, "0")}`;
}

const RAW_PHONE = "081234567890";
const NORMALIZED_PHONE = "+6281234567890";

/** FR-048: review eligibility and uniqueness. */
describe("review eligibility and uniqueness (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("a COMPLETED order with matching phone may submit a review", async () => {
    const { submitReview } = await import("@/app/actions/review");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COMPLETED",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
        customerName: "Sari Wulandari",
      }),
    });

    const result = await submitReview({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      rating: 5,
      comment: "Empuk banget!",
      reviewerName: "Sari W.",
    });

    expect(result.ok).toBe(true);

    const review = await prisma.review.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(review.origin).toBe("VERIFIED_PURCHASE");
    expect(review.published).toBe(false);
    expect(review.rating).toBe(5);
    expect(review.reviewerName).toBe("Sari W.");
  });

  it("a second submission for the same order is refused by the database unique constraint", async () => {
    const { submitReview } = await import("@/app/actions/review");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COMPLETED",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });
    const input = {
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      rating: 4,
      reviewerName: "Reviewer",
    };

    const first = await submitReview(input);
    expect(first.ok).toBe(true);

    const second = await submitReview(input);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.errorKey).toBe("errors.duplicateReview");

    const reviews = await prisma.review.findMany({ where: { orderId: order.id } });
    expect(reviews).toHaveLength(1);
  });

  it("a non-COMPLETED order does not qualify", async () => {
    const { submitReview } = await import("@/app/actions/review");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "SHIPPED",
        trackingNumber: "X",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await submitReview({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      rating: 5,
      reviewerName: "Reviewer",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.reviewNotEligible");

    const reviews = await prisma.review.findMany({ where: { orderId: order.id } });
    expect(reviews).toHaveLength(0);
  });

  it("a RETURNED order does not qualify, even though it once reached COMPLETED", async () => {
    const { submitReview } = await import("@/app/actions/review");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "RETURNED",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await submitReview({
      orderNumber: order.orderNumber,
      phone: RAW_PHONE,
      rating: 5,
      reviewerName: "Reviewer",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.reviewNotEligible");
  });

  it("a wrong phone produces the same generic failure as an unknown order", async () => {
    const { submitReview } = await import("@/app/actions/review");
    const order = await prisma.order.create({
      data: testOrderData({
        orderNumber: validOrderNumber(),
        status: "COMPLETED",
        phone: RAW_PHONE,
        phoneNormalized: NORMALIZED_PHONE,
      }),
    });

    const result = await submitReview({
      orderNumber: order.orderNumber,
      phone: "089999999999",
      rating: 5,
      reviewerName: "Reviewer",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.orderLookupFailed");
  });
});
