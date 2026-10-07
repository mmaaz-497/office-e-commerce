"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { asAppLocale, localeHref } from "@/i18n/pathnames";

/**
 * Bilingual error boundary (FR-070). It deliberately ignores the `error`
 * argument: the message, the stack and the digest all stay on the server.
 * A customer gets a sentence in their own language and a way back, never a
 * stack trace or an internal error code.
 */
export default function LocaleError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("error");
  const locale = asAppLocale(useLocale());

  return (
    <main className="mx-auto flex max-w-lg flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <p className="text-brown-dark">{t("body")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-brown rounded-full px-6 py-3 font-semibold text-white"
        >
          {t("retry")}
        </button>
        <Link href={localeHref("/", locale)} className="text-brown underline">
          {t("backToHome")}
        </Link>
      </div>
    </main>
  );
}
