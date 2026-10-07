import { z } from "zod";
import { isValidOrderNumberFormat } from "@/domain/order/order-number";

/** orderNumber/phone validated identically to schemas/lookup.ts (T098a) — a
 * malformed order number must fail the same way a wrong phone would. */
const orderNumber = z.string().refine(isValidOrderNumberFormat);
const phone = z.string().min(9).max(20);

export const submitReviewInputSchema = z.object({
  orderNumber,
  phone,
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .max(1000)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  reviewerName: z.string().trim().min(2).max(60),
});
export type SubmitReviewInput = z.infer<typeof submitReviewInputSchema>;
