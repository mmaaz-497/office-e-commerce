import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";
import { getFeaturedProduct } from "@/infrastructure/db/catalogue";

/**
 * Reachable by order number alone in the URL, so it deliberately shows ONLY
 * the order number, next steps and a link to lookup — never address, totals
 * or status. Full detail requires order number plus phone (FR-038).
 *
 * index: false — this URL contains a real customer's order number and is
 * only ever reached via a link handed to that specific customer. It still
 * needs the full metadata contract (FR-071 says "every public page"), it
 * just must never be crawled or listed in the sitemap.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}): Promise<Metadata> {
  const { locale, orderNumber } = await params;
  const t = await getTranslations("confirmation.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/pesanan/[orderNumber]",
    params: { orderNumber },
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; orderNumber: string }>;
}) {
  const { locale, orderNumber } = await params;
  const t = await getTranslations("confirmation");
  // The catalogue is the source of the featured slug (003); an empty catalogue
  // reaches error.tsx rather than rendering a broken link.
  const featured = await getFeaturedProduct(asAppLocale(locale));

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <p className="text-brown font-mono text-xl font-semibold">{orderNumber}</p>
      <p className="text-brown-dark">{t("nextSteps")}</p>
      <Link
        href={localeHref("/cek-pesanan", asAppLocale(locale))}
        className="bg-brown rounded-full px-6 py-3 text-white"
      >
        {t("lookupLink")}
      </Link>
      {/* R-410, FR-034: this page shows no product details, because it is
          reachable with the order number alone; the ordered product belongs in
          the phone-checked lookup. The way back into the shop is the featured
          product, the first on sale and never DRAFT (R-407, T032), not the
          site root, which is the homepage (FR-003). */}
      <Link
        href={localeHref("/produk/[slug]", asAppLocale(locale), { slug: featured.slug })}
        className="text-brown underline"
      >
        {t("continueShopping")}
      </Link>
    </main>
  );
}
