import { HERO_DESKTOP_ASPECT, HERO_MOBILE_ASPECT } from "@/components/home/hero-config";
import { Container } from "@/components/ui/Container";
import { ProductCardSkeleton } from "@/components/ui/ProductCard";
import { ProductGrid } from "@/components/ui/ProductGrid";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * The homepage's layout without data (007 R-713): the hero row at the
 * carousel's own aspect per breakpoint (with the side tile at lg), the
 * quick-access row, the gallery and buy box, and the dense Segera hadir grid.
 * It lives in the (home) route group so it is not every nested route's
 * fallback (R-517).
 */
export default function HomeLoading() {
  return (
    <main>
      <div className="pt-4 lg:pt-6">
        <Container className="lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4">
          {/* The carousel frame: radius lg, so not the radius-md Skeleton. */}
          <div
            aria-hidden
            className={`bg-surface-muted ${HERO_MOBILE_ASPECT} w-full rounded-lg md:hidden`}
          />
          <div
            aria-hidden
            className={`bg-surface-muted ${HERO_DESKTOP_ASPECT} hidden w-full rounded-lg md:block`}
          />
          <div
            aria-hidden
            className="bg-surface-muted hidden aspect-[1740/1808] self-start rounded-lg lg:block"
          />
        </Container>
      </div>

      <div className="py-4 lg:py-6">
        <Container>
          <div className="border-border bg-surface flex gap-1 overflow-hidden rounded-lg border p-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="flex w-[84px] flex-none flex-col items-center gap-2 py-2 md:flex-1"
              >
                <Skeleton className="h-10 w-10" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </Container>
      </div>

      <div className="py-6 lg:py-10">
        <Container className="grid gap-6 md:grid-cols-2 lg:gap-10">
          <div className="flex flex-col gap-3">
            <div aria-hidden className="bg-surface-muted aspect-square w-full rounded-lg" />
            <div className="flex gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-16" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-3/4 lg:h-10" />
            <Skeleton className="h-5 w-40" />
            <div aria-hidden className="bg-surface-muted h-24 w-full rounded-lg" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-12 w-full" />
          </div>
        </Container>
      </div>

      <section className="bg-surface-muted py-10 lg:py-16">
        <Container>
          <ProductGrid variant="dense">
            <ProductCardSkeleton count={6} />
          </ProductGrid>
        </Container>
      </section>
    </main>
  );
}
