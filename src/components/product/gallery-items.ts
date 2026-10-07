import type { ProductView } from "@/infrastructure/db/catalogue";

/**
 * What the product gallery shows, in order (007 data-model.md §View props,
 * FR-014): the video first when the catalogue registers one, then every image
 * in catalogue order. Built on the server, so the client gallery receives
 * plain, already-translated data.
 */
export type GalleryItem =
  | { kind: "video"; src: string; poster: string; alt: string }
  | { kind: "image"; src: string; alt: string; width: number; height: number };

export function galleryItems(product: Pick<ProductView, "images" | "video">): GalleryItem[] {
  const video: GalleryItem[] = product.video ? [{ kind: "video", ...product.video }] : [];
  return [
    ...video,
    ...product.images.map((image): GalleryItem => ({
      kind: "image",
      src: image.src,
      alt: image.alt,
      width: image.width,
      height: image.height,
    })),
  ];
}
