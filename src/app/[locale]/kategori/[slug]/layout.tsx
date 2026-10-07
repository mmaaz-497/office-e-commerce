import { notFound } from "next/navigation";
import { getStorefrontCategory } from "@/infrastructure/db/catalogue";
import { asAppLocale } from "@/i18n/pathnames";

/**
 * The category lookup, above the segment's loading.tsx. That file wraps the
 * page in a Suspense boundary, so a notFound() from the page alone would
 * stream the not-found UI under a 200 that was already sent; here it is a real
 * 404. The reader is cache()d, so the page's own lookup adds no query.
 */
export default async function CategoryLayout({
  params,
  children,
}: {
  params: Promise<{ locale: string; slug: string }>;
  children: React.ReactNode;
}) {
  const { locale, slug } = await params;
  if (!(await getStorefrontCategory(slug, asAppLocale(locale)))) notFound();
  return children;
}
