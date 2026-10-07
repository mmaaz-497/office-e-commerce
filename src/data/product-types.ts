/**
 * Shapes for src/data/product.json, which since 003 is only the IMPORT SOURCE
 * for `npm run catalogue:import` (Constitution v2.0.0 Principle III, ADR-0004).
 * The running storefront never reads it: pages and components consume
 * ProductView from src/infrastructure/db/catalogue.ts.
 */

/**
 * The asset's real aspect. The hero carousel art-directs on this rather than
 * parsing filenames: a filename is not a data model, and `orientation` is what
 * decides which banners a breakpoint may show (FR-006).
 */
export type ImageOrientation = "landscape" | "portrait" | "square";

export interface ProductImage {
  src: string;
  altKey: string;
  orientation: ImageOrientation;
  /**
   * The file's real pixel size, per image rather than per orientation: two
   * banners of one orientation are not the same size. next/image needs it for
   * the srcSet, the import writes it into ProductImage, and
   * `npm run check:media` fails when it differs from the file's header.
   */
  width: number;
  height: number;
}

export interface ProductVideo {
  src: string;
  /** Shown before playback, and the entire fallback when autoplay is suppressed (FR-017). */
  poster: string;
  altKey: string;
}

export interface Product {
  slug: string;
  priceIDR: number;
  images: ProductImage[];
  /** null is valid — consumers hide the video rather than render a broken element. */
  video: ProductVideo | null;
  nameKey: string;
  benefitKeys: string[];
  trustBadgeKeys: string[];
}
