import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatIDR } from "@/domain/money";
import { buttonClasses } from "@/components/ui/Button";
import { checkoutHref } from "@/components/product/checkout-href";
import type { AppLocale } from "@/i18n/routing";

/**
 * Fixed to the viewport bottom below md while the page scrolls (Constitution
 * II). It shows the total for the chosen quantity, not the unit price (007
 * FR-017; audit item 9) — integer IDR, formatted only by formatIDR.
 */
export function StickyBuyBar({
  locale,
  productSlug,
  priceIDR,
  quantity,
}: {
  locale: AppLocale;
  productSlug: string;
  priceIDR: number;
  quantity: number;
}) {
  const t = useTranslations("product");

  return (
    <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-md md:hidden">
      <p className="flex flex-col">
        <span className="text-ink-3 text-xs">{t("total")}</span>
        <span className="text-ink text-lg leading-6 font-bold tabular-nums">
          {formatIDR(priceIDR * quantity)}
        </span>
      </p>
      <Link
        href={checkoutHref(locale, productSlug, quantity)}
        className={buttonClasses("primary", "lg")}
      >
        {t("buyNow")}
      </Link>
    </div>
  );
}
