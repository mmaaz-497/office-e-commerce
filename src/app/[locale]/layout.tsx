import type { Metadata } from "next";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { routing } from "@/i18n/routing";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { env } from "@/config";
import "../globals.css";

/**
 * Only namespaces actually read by client components under this layout
 * (via useTranslations) — everything else (footer/legal pages, admin) is
 * resolved server-side with getTranslations and must not be shipped to the
 * browser. Keep in sync with useTranslations(...) call sites under src/app/[locale]
 * and src/components/{product,checkout,review,lookup}.
 */
const PUBLIC_CLIENT_NAMESPACES = [
  "product",
  "checkout",
  "review",
  "errors",
  "lookup",
  "orderStatus",
  "timelineActor",
  "error",
] as const;

/**
 * The Design System's one family (research R-502): the variable font covers
 * weights 400–700, and the default adjustFontFallback size-matches the fallback
 * so the swap causes no layout shift.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Fallback only — every public route under this layout exports its own
 * generateMetadata (T122) that fully overrides this. metadataBase lets any
 * metadata field that isn't given an absolute URL resolve against the same
 * canonical origin absoluteUrl() uses, instead of a hardcoded one.
 */
export const metadata: Metadata = {
  title: "Tokoshopee",
  description: "Tokoshopee",
  metadataBase: new URL(env.NEXT_PUBLIC_BASE_URL),
};

/**
 * Every [locale] page reads the database through this layout's Header and
 * Footer (the featured product, 003). In Next 15 a Prisma call does not opt a
 * route out of prerendering, and deploy.sh builds before it migrates, so a
 * prerender would query tables that do not exist yet (research R-209,
 * ADR-0004; ADR-0003 partially superseded).
 */
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();
  const clientMessages = Object.fromEntries(
    PUBLIC_CLIENT_NAMESPACES.filter((namespace) => namespace in messages).map((namespace) => [
      namespace,
      messages[namespace],
    ]),
  );

  return (
    // The font variable sits on <html>: globals.css declares --font-sans on
    // :root from var(--font-jakarta), and a custom property resolves on the
    // element that declares it, so on <body> the font would never apply.
    <html lang={locale} className={`${jakarta.variable} scroll-smooth`}>
      <body className="antialiased">
        <NextIntlClientProvider messages={clientMessages}>
          {/* id="top" is the target the footer's "back to top" link scrolls to.
              The smooth behaviour sits on <html>, and globals.css turns it off
              under prefers-reduced-motion. */}
          <div id="top" className="flex min-h-screen flex-col">
            <Header locale={locale} />
            <div className="flex-1">{children}</div>
            <Footer locale={locale} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
