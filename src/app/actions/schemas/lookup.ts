import { z } from "zod";
import { isValidOrderNumberFormat } from "@/domain/order/order-number";

/**
 * Validated before any database access (Constitution Principle IX). A
 * malformed order number must produce the exact same generic failure as a
 * correctly-formatted one with the wrong phone (FR-040) — the calling action
 * discards this schema's own message and always substitutes
 * OrderLookupFailedError's key, so schema rejection can never become an
 * oracle that distinguishes "no such order" from "wrong phone".
 */
const orderNumber = z.string().refine(isValidOrderNumberFormat);
const phone = z.string().min(9).max(20);

export const lookupOrderInputSchema = z.object({ orderNumber, phone });
export type LookupOrderInput = z.infer<typeof lookupOrderInputSchema>;

export const cancelOrderInputSchema = z.object({ orderNumber, phone });
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

export const requestCancellationInputSchema = z.object({
  orderNumber,
  phone,
  reason: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type RequestCancellationInput = z.infer<typeof requestCancellationInputSchema>;
