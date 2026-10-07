"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { QuantitySelector } from "@/components/product/QuantitySelector";
import { AddressFields, type AddressValue } from "@/components/checkout/AddressFields";
import { OrderSummary } from "@/components/checkout/OrderSummary";
import { SnapTrigger } from "@/components/checkout/SnapTrigger";
import { liveQuote, isCodAvailable } from "@/domain/shipping/client-quote";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";
import { submitCheckout, type CheckoutResult } from "@/app/actions/checkout";

/**
 * The product arrives as props, resolved on the server from the database
 * (contracts/checkout.md). The price here only drives the live quote; the
 * server action re-resolves the product by slug and charges its own price.
 */
export function CheckoutForm({
  locale,
  initialQuantity,
  productSlug,
  unitPriceIDR,
  midtransClientKey,
  midtransIsProduction,
}: {
  locale: AppLocale;
  initialQuantity: number;
  productSlug: string;
  /** Not rendered yet: the checkout markup is unchanged in Phase 2a. */
  productName: string;
  unitPriceIDR: number;
  midtransClientKey: string;
  midtransIsProduction: boolean;
}) {
  const t = useTranslations("checkout");
  // Server-action errorKeys are full message paths ("errors.validation"),
  // so they resolve against the root namespace, not "checkout".
  const tError = useTranslations();
  const router = useRouter();

  const [quantity, setQuantity] = useState(initialQuantity);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<AddressValue>({
    provinceCode: "",
    cityCode: "",
    district: "",
    postalCode: "",
    streetAddress: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);

  // The confirmation slug differs per language (/pesanan vs /order), so the
  // href comes from the route manifest rather than string interpolation.
  const confirmationHref = (orderNumber: string) =>
    localeHref("/pesanan/[orderNumber]", locale, { orderNumber });

  const codAvailable = address.provinceCode ? isCodAvailable(address.provinceCode) : true;

  // Selecting a COD-disabled province removes the COD option and clears the
  // COD fee (FR-010) — falls back to ONLINE automatically.
  const effectivePaymentMethod = codAvailable ? paymentMethod : "ONLINE";

  const breakdown = useMemo(() => {
    if (!address.provinceCode) return null;
    try {
      return liveQuote({
        unitPrice: unitPriceIDR,
        quantity,
        provinceCode: address.provinceCode,
        paymentMethod: effectivePaymentMethod,
      });
    } catch {
      return null;
    }
  }, [address.provinceCode, quantity, effectivePaymentMethod, unitPriceIDR]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const response = await submitCheckout({
      productSlug,
      quantity,
      name,
      phone,
      email: email || undefined,
      provinceCode: address.provinceCode,
      cityCode: address.cityCode,
      district: address.district,
      postalCode: address.postalCode,
      streetAddress: address.streetAddress,
      paymentMethod: effectivePaymentMethod,
      note: note || undefined,
    });

    setSubmitting(false);
    setResult(response);

    if (response.ok && response.paymentMethod === "COD") {
      router.push(confirmationHref(response.orderNumber));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-lg flex-col gap-4 p-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("form.name")}</span>
        <input
          required
          minLength={2}
          maxLength={100}
          className="border-brown rounded border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
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

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("form.email")}</span>
        <input
          type="email"
          className="border-brown rounded border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <AddressFields value={address} onChange={setAddress} />

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("form.quantity")}</span>
        <QuantitySelector value={quantity} onChange={setQuantity} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{t("form.paymentMethod")}</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="paymentMethod"
            checked={effectivePaymentMethod === "ONLINE"}
            onChange={() => setPaymentMethod("ONLINE")}
          />
          {t("form.paymentOnline")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="paymentMethod"
            disabled={!codAvailable}
            checked={effectivePaymentMethod === "COD"}
            onChange={() => setPaymentMethod("COD")}
          />
          {t("form.paymentCod")}
        </label>
        {!codAvailable && address.provinceCode && (
          <p className="text-sm text-red-700">{t("form.codUnavailableExplanation")}</p>
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">{t("form.note")}</span>
        <textarea
          maxLength={500}
          className="border-brown rounded border px-3 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {breakdown && <OrderSummary breakdown={breakdown} />}

      {result && !result.ok && (
        <p role="alert" className="text-sm text-red-700">
          {tError(result.errorKey, { available: result.available ?? 0 })}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !breakdown}
        className="bg-brown rounded-full px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? t("form.submitting") : t("form.submit")}
      </button>

      {result && result.ok && result.paymentMethod === "ONLINE" && result.snapToken && (
        <SnapTrigger
          token={result.snapToken}
          clientKey={midtransClientKey}
          isProduction={midtransIsProduction}
          onSuccess={() => router.push(confirmationHref(result.orderNumber))}
          onPending={() => router.push(confirmationHref(result.orderNumber))}
          onClose={() => router.push(confirmationHref(result.orderNumber))}
        />
      )}
    </form>
  );
}
