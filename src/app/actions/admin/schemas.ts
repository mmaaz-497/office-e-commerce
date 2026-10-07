import { z } from "zod";
import { isValidOrderNumberFormat } from "@/domain/order/order-number";
import { productInputSchema, SLUG_PATTERN } from "@/domain/catalogue/product-schema";

const orderNumber = z.string().refine(isValidOrderNumberFormat, { message: "errors.validation" });

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const loginInputSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const confirmCodOrderInputSchema = z.object({ orderNumber });
export type ConfirmCodOrderInput = z.infer<typeof confirmCodOrderInputSchema>;

export const markShippedInputSchema = z.object({
  orderNumber,
  trackingNumber: z.string().trim().min(1).max(100),
});
export type MarkShippedInput = z.infer<typeof markShippedInputSchema>;

export const markCompletedInputSchema = z.object({ orderNumber });
export type MarkCompletedInput = z.infer<typeof markCompletedInputSchema>;

export const markReturnedInputSchema = z.object({
  orderNumber,
  refundReference: optionalText(200),
});
export type MarkReturnedInput = z.infer<typeof markReturnedInputSchema>;

export const cancelOrderInputSchema = z.object({
  orderNumber,
  refundReference: optionalText(200),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

export const resolveCancellationInputSchema = z.object({
  orderNumber,
  approve: z.boolean(),
});
export type ResolveCancellationInput = z.infer<typeof resolveCancellationInputSchema>;

export const adjustStockInputSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, { message: "errors.validation" }),
  note: z.string().trim().min(1).max(500),
});
export type AdjustStockInput = z.infer<typeof adjustStockInputSchema>;

/** The inline per-product editor (research R-313); the note rule is adjustStock's. */
export const setProductStockInputSchema = z.object({
  productId: z.string().min(1),
  expectedQuantity: z.number().int().min(0),
  targetQuantity: z.number().int().min(0).max(1_000_000),
  note: adjustStockInputSchema.shape.note,
});
export type SetProductStockInput = z.infer<typeof setProductStockInputSchema>;

export const moderateReviewInputSchema = z.object({
  reviewId: z.string().min(1),
  action: z.enum(["APPROVE", "UNPUBLISH", "DELETE"]),
});
export type ModerateReviewInput = z.infer<typeof moderateReviewInputSchema>;

export const addOwnerReviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: optionalText(1000),
  reviewerName: z.string().trim().min(2).max(60),
  reviewedAt: z.coerce.date(),
});
export type AddOwnerReviewInput = z.infer<typeof addOwnerReviewInputSchema>;

export const setSoldCountBaselineInputSchema = z.object({
  baseline: z.number().int().min(0),
});
export type SetSoldCountBaselineInput = z.infer<typeof setSoldCountBaselineInputSchema>;

export const recheckPaymentStatusInputSchema = z.object({ orderNumber });
export type RecheckPaymentStatusInput = z.infer<typeof recheckPaymentStatusInputSchema>;

/**
 * saveProduct input (research R-308, contracts/admin-catalogue-actions.md).
 * Wraps the shared productInputSchema rather than extending it: zod 4 refuses
 * .extend() on a refined object, and wrapping keeps the shared schema the one
 * definition of a valid product (FR-006). An edit carries the updatedAt it
 * loaded, for the optimistic-concurrency check (FR-011).
 *
 * There is deliberately no isSample field, here or in productInputSchema, and
 * zod's default strip drops one sent anyway: only the seed sets isSample and
 * only markProductReal clears it (research R-403). confirmUnpublish is the
 * owner's answer to errors.unpublishNeedsConfirmation (R-404).
 */
export const adminProductInputSchema = z
  .object({
    productId: z.string().min(1).optional(),
    expectedUpdatedAt: z.iso.datetime().optional(),
    categoryId: z.string().min(1),
    position: z.number().int().min(0).max(9999),
    product: productInputSchema,
    confirmUnpublish: z.boolean().optional(),
  })
  .refine((input) => input.productId === undefined || input.expectedUpdatedAt !== undefined, {
    path: ["expectedUpdatedAt"],
    message: "expectedUpdatedAt is required when editing",
  });
export type AdminProductInput = z.infer<typeof adminProductInputSchema>;

/** markProductReal (Phase 2c, R-403); guarded by the updatedAt the edit page loaded. */
export const markProductRealInputSchema = z.object({
  productId: z.cuid(),
  expectedUpdatedAt: z.iso.datetime(),
});
export type MarkProductRealInput = z.infer<typeof markProductRealInputSchema>;

/** A category (spec US6); absent categoryId → create. The slug rule is a product's. */
export const saveCategoryInputSchema = z.object({
  categoryId: z.string().min(1).optional(),
  slug: z.string().min(3).max(80).regex(SLUG_PATTERN),
  nameId: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  position: z.number().int().min(0).max(9999),
});
export type SaveCategoryInput = z.infer<typeof saveCategoryInputSchema>;

/** The /admin/products/[id] segment, parsed before any query (Principle IX). */
export const adminProductIdSchema = z.string().min(1).max(64);
