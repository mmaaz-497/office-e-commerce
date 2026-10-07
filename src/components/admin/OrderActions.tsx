"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  confirmCodOrder,
  markShipped,
  markCompleted,
  markReturned,
  cancelOrder,
} from "@/app/actions/admin/fulfilment";
import { recheckPaymentStatus } from "@/app/actions/admin/recheck-payment";
import { resolveCancellation } from "@/app/actions/admin/resolve-cancellation";
import type { AdminAction, PaymentMethod } from "@/domain/order/status";

type Labels = {
  confirmCod: string;
  markShipped: string;
  trackingNumberPlaceholder: string;
  markCompleted: string;
  markReturned: string;
  cancel: string;
  refundReferencePlaceholder: string;
  recheckPayment: string;
  approveCancellation: string;
  rejectCancellation: string;
  submitting: string;
};

/** Only ever offers the actions allowedAdminActions returned for this order's
 * current status (FR-061) — the server independently refuses anything else.
 * APPROVE_CANCELLATION/REJECT_CANCELLATION are additionally gated on an
 * actual open CancellationRequest existing — allowedAdminActions only knows
 * the order's status, not whether a request was ever filed. */
export function OrderActions({
  orderNumber,
  paymentMethod,
  allowedActions,
  hasOpenCancellationRequest,
  labels,
  errorMessages,
}: {
  orderNumber: string;
  paymentMethod: PaymentMethod;
  allowedActions: AdminAction[];
  hasOpenCancellationRequest: boolean;
  labels: Labels;
  errorMessages: Record<string, string>;
}) {
  const router = useRouter();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [refundReference, setRefundReference] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: boolean; errorKey?: string }>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok && result.errorKey) {
      setError(errorMessages[result.errorKey] ?? result.errorKey);
      return;
    }
    router.refresh();
  }

  const has = (action: AdminAction) => allowedActions.includes(action);

  return (
    <section className="flex flex-col gap-3">
      {error && <p className="text-sm text-red-700">{error}</p>}

      {has("CONFIRM_COD") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => confirmCodOrder({ orderNumber }))}
          className="bg-brown rounded px-4 py-2 text-white disabled:opacity-50"
        >
          {labels.confirmCod}
        </button>
      )}

      {has("MARK_SHIPPED") && (
        <div className="flex gap-2">
          <input
            className="border-brown flex-1 rounded border px-3 py-2"
            placeholder={labels.trackingNumberPlaceholder}
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
          />
          <button
            type="button"
            disabled={pending || !trackingNumber.trim()}
            onClick={() => run(() => markShipped({ orderNumber, trackingNumber }))}
            className="bg-brown rounded px-4 py-2 text-white disabled:opacity-50"
          >
            {labels.markShipped}
          </button>
        </div>
      )}

      {has("MARK_COMPLETED") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => markCompleted({ orderNumber }))}
          className="bg-brown rounded px-4 py-2 text-white disabled:opacity-50"
        >
          {labels.markCompleted}
        </button>
      )}

      {has("MARK_RETURNED") && (
        <div className="flex gap-2">
          <input
            className="border-brown flex-1 rounded border px-3 py-2"
            placeholder={labels.refundReferencePlaceholder}
            value={refundReference}
            onChange={(e) => setRefundReference(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() =>
                markReturned({ orderNumber, refundReference: refundReference || undefined }),
              )
            }
            className="bg-brown rounded px-4 py-2 text-white disabled:opacity-50"
          >
            {labels.markReturned}
          </button>
        </div>
      )}

      {has("CANCEL") && (
        <div className="flex gap-2">
          <input
            className="border-brown flex-1 rounded border px-3 py-2"
            placeholder={labels.refundReferencePlaceholder}
            value={refundReference}
            onChange={(e) => setRefundReference(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => cancelOrder({ orderNumber, refundReference: refundReference || undefined }))
            }
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {labels.cancel}
          </button>
        </div>
      )}

      {hasOpenCancellationRequest && has("APPROVE_CANCELLATION") && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resolveCancellation({ orderNumber, approve: true }))}
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {labels.approveCancellation}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resolveCancellation({ orderNumber, approve: false }))}
            className="border-brown text-brown rounded border px-4 py-2 disabled:opacity-50"
          >
            {labels.rejectCancellation}
          </button>
        </div>
      )}

      {/* A COD order has no payment session at the provider, so re-checking
          one asks Midtrans about an order it has never seen — which comes
          back an error, not "not paid yet". The button belongs only to the
          online path it reconciles (ADR-0002 reconciliation point 2). */}
      {paymentMethod === "ONLINE" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => recheckPaymentStatus({ orderNumber }))}
          className="border-brown text-brown rounded border px-4 py-2 disabled:opacity-50"
        >
          {labels.recheckPayment}
        </button>
      )}
    </section>
  );
}
