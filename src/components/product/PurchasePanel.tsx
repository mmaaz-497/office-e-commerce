"use client";

import { useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { QuantitySelector } from "@/components/product/QuantitySelector";
import { SizeSelector, focusSizeGroup } from "@/components/product/SizeSelector";
import { StickyBuyBar } from "@/components/product/StickyBuyBar";
import { checkoutHref } from "@/components/product/checkout-href";
import type { AppLocale } from "@/i18n/routing";

/**
 * The one stateful slice of the product block (selected size and quantity),
 * split out so ProductDetail stays a Server Component that reads reviews,
 * sold count and stock from the database directly. Rendered only when
 * `maxQuantity > 0`.
 *
 * When the product offers sizes, both buy buttons refuse to leave without
 * one: they show the "choose a size" error and bring the picker into view.
 * Checkout and the server check the size again on their own.
 */
export function PurchasePanel({
  locale,
  productSlug,
  priceIDR,
  maxQuantity,
  sizes,
}: {
  locale: AppLocale;
  productSlug: string;
  priceIDR: number;
  maxQuantity: number;
  sizes: readonly string[];
}) {
  const t = useTranslations("product");
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState<string | null>(null);
  const [sizeMissing, setSizeMissing] = useState(false);
  const sizeGroup = useRef<HTMLFieldSetElement>(null);

  const needsSize = sizes.length > 0 && size === null;
  const href = checkoutHref(locale, productSlug, quantity, size);

  function guardSize(event: MouseEvent<HTMLAnchorElement>) {
    if (!needsSize) return;
    event.preventDefault();
    setSizeMissing(true);
    focusSizeGroup(sizeGroup.current);
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {sizes.length > 0 && (
          <SizeSelector
            ref={sizeGroup}
            name="product-size"
            sizes={sizes}
            value={size}
            onChange={(next) => {
              setSize(next);
              setSizeMissing(false);
            }}
            label={t("size.label")}
            error={sizeMissing ? t("size.required") : null}
          />
        )}
        <div className="flex items-center gap-4">
          <span className="text-ink text-sm font-semibold">{t("quantity.label")}</span>
          <QuantitySelector value={quantity} onChange={setQuantity} max={maxQuantity} />
        </div>
        <Link
          href={href}
          onClick={guardSize}
          className={buttonClasses("primary", "lg", { fullWidthMobile: true })}
        >
          {t("buyNow")}
        </Link>
      </div>

      <StickyBuyBar
        href={href}
        onBuy={guardSize}
        priceIDR={priceIDR}
        quantity={quantity}
        size={size}
      />
    </>
  );
}
