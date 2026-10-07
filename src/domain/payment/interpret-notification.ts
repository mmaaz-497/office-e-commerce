import type { NotificationOutcome } from "./provider";

export type { NotificationOutcome } from "./provider";

/**
 * Success requires statusCode '200', transactionStatus settlement|capture,
 * and — only when fraud_status is present — fraud_status accept. This is the
 * rule in Midtrans's HTTP notification docs (research R-007): "if
 * `fraud_status` exists ensure the value is `accept`". Low-risk methods such
 * as Indomaret and Alfamart are not screened and send no fraud_status at all.
 *
 * Midtrans sends both statuses in lower case ("settlement", "accept"); they
 * are compared case-insensitively so neither casing is mistaken for a
 * non-match. A settlement carrying fraud_status challenge is deliberately
 * NOT success — it maps to PENDING, since Midtrans's fraud system is asking
 * for manual review, not reporting failure.
 */
export function interpretNotification(payload: {
  transactionStatus: string;
  fraudStatus?: string;
  statusCode: string;
}): NotificationOutcome {
  const transactionStatus = payload.transactionStatus.toLowerCase();
  const fraudStatus = payload.fraudStatus?.toLowerCase();
  const { statusCode } = payload;

  const isSettlementLike = transactionStatus === "settlement" || transactionStatus === "capture";
  const fraudAccepted = fraudStatus === undefined || fraudStatus === "accept";

  if (isSettlementLike && statusCode === "200" && fraudAccepted) {
    return "PAYMENT_SUCCESS";
  }

  switch (transactionStatus) {
    case "settlement":
    case "capture":
      // The success check above failed — most commonly a fraud_status of
      // challenge, awaiting manual fraud review.
      return "PAYMENT_PENDING";
    case "pending":
      return "PAYMENT_PENDING";
    case "deny":
    case "cancel":
    case "failure":
      return "PAYMENT_FAILED";
    case "expire":
      return "PAYMENT_EXPIRED";
    default:
      // refund, partial_refund, authorize and any future status: refunds are
      // performed manually by the owner outside the store (FR-060, Resolved
      // Questions) — nothing for this interpreter to act on.
      return "IGNORE";
  }
}
