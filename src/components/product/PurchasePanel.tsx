"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { QuantitySelector } from "@/components/product/QuantitySelector";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";
import { checkoutHref } from "@/components/product/checkout-href";
import type { AppLocale } from "@/i18n/routing";

/**
 * The one stateful slice of the product block (selected quantity), split out
 * so ProductDetail stays a Server Component that reads reviews, sold count and
 * stock from the database directly. Rendered only when `maxQuantity > 0`.
 */
export function PurchasePanel({
  locale,
  productSlug,
  priceIDR,
  maxQuantity,
}: {
  locale: AppLocale;
  productSlug: string;
  priceIDR: number;
  maxQuantity: number;
}) {
  const t = useTranslations("product");
  const [quantity, setQuantity] = useState(1);

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="text-ink text-sm font-semibold">{t("quantity.label")}</span>
          <QuantitySelector value={quantity} onChange={setQuantity} max={maxQuantity} />
        </div>
        <Link
          href={checkoutHref(locale, productSlug, quantity)}
          className={buttonClasses("primary", "lg", { fullWidthMobile: true })}
        >
          {t("buyNow")}
        </Link>
      </div>

      <StickyBuyBar
        locale={locale}
        productSlug={productSlug}
        priceIDR={priceIDR}
        quantity={quantity}
      />
    </>
  );
}
