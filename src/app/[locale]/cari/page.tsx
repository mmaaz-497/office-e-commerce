import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { productCardState } from "@/domain/catalogue/card-state";
import { parseSearchQuery } from "@/domain/catalogue/search-query";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { productCardLabels } from "@/components/ui/product-card-labels";
import { getStockLevels, searchListedProducts } from "@/infrastructure/db/catalogue";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

/**
 * The search results page (007 contracts/storefront.md §GET /{locale}/cari,
 * FR-005 to FR-009). Full metadata in both languages with a canonical URL
 * without the query, never indexed (R-705), and absent from the sitemap.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("search.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/cari",
    title: t("title"),
    description: t("description"),
    index: false,
  });
}

// Results follow the live catalogue and stock: never prerender a snapshot.
export const dynamic = "force-dynamic";

const CARD_SIZES = "(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw";

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  const appLocale = asAppLocale(locale);
  // The query crosses a server boundary: trimmed, capped at 80, first value only.
  const { q, empty } = parseSearchQuery((await searchParams).q);

  const [t, products] = await Promise.all([
    getTranslations("search"),
    empty ? Promise.resolve([]) : searchListedProducts(q, appLocale),
  ]);
  const [stock, labels] = await Promise.all([
    getStockLevels(
      products.filter((product) => product.status === "ACTIVE").map((product) => product.id),
    ),
    productCardLabels(),
  ]);

  const heading = "text-ink text-2xl leading-8 font-bold text-balance lg:text-[32px] lg:leading-10";

  return (
    <main className="pb-10 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-1 py-6 lg:py-10">
          <h1 className={heading}>{empty ? t("promptTitle") : t("resultsTitle", { q })}</h1>
          {empty ? (
            <p className="text-ink-2 text-base">{t("promptBody")}</p>
          ) : (
            products.length > 0 && (
              <p className="text-ink-2 text-base">
                {t("resultsCount", { count: products.length })}
              </p>
            )
          )}
        </div>

        {!empty && products.length === 0 && (
          <EmptyState
            icon="search"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={<ButtonLink href={localeHref("/", appLocale)}>{t("emptyAction")}</ButtonLink>}
          />
        )}

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
