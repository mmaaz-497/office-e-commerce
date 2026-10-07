"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatIDR } from "@/domain/money";
import { lookupOrder, type LookupOrderResult } from "@/app/actions/lookup";
import { CancellationActions } from "@/components/lookup/CancellationActions";

export function LookupForm() {
  const t = useTranslations("lookup");
  const tStatus = useTranslations("orderStatus");
  const tActor = useTranslations("timelineActor");
  // errorKey already carries the "errors." prefix, so resolve it at the root.
  const tErrors = useTranslations();

  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<LookupOrderResult | null>(null);

  async function runLookup() {
    const response = await lookupOrder({ orderNumber: orderNumber.trim(), phone });
    setResult(response);
    return response;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    await runLookup();

    setSubmitting(false);
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 p-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("form.orderNumber")}</span>
          <input
            required
            className="border-brown rounded border px-3 py-2 font-mono uppercase"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("form.phone")}</span>
          <input
            required
            type="tel"
            className="border-brown rounded border px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>

        {result && !result.ok && (
          <p role="alert" className="text-sm text-red-700">
            {tErrors(result.errorKey)}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? t("form.submitting") : t("form.submit")}
        </button>
      </form>

      {result && result.ok && (
        <dl className="border-cream-dark flex flex-col gap-2 rounded-lg border p-4 text-sm">
          <div className="flex justify-between">
            <dt>{t("results.status")}</dt>
            <dd className="font-semibold">{tStatus(result.order.status)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("results.quantity")}</dt>
            <dd>{result.order.quantity}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("results.unitPrice")}</dt>
            <dd>{formatIDR(result.order.unitPriceIDR)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("results.shipping")}</dt>
            <dd>{formatIDR(result.order.shippingCostIDR)}</dd>
          </div>
          {result.order.codFeeIDR > 0 && (
            <div className="flex justify-between">
              <dt>{t("results.codFee")}</dt>
              <dd>{formatIDR(result.order.codFeeIDR)}</dd>
            </div>
          )}
          <div className="border-cream-dark text-brown-dark flex justify-between border-t pt-2 text-base font-bold">
            <dt>{t("results.total")}</dt>
            <dd>{formatIDR(result.order.totalIDR)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("results.trackingNumber")}</dt>
            <dd>{result.order.trackingNumber ?? t("results.trackingNumberPending")}</dd>
          </div>

          <div className="mt-2">
            <h2 className="mb-1 font-bold">{t("results.timeline")}</h2>
            <ol className="flex flex-col gap-1">
              {result.order.timeline.map((event, index) => (
                <li key={index}>
                  {event.createdAt.toLocaleString()} — {tStatus(event.toStatus)} (
                  {tActor(event.actor)})
                </li>
              ))}
            </ol>
          </div>

          <CancellationActions
            orderNumber={result.order.orderNumber}
            phone={phone}
            status={result.order.status}
            paymentMethod={result.order.paymentMethod}
            onCancelled={runLookup}
          />
        </dl>
      )}
    </div>
  );
}
