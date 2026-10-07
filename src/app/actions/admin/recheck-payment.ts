"use server";

import { prisma } from "@/infrastructure/db/prisma";
import { applyPaymentSuccess } from "@/infrastructure/db/order-transaction";
import { MidtransProvider } from "@/infrastructure/payment/midtrans-provider";
import { requireAdminSession } from "@/infrastructure/auth/session";
import type { NotificationOutcome } from "@/domain/payment/provider";
import { recheckPaymentStatusInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type RecheckPaymentResult =
  | { ok: true; providerOutcome: NotificationOutcome; applied: boolean }
  | { ok: false; errorKey: string };

/**
 * Re-queries the provider for one order and reconciles through the same
 * applyPaymentSuccess path the webhook and expiry job use (ADR-0002
 * reconciliation point 2) — one "a payment succeeded" behaviour, not a
 * second one bolted onto the admin panel.
 */
export async function recheckPaymentStatus(rawInput: unknown): Promise<RecheckPaymentResult> {
  await requireAdminSession();
  const parsed = recheckPaymentStatusInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber } = parsed.data;

  try {
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    const provider = new MidtransProvider();

    let outcome: NotificationOutcome;
    try {
      outcome = await provider.fetchTransactionStatus(order.midtransOrderId ?? order.orderNumber);
    } catch (err) {
      // The provider refused or could not be reached — rejected credentials,
      // an order it has never seen, or an outage. checkAndExpireOrRescue takes
      // the same line for the same reason (ADR-0002): a re-check that cannot
      // reach the provider leaves the order exactly as it was and says so,
      // rather than letting a vendor error escape the action and surface as a
      // raw runtime error in the operator's browser. The vendor message
      // carries merchant detail, so it is logged rather than returned.
      console.error(
        `Midtrans re-check failed for ${orderNumber}. ` +
          "Check MIDTRANS_SERVER_KEY/MIDTRANS_CLIENT_KEY and MIDTRANS_IS_PRODUCTION.",
        err,
      );
      return { ok: false, errorKey: "errors.paymentProviderUnreachable" };
    }

    if (outcome !== "PAYMENT_SUCCESS") {
      return { ok: true, providerOutcome: outcome, applied: false };
    }

    const result = await prisma.$transaction((tx) => applyPaymentSuccess(tx, orderNumber, "OWNER"));
    return { ok: true, providerOutcome: outcome, applied: result.kind === "APPLIED" };
  } catch (err) {
    return toErrorResult(err);
  }
}
