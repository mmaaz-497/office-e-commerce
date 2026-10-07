import Image from "next/image";
import { Container } from "@/components/ui/Container";
import type { ProductImageView } from "@/infrastructure/db/catalogue";
import { HeroCarousel } from "./HeroCarousel";
import type { HeroLabels, HeroSlide } from "./hero-config";

/**
 * The homepage hero row (007 FR-011, research R-706): the art-directed carousel
 * and, from lg, one square side banner linking to the product block —
 * Tokopedia's carousel-plus-side-banner split, without cropping baked-in text.
 * The carousel's first slide stays the preloaded LCP element; the side banner
 * loads lazily.
 */
export function PromoHero({
  mobileSlides,
  desktopSlides,
  href,
  labels,
  side,
}: {
  mobileSlides: HeroSlide[];
  desktopSlides: HeroSlide[];
  href: string;
  labels: HeroLabels;
  side: { image: ProductImageView; href: string; label: string } | null;
}) {
  return (
    <div className="pt-4 lg:pt-6">
      <Container className={side ? "lg:grid lg:grid-cols-[2fr_1fr] lg:gap-4" : undefined}>
        <HeroCarousel
          mobileSlides={mobileSlides}
          desktopSlides={desktopSlides}
          href={href}
          labels={labels}
        />
        {side && (
          <a
            href={side.href}
            aria-label={side.label}
            // Exactly as tall as the carousel frame beside it: with a 2fr/1fr
            // split the frame (1740:904 at twice this width) is 1808/1740 of
            // this column's width. self-start keeps the dots row out of it.
            className="bg-surface-muted relative hidden aspect-[1740/1808] self-start overflow-hidden rounded-lg lg:block"
          >
            <Image
              src={side.image.src}
              alt={side.image.alt}
              fill
              sizes="(min-width: 1280px) 400px, 33vw"
              quality={80}
              loading="lazy"
              // Whole, not cropped: its baked-in text runs to the edges, so even
              // the ~4% a cover crop would take cuts letters.
              className="object-contain"
            />
          </a>
        )}
      </Container>
    </div>
  );
}
