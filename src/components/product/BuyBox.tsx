import { getTranslations } from "next-intl/server";
import { productCardState } from "@/domain/catalogue/card-state";
import { maxOrderQuantity } from "@/domain/catalogue/purchase-limits";
import { storefrontDisplay } from "@/domain/catalogue/status";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Price } from "@/components/ui/Price";
import { PurchasePanel } from "@/components/product/PurchasePanel";
import { StockBadge } from "@/components/product/StockBadge";
import { TrustRow } from "@/components/product/TrustRow";
import type { ProductView } from "@/infrastructure/db/catalogue";
import type { ReviewStats } from "@/infrastructure/db/review-stats";
import type { AppLocale } from "@/i18n/routing";

/**
 * The buy box (007 contracts/storefront.md "Buy box", FR-015 to FR-020). The
 * product name is the page's one h1 (FR-027). Every number on it is stored
 * data: the rating line needs published reviews, the sold line a non-null
 * count, the discount a compare-at price above the price (Constitution VII).
 * A Coming Soon product shows its badge, name and highlights, nothing else.
 */
export async function BuyBox({
  product,
  stock,
  stats,
  soldCount,
  locale,
}: {
  product: ProductView;
  stock: number | null;
  stats: ReviewStats | null;
  soldCount: number | null;
  locale: AppLocale;
}) {
  const t = await getTranslations();
  const display = storefrontDisplay(product);
  const state = productCardState(product, stock);
  const maxQuantity = stock === null ? 0 : maxOrderQuantity(stock);
  const ratingCount = stats?.count ?? 0;
  const average = ratingCount > 0 ? (stats?.average ?? null) : null;
  const rated = average !== null;

  return (
    <div className="flex flex-col gap-4">
      {(display.comingSoon || (state.kind === "active" && state.discountPercent !== null)) && (
        <div className="flex flex-wrap gap-2">
          {display.comingSoon && <Badge variant="neutral">{t("product.comingSoon.badge")}</Badge>}
          {state.kind === "active" && state.discountPercent !== null && (
            <Badge variant="sale">{t("card.discount", { n: state.discountPercent })}</Badge>
          )}
        </div>
      )}

      <h1 className="text-ink text-2xl leading-8 font-bold text-balance lg:text-[32px] lg:leading-10">
        {product.name}
      </h1>

      {(rated || soldCount !== null) && (
        <p className="text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {rated && (
            <a href="#ulasan" className="hover:text-ink inline-flex min-h-11 items-center gap-1">
              <Icon name="star" className="text-accent h-4 w-4" />
              <span className="text-ink font-semibold tabular-nums">{average.toFixed(1)}</span>
              <span>{t("product.ratingLine", { count: ratingCount })}</span>
            </a>
          )}
          {rated && soldCount !== null && <span aria-hidden>·</span>}
          {soldCount !== null && <span>{t("product.sold", { count: soldCount })}</span>}
        </p>
      )}

      {display.showPrice && state.kind === "active" && (
        <div className="bg-surface-muted flex flex-col gap-2 rounded-lg p-4">
          <Price
            amountIDR={state.priceIDR}
            compareAtIDR={state.compareAtPriceIDR}
            compareAtSrLabel={t("card.compareAtSr")}
            size="lg"
          />
          <div>
            <StockBadge stock={stock} />
          </div>
        </div>
      )}

      {product.highlights.length > 0 && (
        <ul className="text-ink-2 flex flex-col gap-2 text-base">
          {product.highlights.map((highlight) => (
            <li key={highlight} className="flex items-start gap-2">
              <Icon name="check" className="text-success mt-0.5 h-5 w-5 shrink-0" />
              {highlight}
            </li>
          ))}
        </ul>
      )}

      {display.showPurchase && product.priceIDR !== null && maxQuantity > 0 && (
        <PurchasePanel
          locale={locale}
          productSlug={product.slug}
          priceIDR={product.priceIDR}
          maxQuantity={maxQuantity}
        />
      )}

      {display.showPurchase && <TrustRow locale={locale} />}
    </div>
  );
}
