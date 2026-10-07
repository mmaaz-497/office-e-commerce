import { z } from "zod";

/**
 * Parses the Midtrans notification body. Unknown fields are stripped by
 * default zod object behaviour, not passed through to any later step — the
 * route must not hand an unparsed body to signature verification or beyond
 * (T069a is a prerequisite of T073).
 *
 * grossAmount is kept as the raw string Midtrans sent: the signature is
 * SHA512(order_id + status_code + gross_amount + serverKey) over that exact
 * wire representation, not a re-serialised number.
 */
export const midtransNotificationSchema = z
  .object({
    order_id: z.string().min(1),
    transaction_id: z.string().min(1),
    transaction_status: z.string().min(1),
    status_code: z.string().min(1),
    gross_amount: z.string().min(1),
    fraud_status: z.string().optional(),
    payment_type: z.string().optional(),
    transaction_time: z.string().optional(),
    signature_key: z.string().min(1),
  })
  .transform((body) => ({
    orderId: body.order_id,
    transactionId: body.transaction_id,
    transactionStatus: body.transaction_status,
    statusCode: body.status_code,
    grossAmount: body.gross_amount,
    fraudStatus: body.fraud_status,
    paymentType: body.payment_type,
    transactionTime: body.transaction_time,
    signatureKey: body.signature_key,
  }));

export type MidtransNotification = z.infer<typeof midtransNotificationSchema>;
