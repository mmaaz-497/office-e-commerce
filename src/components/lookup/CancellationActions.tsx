"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { customerCancellationRight } from "@/domain/order/cancellation";
import { cancelOrder, requestCancellation } from "@/app/actions/cancellation";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";

/** Offers exactly what customerCancellationRight allows for this order right
 * now (FR-043, FR-044, FR-045) — the server independently re-checks the same
 * right before doing anything, so this is convenience, not authorisation. */
export function CancellationActions({
  orderNumber,
  phone,
  status,
  paymentMethod,
  onCancelled,
}: {
  orderNumber: string;
  phone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  onCancelled: () => void;
}) {
  const t = useTranslations("lookup.cancellation");
  // errorKey already carries the "errors." prefix, so resolve it at the root.
  const tErrors = useTranslations();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const right = customerCancellationRight(status, paymentMethod);
  if (right === "NONE") return null;

  async function handleDirectCancel() {
    setPending(true);
    setError(null);
    const result = await cancelOrder({ orderNumber, phone });
    setPending(false);
    if (!result.ok) {
      setError(tErrors(result.errorKey));
      return;
    }
    onCancelled();
  }

  async function handleRequest() {
    setPending(true);
    setError(null);
    const result = await requestCancellation({ orderNumber, phone, reason: reason || undefined });
    setPending(false);
    if (!result.ok) {
      setError(tErrors(result.errorKey));
      return;
    }
    setRequested(true);
  }

  if (requested) {
    return <p className="mt-4 border-t pt-4 text-sm">{t("requestSubmitted")}</p>;
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-4">
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      {right === "CANCEL_DIRECTLY" && (
        <button
          type="button"
          disabled={pending}
          onClick={handleDirectCancel}
          className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {t("cancelButton")}
        </button>
      )}

      {right === "REQUEST_ONLY" && (
        <div className="flex flex-col gap-2">
          <textarea
            className="border-brown rounded border px-3 py-2"
            placeholder={t("reasonPlaceholder")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            disabled={pending}
            onClick={handleRequest}
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {t("requestButton")}
          </button>
        </div>
      )}
    </div>
  );
}
