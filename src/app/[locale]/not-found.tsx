import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { asAppLocale, localeHref } from "@/i18n/pathnames";

/**
 * Bilingual 404 (FR-070). Renders inside the [locale] layout, so it picks up
 * the active language and offers a route back to the product page. It shows
 * no path, no error code and no technical detail.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations("notFound");
  const locale = asAppLocale(await getLocale());

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <p className="text-brown-dark">{t("body")}</p>
      <Link href={localeHref("/", locale)} className="bg-brown rounded-full px-6 py-3 text-white">
        {t("backToHome")}
      </Link>
    </main>
  );
}
