import { getImageProps } from "next/image";
import {
  HERO_DESKTOP_MEDIA,
  HERO_DESKTOP_SIZES,
  HERO_MOBILE_MEDIA,
  HERO_MOBILE_SIZES,
  HERO_QUALITY,
  type HeroSlide,
} from "./hero-config";

/**
 * Preloads exactly one hero image per breakpoint (FR-030, research R-002).
 *
 * `priority` on the two first slides would emit two unconditional preloads and
 * fetch both, which is precisely the mobile cost the brief protects. `media`
 * on the link lets the browser choose, and `next/image` cannot express that
 * itself because it renders an `<img>`, not a `<picture>`.
 *
 * The srcSet comes from `getImageProps`, Next's own supported escape hatch, so
 * the preloaded URL is byte-for-byte the one `<Image>` will request. Building
 * the /_next/image URL by hand would risk warming a URL nothing asks for,
 * turning the optimisation into a second download.
 *
 * React hoists these links into <head>.
 */

function preloadAttributes(slide: HeroSlide, sizes: string) {
  const { props } = getImageProps({
    src: slide.src,
    width: slide.width,
    height: slide.height,
    sizes,
    quality: HERO_QUALITY,
    alt: "",
  });
  return { srcSet: props.srcSet, sizes: props.sizes, src: props.src };
}

export function HeroPreload({ mobile, desktop }: { mobile?: HeroSlide; desktop?: HeroSlide }) {
  const mobileImage = mobile ? preloadAttributes(mobile, HERO_MOBILE_SIZES) : null;
  const desktopImage = desktop ? preloadAttributes(desktop, HERO_DESKTOP_SIZES) : null;

  return (
    <>
      {mobileImage && (
        <link
          rel="preload"
          as="image"
          media={HERO_MOBILE_MEDIA}
          href={mobileImage.src}
          imageSrcSet={mobileImage.srcSet}
          imageSizes={mobileImage.sizes}
          fetchPriority="high"
        />
      )}
      {desktopImage && (
        <link
          rel="preload"
          as="image"
          media={HERO_DESKTOP_MEDIA}
          href={desktopImage.src}
          imageSrcSet={desktopImage.srcSet}
          imageSizes={desktopImage.sizes}
          fetchPriority="high"
        />
      )}
    </>
  );
}
