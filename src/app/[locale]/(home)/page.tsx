import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HeroPreload } from "@/components/home/HeroPreload";
import { PromoHero } from "@/components/home/PromoHero";
import { QuickAccess } from "@/components/home/QuickAccess";
import { BenefitsStrip } from "@/components/home/BenefitsStrip";
import { OrderingSteps } from "@/components/home/OrderingSteps";
import { PaymentDeliveryInfo } from "@/components/home/PaymentDeliveryInfo";
import { Faq } from "@/components/home/Faq";
import { heroSlideSets, sideBanner, type HeroSlide } from "@/components/home/hero-config";
import { quickAccessItems } from "@/components/home/quick-access-items";
import { Container } from "@/components/ui/Container";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductDetail } from "@/components/product/ProductDetail";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { productCardLabels } from "@/components/ui/product-card-labels";
import { getPublishedReviews, getReviewStats } from "@/infrastructure/db/review-stats";
import { getSoldCount } from "@/infrastructure/db/sold-count";
import { productCardState } from "@/domain/catalogue/card-state";
import { planHomeSections } from "@/domain/catalogue/home-sections";
import { storefrontDisplay } from "@/domain/catalogue/status";
import {
  getFeaturedProduct,
  getStockLevels,
  listListedProducts,
  listStorefrontCategories,
  type ProductImageView,
  type ProductView,
} from "@/infrastructure/db/catalogue";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";
import type { AppLocale } from "@/i18n/routing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("home.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/",
    title: t("title"),
    description: t("description"),
  });
}

// The catalogue sections, stock and reviews are read from the database, so
// this route must opt out of static prerendering exactly as the product page
// does (ADR-0003).
export const dynamic = "force-dynamic";

const GRID_SIZES = "(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw";
const DENSE_SIZES =
  "(min-width:1280px) 16vw, (min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw";

/**
 * The Tokopedia-structured storefront (007 contracts/storefront.md): hero row,
 * quick access, the featured product's full detail, other products on sale,
 * the Segera hadir grid, the info strip and the FAQ. Every section whose data
 * is missing renders nothing (Constitution VII).
 */
export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reviewsPage?: string }>;
}) {
  const { locale } = await params;
  const { reviewsPage } = await searchParams;
  const appLocale: AppLocale = asAppLocale(locale);
  // The catalogue (003, ADR-0004): an empty one throws here and reaches
  // error.tsx; the layout's header and footer degrade on their own.
  const [featured, products, categories] = await Promise.all([
    getFeaturedProduct(appLocale),
    listListedProducts(appLocale),
    listStorefrontCategories(appLocale),
  ]);

  // Both grids appear only from SHOWCASE_MINIMUM items, computed from this
  // render's data; the featured product is never repeated (R-708).
  const plan = planHomeSections({ products, featuredId: featured.id });

  // The featured product is the first on sale; with nothing on sale it is a
  // Coming Soon product, and every purchase element and its social proof are
  // absent rather than replaced (005 US6, R-407, R-408).
  const display = storefrontDisplay(featured);
  const [t, labels, stock, stats, reviews, soldCount] = await Promise.all([
    getTranslations(),
    productCardLabels(),
    getStockLevels(
      products.filter((product) => product.status === "ACTIVE").map((product) => product.id),
    ),
    display.showSocialProof ? getReviewStats(featured.id) : null,
    display.showSocialProof ? getPublishedReviews(Number(reviewsPage) || 1, featured.id) : null,
    display.showSocialProof ? getSoldCount(featured.id) : null,
  ]);

  // Labels are resolved here rather than in the carousel: the client provider
  // in layout.tsx ships only a whitelist of namespaces, and "home" is
  // deliberately not one of them. Alt text and sizes arrive resolved from the
  // catalogue.
  const toSlide = (image: ProductImageView, index: number): HeroSlide => ({
    src: image.src,
    alt: image.alt,
    dotLabel: t("home.hero.goToSlide", { number: index + 1 }),
    width: image.width,
    height: image.height,
  });

  // FR-010 art direction, with the desktop fallback for a product that has no
  // landscape artwork (hero-config.ts heroSlideSets, R-407).
  const slideSets = heroSlideSets(featured.images);
  const desktopSlides = slideSets.desktop.map(toSlide);
  const mobileSlides = slideSets.mobile.map(toSlide);
  const side = sideBanner(featured.images);

  const productHref = localeHref("/produk/[slug]", appLocale, { slug: featured.slug });
  const comingSoonCategory = plan.comingSoonGrid[0]?.categorySlug ?? featured.categorySlug;

  const card = (product: ProductView, sizes: string) => (
    <ProductCard
      key={product.id}
      href={localeHref("/produk/[slug]", appLocale, { slug: product.slug })}
      name={product.name}
      image={product.images[0] ?? null}
      state={productCardState(product, stock.get(product.id) ?? null)}
      labels={labels}
      sizes={sizes}
    />
  );

  return (
    <main>
      <HeroPreload mobile={mobileSlides[0]} desktop={desktopSlides[0]} />

      <PromoHero
        mobileSlides={mobileSlides}
        desktopSlides={desktopSlides}
        href={productHref}
        labels={{
          region: t("home.hero.region"),
          viewProduct: t("home.hero.viewProduct", { name: featured.name }),
          previous: t("home.hero.previous"),
          next: t("home.hero.next"),
        }}
        side={
          side && {
            image: side,
            href: "#produk",
            label: t("home.sideBanner.label", { name: featured.name }),
          }
        }
      />

      <QuickAccess
        title={t("home.quickAccess.title")}
        items={quickAccessItems({
          locale: appLocale,
          categories,
          labels: {
            featured: t("home.quickAccess.featured"),
            checkOrder: t("home.quickAccess.checkOrder"),
            howToOrder: t("home.quickAccess.howToOrder"),
            cod: t("home.quickAccess.cod"),
            writeReview: t("home.quickAccess.writeReview"),
          },
        })}
      />

      {/* The featured product's full detail (007 US1, R-701). Its name is the
          page's one h1, in the buy box. */}
      <ProductDetail
        product={featured}
        stock={stock.get(featured.id) ?? null}
        stats={stats}
        reviewsPage={reviews}
        soldCount={soldCount}
        locale={appLocale}
        basePath={localeHref("/", appLocale)}
        eagerFirstImage={false}
      />

      {plan.moreOnSale.length > 0 && (
        <section aria-labelledby="home-featured" className="py-10 lg:py-16">
          <Container>
            <SectionHeader id="home-featured" title={t("home.featured.title")} />
            <ProductGrid>{plan.moreOnSale.map((product) => card(product, GRID_SIZES))}</ProductGrid>
          </Container>
        </section>
      )}

      {plan.comingSoonGrid.length > 0 && (
        <section aria-labelledby="home-coming-soon" className="bg-surface-muted py-10 lg:py-16">
          <Container>
            <SectionHeader
              id="home-coming-soon"
              title={t("home.comingSoon.title")}
              subtitle={t("home.comingSoon.subtitle")}
              action={{
                href: localeHref("/kategori/[slug]", appLocale, { slug: comingSoonCategory }),
                label: t("home.comingSoon.viewAll"),
              }}
            />
            <ProductGrid variant="dense">
              {plan.comingSoonGrid.map((product) => card(product, DENSE_SIZES))}
            </ProductGrid>
          </Container>
        </section>
      )}

      <BenefitsStrip />

      <PaymentDeliveryInfo />

      <OrderingSteps locale={appLocale} />

      <Faq locale={appLocale} />
    </main>
  );
}
