import type { MouseEventHandler } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatIDR } from "@/domain/money";
import { buttonClasses } from "@/components/ui/Button";

/**
 * Fixed to the viewport bottom below md while the page scrolls (Constitution
 * II). It shows the total for the chosen quantity, not the unit price (007
 * FR-017; audit item 9) — integer IDR, formatted only by formatIDR — and the
 * chosen size, if any. The link and its size guard come from PurchasePanel,
 * so both buy buttons go to the same checkout and refuse the same way.
 */
export function StickyBuyBar({
  href,
  onBuy,
  priceIDR,
  quantity,
  size,
}: {
  href: string;
  onBuy: MouseEventHandler<HTMLAnchorElement>;
  priceIDR: number;
  quantity: number;
  size: string | null;
}) {
  const t = useTranslations("product");

  return (
    <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-md md:hidden">
      <p className="flex flex-col">
        <span className="text-ink-3 text-xs">
          {t("total")}
          {size !== null && <> · {t("size.selected", { size })}</>}
        </span>
        <span className="text-ink text-lg leading-6 font-bold tabular-nums">
          {formatIDR(priceIDR * quantity)}
        </span>
      </p>
      <Link href={href} onClick={onBuy} className={buttonClasses("primary", "lg")}>
        {t("buyNow")}
      </Link>
    </div>
  );
}
