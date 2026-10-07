import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { productCardState } from "@/domain/catalogue/card-state";
import { Container } from "@/components/ui/Container";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { productCardLabels } from "@/components/ui/product-card-labels";
import {
  getStockLevels,
  getStorefrontCategory,
  listListedProducts,
} from "@/infrastructure/db/catalogue";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const appLocale = asAppLocale(locale);
  const category = await getStorefrontCategory(slug, appLocale);
  if (!category) notFound();

  const t = await getTranslations("category");
  return routeMetadata({
    locale: appLocale,
    internal: "/kategori/[slug]",
    params: { slug },
    title: t("metadata.title", { name: category.name }),
    description: t("metadata.description", { name: category.name }),
  });
}

// Stock and the listed products change without a deploy: never prerender a
// build-time snapshot of this page.
export const dynamic = "force-dynamic";

const CARD_SIZES = "(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw";

/**
 * A category's listed products (contracts/storefront.md §/kategori/[slug]).
 * An unknown, DRAFT-only or empty category is a 404, through the same
 * storefront category reader the header and footer list.
 */
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const appLocale = asAppLocale(locale);

  const category = await getStorefrontCategory(slug, appLocale);
  if (!category) notFound();

  const products = (await listListedProducts(appLocale)).filter(
    (product) => product.categorySlug === slug,
  );
  const [stock, labels] = await Promise.all([
    getStockLevels(
      products.filter((product) => product.status === "ACTIVE").map((product) => product.id),
    ),
    productCardLabels(),
  ]);

  return (
    <main>
      <Container>
        <h1 className="text-ink py-6 text-2xl leading-8 font-bold lg:py-10 lg:text-[32px] lg:leading-10">
          {category.name}
        </h1>
        <ProductGrid>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              href={localeHref("/produk/[slug]", appLocale, { slug: product.slug })}
              name={product.name}
              image={product.images[0] ?? null}
              state={productCardState(product, stock.get(product.id) ?? null)}
              labels={labels}
              sizes={CARD_SIZES}
            />
          ))}
        </ProductGrid>
      </Container>
    </main>
  );
}
