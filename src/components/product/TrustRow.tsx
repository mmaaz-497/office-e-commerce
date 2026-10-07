import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { shippingConfig } from "@/config";
import regions from "@/data/regions.id.json";
import { codUnavailableProvinceNames } from "@/domain/shipping/delivery-facts";
import { Icon } from "@/components/ui/Icon";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";

/**
 * The buy box's trust row (007 research R-710): three facts checkout and the
 * shipping provider actually enforce — online payment through Midtrans, COD
 * per the shipping config (the same rule PaymentDeliveryInfo states), and the
 * return policy. No unverifiable store slogans (Constitution VII).
 */
export async function TrustRow({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("product.trust");
  const codEverywhere =
    codUnavailableProvinceNames(shippingConfig.codDisabledProvinces, regions.provinces).length ===
    0;

  return (
    <ul className="border-border text-ink-2 flex flex-col gap-1 border-t pt-4 text-sm">
      <li className="flex min-h-8 items-center gap-2">
        <Icon name="shield" className="text-primary h-5 w-5 shrink-0" />
        {t("online")}
      </li>
      <li className="flex min-h-8 items-center gap-2">
        <Icon name="wallet" className="text-primary h-5 w-5 shrink-0" />
        {codEverywhere ? t("codAll") : t("codSome")}
      </li>
      <li className="flex items-center gap-2">
        <Icon name="package" className="text-primary h-5 w-5 shrink-0" />
        <Link
          href={localeHref("/kebijakan-pengembalian", locale)}
          className="text-primary inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("returns")}
        </Link>
      </li>
    </ul>
  );
}
