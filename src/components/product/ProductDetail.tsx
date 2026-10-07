import { getTranslations } from "next-intl/server";
import { maxOrderQuantity } from "@/domain/catalogue/purchase-limits";
import { storefrontDisplay } from "@/domain/catalogue/status";
import { Container } from "@/components/ui/Container";
import { cx } from "@/components/ui/cx";
import { BuyBox } from "@/components/product/BuyBox";
import { ProductDescription } from "@/components/product/ProductDescription";
import { ProductGallery } from "@/components/product/ProductGallery";
import { Reviews } from "@/components/product/Reviews";
import { SpecsTable } from "@/components/product/SpecsTable";
import { galleryItems } from "@/components/product/gallery-items";
import type { ProductView } from "@/infrastructure/db/catalogue";
import type { PublishedReviewsPage, ReviewStats } from "@/infrastructure/db/review-stats";
import type { AppLocale } from "@/i18n/routing";

/**
 * The full product block (007 research R-701): gallery and buy box, then the
 * description, specifications and reviews. The homepage and the product page
 * both render this one composition, so they cannot drift (FR-021); each page
 * loads the data, because each owns its own `reviewsPage` search parameter.
 */
export async function ProductDetail({
  product,
  stock,
  stats,
  reviewsPage,
  soldCount,
  locale,
  basePath,
  eagerFirstImage,
}: {
  product: ProductView;
  stock: number | null;
  stats: ReviewStats | null;
  reviewsPage: PublishedReviewsPage | null;
  soldCount: number | null;
  locale: AppLocale;
  /** The current page's path, for review pagination. */
  basePath: string;
  /** True only where the first gallery image is the page's LCP candidate. */
  eagerFirstImage: boolean;
}) {
  const t = await getTranslations("product.gallery");
  const items = galleryItems(product);
  const display = storefrontDisplay(product);
  // The sticky buy bar is fixed below md; reserve room for it only when it renders.
  const hasStickyBar =
    display.showPurchase &&
    product.priceIDR !== null &&
    stock !== null &&
    maxOrderQuantity(stock) > 0;

  let imageNumber = 0;
  const thumbLabels = items.map((item) =>
    item.kind === "video" ? t("videoThumb") : t("thumb", { number: ++imageNumber }),
  );

  return (
    <div className={cx(hasStickyBar && "pb-24 md:pb-0")}>
      <section id="produk" aria-label={product.name} className="scroll-mt-28 py-6 lg:py-10">
        <Container className="grid gap-6 md:grid-cols-2 lg:gap-10">
          <ProductGallery
            items={items}
            label={t("label")}
            thumbsLabel={t("thumbs")}
            thumbLabels={thumbLabels}
            eagerFirst={eagerFirstImage}
          />
          <BuyBox
            product={product}
            stock={stock}
            stats={stats}
            soldCount={soldCount}
            locale={locale}
          />
        </Container>
      </section>

      <Container className="flex flex-col gap-10 pb-10 lg:gap-16 lg:pb-16">
        <ProductDescription text={product.longDescription} />
        <SpecsTable specs={product.specs} />
        {stats && reviewsPage && (
          <Reviews stats={stats} page={reviewsPage} locale={locale} basePath={basePath} />
        )}
      </Container>
    </div>
  );
}
