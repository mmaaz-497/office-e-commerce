import { vi } from "vitest";

/**
 * A controllable PaymentProvider double. Only used by tests whose code path
 * calls createCheckoutSession or fetchTransactionStatus (real network calls
 * against Midtrans) — webhook-only tests use the REAL MidtransProvider
 * instead, since verifyNotificationSignature is pure crypto with no network
 * call, and exercising the real signature computation is the point.
 */
export function makeMockPaymentProvider() {
  return {
    createCheckoutSession: vi.fn().mockResolvedValue({
      token: "mock-snap-token",
      redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/mock",
    }),
    verifyNotificationSignature: vi.fn().mockReturnValue(true),
    fetchTransactionStatus: vi.fn().mockResolvedValue("PAYMENT_PENDING"),
  };
}
