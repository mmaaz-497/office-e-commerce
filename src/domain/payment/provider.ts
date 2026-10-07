import type { IDR } from "../money";

export type NotificationOutcome =
  "PAYMENT_SUCCESS" | "PAYMENT_PENDING" | "PAYMENT_FAILED" | "PAYMENT_EXPIRED" | "IGNORE";

/**
 * The seam over Midtrans (ADR-0002, Principle X). No vendor SDK type appears
 * in this signature — the infrastructure layer adapts midtrans-client to it.
 */
export interface PaymentProvider {
  /** grossAmount MUST come from the order snapshot, never the live catalogue (R-006). */
  createCheckoutSession(args: {
    providerOrderId: string;
    grossAmount: IDR;
    expiryHours: number;
    customer: { name: string; phone: string; email?: string };
  }): Promise<{ token: string; redirectUrl: string }>;

  /** SHA512(order_id + status_code + gross_amount + serverKey) — verified BEFORE any read. */
  verifyNotificationSignature(payload: unknown): boolean;

  /** Authoritative re-query, used by the expiry job and the admin re-check action. */
  fetchTransactionStatus(providerOrderId: string): Promise<NotificationOutcome>;
}
