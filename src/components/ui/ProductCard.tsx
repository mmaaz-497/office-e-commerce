import { Children, isValidElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { cardBadges, type ProductCardState } from "@/domain/catalogue/card-state";
import type { ProductImageView } from "@/infrastructure/db/catalogue";
import { Badge } from "./Badge";
import { Icon } from "./Icon";
import { Price } from "./Price";
import { Skeleton } from "./Skeleton";

/**
 * The storefront product card (contracts/ui-components.md §ProductCard). Its
 * state comes from the pure productCardState rule; this file only renders it.
 * There is no rating or sold count this phase (research R-504).
 */

export interface ProductCardLabels {
  comingSoonBadge: string;
  comingSoonPrice: string;
  outOfStock: string;
  discount: (percent: number) => string;
  compareAtSr: string;
}

export function ProductCard({
  href,
  name,
  image,
  state,
  labels,
  sizes,
}: {
  href: string;
  name: string;
  image: ProductImageView | null;
  state: ProductCardState;
  labels: ProductCardLabels;
  sizes: string;
}) {
  const badges = cardBadges(state);

  return (
    <Link
      href={href}
      className="group border-border bg-surface flex h-full flex-col rounded-md border transition-shadow duration-150 hover:shadow-sm"
    >
      <div className="bg-surface-muted relative aspect-square overflow-hidden rounded-t-md">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes={sizes}
            className={image.orientation === "square" ? "object-cover" : "object-contain"}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon name="package" className="text-ink-3 h-10 w-10" />
          </div>
        )}
        {badges.length > 0 && (
          <div className="absolute top-2 left-2 flex gap-1">
            {badges.map((badge) =>
              badge === "discount" && state.kind === "active" && state.discountPercent !== null ? (
                <Badge key={badge} variant="sale">
                  {labels.discount(state.discountPercent)}
                </Badge>
              ) : (
                <Badge key={badge} variant="neutral">
                  {badge === "comingSoon" ? labels.comingSoonBadge : labels.outOfStock}
                </Badge>
              ),
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3 md:p-4">
        <p className="text-ink line-clamp-2 text-sm md:text-base">{name}</p>
        {state.kind === "active" ? (
          <Price
            amountIDR={state.priceIDR}
            compareAtIDR={state.compareAtPriceIDR}
            compareAtSrLabel={labels.compareAtSr}
          />
        ) : (
          <p className="text-ink-3 text-sm">{labels.comingSoonPrice}</p>
        )}
      </div>
    </Link>
  );
}

/** One card-sized placeholder: 1:1 image, two title lines, a price line. */
function CardSkeleton() {
  return (
    <div aria-hidden className="border-border bg-surface flex h-full flex-col rounded-md border">
      <Skeleton className="aspect-square rounded-none rounded-t-md" />
      <div className="flex flex-col gap-2 p-3 md:p-4">
        <Skeleton className="h-5 w-full md:h-6" />
        <Skeleton className="h-5 w-2/3 md:h-6" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    </div>
  );
}

/**
 * `count` card placeholders. Inside ProductGrid or ProductRail each one gets
 * its own list item (see cardListChildren).
 */
export function ProductCardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </>
  );
}

/**
 * The children of a card list, one entry per list item: a
 * `<ProductCardSkeleton count={n} />` expands to n entries, so the skeleton
 * lays out exactly like n cards.
 */
export function cardListChildren(children: React.ReactNode): React.ReactNode[] {
  return Children.toArray(children).flatMap((child): React.ReactNode[] =>
    isValidElement<{ count?: number }>(child) && child.type === ProductCardSkeleton
      ? Array.from({ length: child.props.count ?? 1 }, (_, index) => (
          <CardSkeleton key={`${child.key}-${index}`} />
        ))
      : [child],
  );
}

export const cardListItemKey = (child: React.ReactNode, index: number): React.Key =>
  isValidElement(child) && child.key !== null ? child.key : index;
