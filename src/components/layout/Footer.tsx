import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Wordmark";
import { STORE_CONTACT_EMAIL } from "@/config/store.config";
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
 * (research R-509). The contact email from store.config.ts is the only business
 * detail shown; legal name and address stay off until the client supplies them.
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
      <h3 className="text-footer-fg mb-3 text-sm font-semibold">{heading}</h3>
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

  // The accent rule along the top is the Design System's "highlight bar"; the
  // assurance row repeats facts shown at checkout, never business claims.
  return (
    <footer className="bg-ink text-footer-muted border-accent mt-16 border-t-4 lg:mt-24">
      <Container>
        <section aria-labelledby="footer-assurance" className="border-footer-muted/20 border-b py-8">
          <h2 id="footer-assurance" className="sr-only">
            {t("payment.title")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {PAYMENT_FACTS.map(({ key, icon }) => (
              <li key={key} className="flex items-center gap-3">
                <span className="bg-footer-fg/10 text-accent inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md">
                  <Icon name={icon} className="h-5 w-5" />
                </span>
                <span className="text-footer-fg text-sm font-medium">{t(`payment.${key}`)}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-10 pt-12 sm:grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:gap-12 lg:pt-14">
          <div className="max-w-sm sm:col-span-2 md:col-span-1">
            <Link
              href={localeHref("/", locale)}
              aria-label="Tokoshopee"
              className="inline-flex min-h-11 items-center"
            >
              <Wordmark mark tone="light" />
            </Link>
            <p className="mt-4 text-sm leading-relaxed">{t("tagline")}</p>

            <a
              href={`mailto:${STORE_CONTACT_EMAIL}`}
              aria-label={t("contactEmail", { email: STORE_CONTACT_EMAIL })}
              className="border-footer-muted/30 text-footer-fg hover:border-accent hover:text-accent mt-6 inline-flex min-h-11 max-w-full items-center gap-3 rounded-md border px-4 text-sm break-all transition-colors duration-150 ease-out"
            >
              <Icon name="mail" className="text-accent h-4 w-4 shrink-0" />
              {STORE_CONTACT_EMAIL}
            </a>
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

        <div className="border-footer-muted/20 mt-12 flex flex-col items-center justify-between gap-3 border-t py-6 text-sm sm:flex-row">
          <p className="flex min-h-11 items-center text-center">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <a
            href="#top"
            className="border-footer-muted/30 hover:border-accent hover:text-accent inline-flex min-h-11 items-center gap-2 rounded-md border px-4 transition-colors duration-150 ease-out"
          >
            {t("backToTop")}
            <Icon name="arrowRight" className="h-4 w-4 -rotate-90" />
          </a>
        </div>
      </Container>
    </footer>
  );
}
