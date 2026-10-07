import { detectFormat, readDimensions } from "../../src/infrastructure/storage/image-header";
import type { Product } from "../../src/data/product-types";

/**
 * The catalogue's declared image sizes for `npm run check:media`: each image's
 * `width` and `height` in product.json must equal the file's own header,
 * because the import stores them in ProductImage and next/image builds the
 * srcSet from them. Pure apart from the injected reader, so
 * tests/unit/catalogue-media.test.ts can feed it a wrong file.
 *
 * `read` takes a public-relative path and returns its bytes, or null when the
 * file does not exist. A missing file is reported by check-media's path check,
 * so it is skipped here rather than reported twice.
 */
export function imageSizeProblems(
  products: readonly Product[],
  read: (publicPath: string) => Uint8Array | null,
): string[] {
  const problems: string[] = [];

  for (const product of products) {
    for (const [index, image] of product.images.entries()) {
      const bytes = read(image.src);
      if (bytes === null) continue;

      const origin = `${product.slug}.images[${index}]`;
      const format = detectFormat(bytes);
      const size = format ? readDimensions(bytes, format) : null;
      if (size === null) {
        problems.push(`${origin}: "${image.src}" has no readable image header`);
      } else if (size.width !== image.width || size.height !== image.height) {
        problems.push(
          `${origin}: "${image.src}" is ${size.width}×${size.height}, but the catalogue declares ${image.width}×${image.height}`,
        );
      }
    }
  }
  return problems;
}
