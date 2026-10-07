import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Wordmark";
import { listStorefrontCategories } from "@/infrastructure/db/catalogue";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale, InternalPathname } from "@/i18n/routing";

/**
 * The site footer (contracts/storefront.md §Footer) on the ink band. Every
 * href comes from the route manifest via localeHref, so the English links use
 * the English slugs and this footer and the sitemap cannot disagree about
 * which pages exist.
 *
 * Belanja lists the storefront categories, so with JavaScript off — when the
 * header drawer cannot open — the same links are still one scroll away
 * (research R-509). It makes no business claim: no name, address or email.
 */
const HELP_ROUTES: ReadonlyArray<{ internal: InternalPathname; messageKey: string }> = [
  { internal: "/cara-pemesanan", messageKey: "howToOrder" },
  { internal: "/kebijakan-pengembalian", messageKey: "returns" },
];

const LEGAL_ROUTES: ReadonlyArray<{ internal: InternalPathname; messageKey: string }> = [
  { internal: "/syarat-ketentuan", messageKey: "terms" },
  { internal: "/kebijakan-privasi", messageKey: "privacy" },
];

const PAYMENT_FACTS: ReadonlyArray<{ key: string; icon: IconName }> = [
  { key: "online", icon: "shield" },
  { key: "cod", icon: "wallet" },
  { key: "shipping", icon: "truck" },
];

const LINK =
  "text-footer-muted hover:text-accent inline-flex min-h-11 items-center transition-colors duration-150 ease-out";

export async function Footer({ locale }: { locale: AppLocale }) {
  const [t, categories] = await Promise.all([
    getTranslations("footer"),
    // Never throws on an empty catalogue: the footer is rendered by the layout.
    listStorefrontCategories(locale),
  ]);

  const shopLinks = [
    ...categories.map((category) => ({
      href: localeHref("/kategori/[slug]", locale, { slug: category.slug }),
      label: category.name,
    })),
    { href: localeHref("/cek-pesanan", locale), label: t("shopLinks.checkOrder") },
    { href: localeHref("/ulasan", locale), label: t("shopLinks.writeReview") },
  ];

  const column = (heading: string, items: { href: string; label: string }[]) => (
    <div>
      <h3 className="text-footer-fg mb-2 text-sm font-semibold">{heading}</h3>
      <ul className="flex flex-col text-sm">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={LINK}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <footer className="bg-ink text-footer-muted mt-16 lg:mt-24">
      <Container className="pt-12 pb-6 lg:pt-16">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:gap-12">
          <div className="max-w-sm sm:col-span-2 md:col-span-1">
            <Link
              href={localeHref("/", locale)}
              aria-label="Tokoshopee"
              className="inline-flex min-h-11 items-center"
            >
              <Wordmark tone="light" />
            </Link>
            <p className="mt-4 text-sm leading-relaxed">{t("tagline")}</p>

            <ul className="mt-6 flex flex-col gap-3">
              {PAYMENT_FACTS.map(({ key, icon }) => (
                <li key={key} className="flex items-center gap-3 text-sm">
                  <Icon name={icon} className="text-accent h-4 w-4 shrink-0" />
                  {t(`payment.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <nav aria-label={t("navLabel")} className="contents">
            {column(t("columns.shop"), shopLinks)}
            {column(
              t("columns.help"),
              HELP_ROUTES.map(({ internal, messageKey }) => ({
                href: localeHref(internal, locale),
                label: t(`links.${messageKey}`),
              })),
            )}
            {column(
              t("columns.legal"),
              LEGAL_ROUTES.map(({ internal, messageKey }) => ({
                href: localeHref(internal, locale),
                label: t(`links.${messageKey}`),
              })),
            )}
          </nav>
        </div>

        <div className="border-footer-muted/20 mt-12 flex flex-col items-center justify-between gap-2 border-t pt-4 text-sm sm:flex-row">
          <p className="flex min-h-11 items-center">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <a href="#top" className={`${LINK} gap-2`}>
            {t("backToTop")}
            <Icon name="arrowRight" className="h-4 w-4 -rotate-90" />
          </a>
        </div>
      </Container>
    </footer>
  );
}
