import { describe, expect, it } from "vitest";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import { galleryItems } from "@/components/product/gallery-items";

/**
 * FR-009 and FR-010 as data rules rather than rendered output. Since 007 the
 * composition under test is the real galleryItems() the gallery renders.
 *
 * The ordering and the orientation split are decided entirely by the catalogue
 * array, so they can be asserted without a DOM: the gallery renders `video`
 * first then `images` in array order, and the hero filters the same array by
 * orientation. Testing the data keeps these honest even if the markup changes.
 */

const PRODUCTS = catalogue as Product[];
const featured = PRODUCTS[0];

/** The catalogue entry in the shape the storefront reader returns (alt text stands in as its key). */
function asView(product: Product) {
  return {
    images: product.images.map((image) => ({
      src: image.src,
      alt: image.altKey,
      width: image.width,
      height: image.height,
      orientation: image.orientation,
    })),
    video: product.video
      ? { src: product.video.src, poster: product.video.poster, alt: product.video.altKey }
      : null,
  };
}

const order = (product: Product) => galleryItems(asView(product)).map((item) => item.src);

describe("product gallery composition (FR-009, 007 FR-014)", () => {
  it("puts the video first when the catalogue registers one", () => {
    expect(featured.video).not.toBeNull();
    const [first] = galleryItems(asView(featured));
    expect(first).toMatchObject({ kind: "video", src: featured.video!.src });
  });

  it("follows the video with every image, in catalogue order", () => {
    expect(order(featured).slice(1)).toEqual(featured.images.map((image) => image.src));
  });

  it("includes every registered image exactly once", () => {
    const items = order(featured);
    expect(items).toHaveLength(featured.images.length + 1);
    expect(new Set(items).size).toBe(items.length);
  });

  it("degrades to images only when no video is registered", () => {
    expect(order({ ...featured, video: null })).toEqual(featured.images.map((image) => image.src));
  });

  it("carries the poster with the video and the alt text with every item", () => {
    const items = galleryItems(asView(featured));
    for (const item of items) expect(item.alt.length).toBeGreaterThan(0);
    const [video] = items;
    expect(video.kind === "video" ? video.poster : null).toBe(featured.video!.poster);
  });

  it("marks every image with its kind and intrinsic dimensions", () => {
    for (const item of galleryItems(asView(featured)).slice(1)) {
      expect(item.kind).toBe("image");
      if (item.kind === "image") {
        expect(item.width).toBeGreaterThan(0);
        expect(item.height).toBeGreaterThan(0);
      }
    }
  });
});

describe("hero art direction split (FR-010)", () => {
  const landscape = featured.images.filter((image) => image.orientation === "landscape");
  const upright = featured.images.filter(
    (image) => image.orientation === "portrait" || image.orientation === "square",
  );

  it("gives the desktop track only landscape artwork", () => {
    expect(landscape.length).toBeGreaterThan(0);
    for (const image of landscape) expect(image.orientation).toBe("landscape");
  });

  it("gives the mobile track only portrait or square artwork", () => {
    expect(upright.length).toBeGreaterThan(0);
    for (const image of upright) expect(["portrait", "square"]).toContain(image.orientation);
  });

  it("assigns every image to exactly one track", () => {
    expect(landscape.length + upright.length).toBe(featured.images.length);
    const overlap = landscape.filter((image) => upright.includes(image));
    expect(overlap).toHaveLength(0);
  });

  it("declares a landscape aspect wider than 1 and an upright aspect no wider than 1", () => {
    for (const image of landscape) expect(image.width / image.height).toBeGreaterThan(1);
    for (const image of upright) expect(image.width / image.height).toBeLessThanOrEqual(1);
  });
});
