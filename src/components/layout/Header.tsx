import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher, LocaleSwitcherFallback } from "@/components/ui/LocaleSwitcher";
import { AnnouncementBar } from "@/components/layout/AnnouncementBar";
import { HeaderBar } from "@/components/layout/HeaderBar";
import { HeaderSearch, HeaderSearchFallback } from "@/components/layout/HeaderSearch";
import { storefrontDisplay } from "@/domain/catalogue/status";
import { getFeaturedProductOrNull, listStorefrontCategories } from "@/infrastructure/db/catalogue";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";

/**
 * Site header (007 contracts/storefront.md §Header): the ink utility band with
 * the help links, then the sticky bar with the search, the Beli shortcut, the
 * language switcher, the category row and the mobile drawer.
 *
 * Every href comes from the route manifest via localeHref, so the English
 * visitor gets the English slugs (/en/category/…, /en/check-order). The
 * categories are the storefront reader's: only those with a listed product.
 * Nothing here may throw — this header is rendered by the [locale] layout,
 * whose errors that segment's error.tsx cannot catch — so the featured
 * product comes from the never-throwing reader, and "Beli" simply does not
 * render when nothing is on sale.
 */
export async function Header({ locale }: { locale: AppLocale }) {
  const [t, tSearch, categories, featured] = await Promise.all([
    getTranslations("home"),
    getTranslations("search"),
    listStorefrontCategories(locale),
    getFeaturedProductOrNull(locale),
  ]);

  const checkOrder = { href: localeHref("/cek-pesanan", locale), label: t("nav.checkOrder") };
  const helpLinks = [
    { href: localeHref("/cara-pemesanan", locale), label: t("nav.howToOrder") },
    { href: localeHref("/ulasan", locale), label: t("nav.writeReview") },
  ];
  // Resolved here: neither "home" nor "search" is a client namespace.
  const searchProps = {
    action: localeHref("/cari", locale),
    labels: {
      label: tSearch("label"),
      placeholder: tSearch("placeholder"),
      submit: tSearch("submit"),
    },
  };
  const searchFor = (idSuffix: string) => (
    <Suspense fallback={<HeaderSearchFallback {...searchProps} idSuffix={idSuffix} />}>
      <HeaderSearch {...searchProps} idSuffix={idSuffix} />
    </Suspense>
  );

  const buy =
    featured && storefrontDisplay(featured).showPurchase
      ? { href: `${localeHref("/", locale)}#produk`, label: t("nav.buy") }
      : null;

  // A fragment, not a wrapping <header>: a sticky element only sticks within
  // its parent, so the sticky bar (HeaderBar's own <header>) must sit directly
  // in the page column, not in a box exactly as tall as itself.
  return (
    <>
      <AnnouncementBar
        message={t("announce.noAccount")}
        // Cek Pesanan is not repeated here: the sticky bar carries it from md.
        links={helpLinks}
        label={t("nav.help")}
      />
      <HeaderBar
        homeHref={localeHref("/", locale)}
        checkOrder={checkOrder}
        buy={buy}
        categories={categories.map((category) => ({
          href: localeHref("/kategori/[slug]", locale, { slug: category.slug }),
          label: category.name,
        }))}
        helpLinks={helpLinks}
        search={{ desktop: searchFor("desktop"), mobile: searchFor("mobile") }}
        labels={{
          nav: t("nav.label"),
          categories: t("nav.categories"),
          help: t("nav.help"),
          openMenu: t("nav.openMenu"),
          closeMenu: t("nav.closeMenu"),
          menuTitle: t("nav.menuTitle"),
        }}
        localeSwitcher={
          <Suspense fallback={<LocaleSwitcherFallback />}>
            <LocaleSwitcher />
          </Suspense>
        }
      />
    </>
  );
}
