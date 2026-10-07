import type { Metadata } from "next";
import { ADMIN_LOCALE } from "@/i18n/admin";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";

/**
 * The admin area sits outside the [locale] segment (deliberately
 * non-localised — spec, admin routes section) so it needs its own root
 * layout providing <html>/<body>; it cannot inherit [locale]/layout.tsx.
 */

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

export const metadata: Metadata = {
  title: "Tokoshopee Admin",
  description: "Tokoshopee admin area",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // On <html>, not <body>: --font-sans resolves var(--font-jakarta) on :root.
    <html lang={ADMIN_LOCALE} className={jakarta.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
