/**
 * Shared between HeroCarousel and HeroPreload. These values MUST agree: the
 * preload link and the rendered <Image> only resolve to the same URL — and so
 * only warm the cache instead of downloading twice — when `sizes` and
 * `quality` match exactly (research R-002).
 */

export type HeroSlide = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** This slide's dot label, already translated and numbered server-side. */
  dotLabel: string;
};

export type HeroLabels = {
  region: string;
  viewProduct: string;
  previous: string;
  next: string;
};

/**
 * Auto-advance interval. Shared with the dot's progress fill, which is given
 * this exact duration inline — the bar is timing the slide, so a second
 * hardcoded number would eventually disagree with it (FR-011).
 */
export const HERO_ADVANCE_MS = 5500;

export const HERO_MOBILE_MEDIA = "(max-width: 767px)";
export const HERO_DESKTOP_MEDIA = "(min-width: 768px)";

export const HERO_MOBILE_SIZES = "100vw";
/**
 * 007 R-706: from lg the carousel shares its row with a side banner and takes
 * two thirds of it (about 820px inside max-w-7xl). md shows it full width.
 */
export const HERO_DESKTOP_SIZES = "(min-width: 1280px) 820px, (min-width: 1024px) 66vw, 100vw";

export const HERO_QUALITY = 80;

/** Fixed per breakpoint so slides never change height mid-scroll. */
export const HERO_MOBILE_ASPECT = "aspect-[3/4]";
export const HERO_DESKTOP_ASPECT = "aspect-[1740/904]";

/**
 * FR-010: landscape artwork on desktop, portrait or square on mobile. The two
 * sets are different banners in different numbers, not two crops of one. A
 * product with no landscape image (a Coming Soon sample featured because
 * nothing is on sale) shows its mobile set on desktop too, so the hero never
 * renders empty (005 R-407).
 */
export function heroSlideSets<T extends { orientation: "landscape" | "portrait" | "square" }>(
  images: readonly T[],
): { desktop: T[]; mobile: T[] } {
  const mobile = images.filter(
    (image) => image.orientation === "portrait" || image.orientation === "square",
  );
  const landscape = images.filter((image) => image.orientation === "landscape");
  return { desktop: landscape.length > 0 ? landscape : mobile, mobile };
}

/**
 * The side banner beside the carousel at lg (007 R-706): the first square
 * banner. A 2fr/1fr row makes the carousel about 0.52 × the row tall and a
 * square tile 0.5 ×, so the tile is near-square; PromoHero shows it whole.
 * A portrait banner would lose its headline, so none means no side tile.
 */
export function sideBanner<T extends { orientation: "landscape" | "portrait" | "square" }>(
  images: readonly T[],
): T | null {
  return images.find((image) => image.orientation === "square") ?? null;
}
