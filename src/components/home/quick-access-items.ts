import type { IconName } from "@/components/ui/Icon";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";
import type { StorefrontCategory } from "@/infrastructure/db/catalogue";

/**
 * The homepage quick-access tiles (007 FR-012, research R-709), in order:
 * each storefront category, then the shortcuts. Every target is real — a
 * category page, an anchor on the homepage, or a routed page — so no tile is a
 * dead end (SC-003). Pure so the hrefs are testable without rendering.
 */
export interface QuickAccessItem {
  href: string;
  label: string;
  icon: IconName;
}

export function quickAccessItems({
  locale,
  categories,
  labels,
}: {
  locale: AppLocale;
  categories: readonly StorefrontCategory[];
  labels: {
    featured: string;
    checkOrder: string;
    howToOrder: string;
    cod: string;
    writeReview: string;
  };
}): QuickAccessItem[] {
  return [
    ...categories.map((category): QuickAccessItem => ({
      href: localeHref("/kategori/[slug]", locale, { slug: category.slug }),
      label: category.name,
      icon: "grid",
    })),
    { href: "#produk", label: labels.featured, icon: "star" },
    { href: localeHref("/cek-pesanan", locale), label: labels.checkOrder, icon: "receipt" },
    { href: localeHref("/cara-pemesanan", locale), label: labels.howToOrder, icon: "cart" },
    { href: "#pembayaran", label: labels.cod, icon: "wallet" },
    { href: localeHref("/ulasan", locale), label: labels.writeReview, icon: "pencil" },
  ];
}
