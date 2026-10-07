import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { storefrontDisplay } from "@/domain/catalogue/status";
import { ProductDetail } from "@/components/product/ProductDetail";
import { getReviewStats, getPublishedReviews } from "@/infrastructure/db/review-stats";
import { getSoldCount } from "@/infrastructure/db/sold-count";
import { getListedProductBySlug, getStockLevels } from "@/infrastructure/db/catalogue";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const appLocale = asAppLocale(locale);
  const product = await getListedProductBySlug(slug, appLocale);
  // An unknown or DRAFT slug renders notFound() below; its metadata only needs
  // to be well-formed, never to describe a product that is not there.
  if (!product) return { title: "Tokoshopee" };
  // The SEO texts are catalogue data since 003 (imported from the former
  // product.metadata messages, so the titles shipped today are unchanged).
  // A Coming Soon page is reachable but noindex (005 FR-037).
  return routeMetadata({
    locale: appLocale,
    internal: "/produk/[slug]",
    params: { slug },
    title: product.seoTitle ?? product.name,
    description: product.seoDescription ?? product.shortDescription,
    index: storefrontDisplay(product).indexable,
  });
}

// Reviews and the sold count come from the database and change independently
// of any deploy — this route must never be statically prerendered with a
// build-time snapshot baked into the shipped HTML (ADR-0003).
export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ reviewsPage?: string }>;
}) {
  const { locale, slug } = await params;
  const { reviewsPage } = await searchParams;
  const appLocale = asAppLocale(locale);

  const item = await getListedProductBySlug(slug, appLocale);
  if (!item) notFound();

  // One set of flags for the whole page (005 R-408): a Coming Soon product
  // shows its badge and none of the price, purchase or social proof, whatever
  // price is stored — so their queries are not run either.
  const display = storefrontDisplay(item);
  const [stock, stats, reviewsPageData, soldCount] = await Promise.all([
    display.showPurchase ? getStockLevels([item.id]) : null,
    display.showSocialProof ? getReviewStats(item.id) : null,
    display.showSocialProof ? getPublishedReviews(Number(reviewsPage) || 1, item.id) : null,
    display.showSocialProof ? getSoldCount(item.id) : null,
  ]);

  // The same block the homepage renders (007 FR-021, R-701). Here the first
  // gallery image is the LCP candidate, so it loads eagerly.
  return (
    <main>
      <ProductDetail
        product={item}
        stock={stock?.get(item.id) ?? null}
        stats={stats}
        reviewsPage={reviewsPageData}
        soldCount={soldCount}
        locale={appLocale}
        basePath={localeHref("/produk/[slug]", appLocale, { slug: item.slug })}
        eagerFirstImage
      />
    </main>
  );
}
