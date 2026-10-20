import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { productCardState } from "@/domain/catalogue/card-state";
import {
  DEFAULT_PRODUCT_SORT,
  PRODUCT_SORTS,
  paginate,
  parseProductListingQuery,
  sortListedProducts,
  type ProductSort,
} from "@/domain/catalogue/product-listing";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { productCardLabels } from "@/components/ui/product-card-labels";
import { getStockLevels, listListedProducts } from "@/infrastructure/db/catalogue";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

/**
 * Every listed product (ACTIVE and COMING_SOON) with sort and pagination. In
 * the (list) group so its loading.tsx is not the product page's boundary too.
 * DRAFT is never listed, so never here. The canonical URL carries no sort or
 * page, so the variants never compete with the page itself in search.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("allProducts.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/produk",
    title: t("title"),
    description: t("description"),
  });
}

// The listed products and stock change without a deploy: never prerender.
export const dynamic = "force-dynamic";

const CARD_SIZES = "(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw";

const SORT_LABEL_KEY = {
  newest: "newest",
  "price-asc": "priceAsc",
  "price-desc": "priceDesc",
} as const satisfies Record<ProductSort, string>;

// Option chips (CLAUDE.md §Input): selected = primary border on primary-soft.
const SORT_LINK =
  "inline-flex h-11 items-center rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-ink-2 transition-colors duration-150 ease-out hover:border-ink-3 hover:text-ink aria-[current=true]:border-2 aria-[current=true]:border-primary aria-[current=true]:bg-primary-soft aria-[current=true]:px-[11px] aria-[current=true]:font-semibold aria-[current=true]:text-primary";

export default async function AllProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sort?: string | string[]; page?: string | string[] }>;
}) {
  const { locale } = await params;
  const appLocale = asAppLocale(locale);
  const { sort, page } = parseProductListingQuery(await searchParams);

  // A page past the last shows the last page (paginate).
  const listing = paginate(sortListedProducts(await listListedProducts(appLocale), sort), page);

  const [t, stock, labels] = await Promise.all([
    getTranslations("allProducts"),
    getStockLevels(
      listing.items.filter((product) => product.status === "ACTIVE").map((product) => product.id),
    ),
    productCardLabels(),
  ]);

  const base = localeHref("/produk", appLocale);
  const hrefFor = (next: { sort: ProductSort; page: number }) => {
    const query = new URLSearchParams();
    if (next.sort !== DEFAULT_PRODUCT_SORT) query.set("sort", next.sort);
    if (next.page > 1) query.set("page", String(next.page));
    const search = query.toString();
    return search ? `${base}?${search}` : base;
  };

  const heading = "text-ink text-2xl leading-8 font-bold text-balance lg:text-[32px] lg:leading-10";

  return (
    <main className="pb-10 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-1 py-6 lg:py-10">
          <h1 className={heading}>{t("title")}</h1>
          {listing.total > 0 && (
            <p className="text-ink-2 text-base">{t("count", { count: listing.total })}</p>
          )}
        </div>

        {listing.total === 0 ? (
          <EmptyState
            icon="grid"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={<ButtonLink href={localeHref("/", appLocale)}>{t("emptyAction")}</ButtonLink>}
          />
        ) : (
          <>
            <nav aria-labelledby="sort-label" className="mb-6 flex flex-wrap items-center gap-2">
              <span id="sort-label" className="text-ink mr-1 text-sm font-semibold">
                {t("sortLabel")}
              </span>
              {PRODUCT_SORTS.map((option) => (
                <Link
                  key={option}
                  href={hrefFor({ sort: option, page: 1 })}
                  aria-current={option === sort ? "true" : undefined}
                  className={SORT_LINK}
                >
                  {t(`sort.${SORT_LABEL_KEY[option]}`)}
                </Link>
              ))}
            </nav>

            <ProductGrid>
              {listing.items.map((product) => (
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

            {listing.pageCount > 1 && (
              <nav
                aria-label={t("pagination.label")}
                className="mt-8 flex items-center justify-between gap-3 sm:justify-center sm:gap-6"
              >
                {listing.page > 1 ? (
                  <ButtonLink
                    href={hrefFor({ sort, page: listing.page - 1 })}
                    variant="secondary"
                    rel="prev"
                  >
                    <Icon name="arrowLeft" className="h-4 w-4" />
                    {t("pagination.previous")}
                  </ButtonLink>
                ) : (
                  <span aria-hidden className="w-0 sm:hidden" />
                )}
                <p className="text-ink-2 text-sm tabular-nums">
                  {t("pagination.status", { page: listing.page, count: listing.pageCount })}
                </p>
                {listing.page < listing.pageCount ? (
                  <ButtonLink
                    href={hrefFor({ sort, page: listing.page + 1 })}
                    variant="secondary"
                    rel="next"
                  >
                    {t("pagination.next")}
                    <Icon name="arrowRight" className="h-4 w-4" />
                  </ButtonLink>
                ) : (
                  <span aria-hidden className="w-0 sm:hidden" />
                )}
              </nav>
            )}
          </>
        )}
      </Container>
    </main>
  );
}
