/**
 * Fails the build when the catalogue references media that is not on disk.
 *
 * Not speculative hardening: before this existed, product.json registered
 * /products/slippers-gemoy/front.jpg, side.jpg and pair.jpg, none of which
 * were ever present under public/. The product page rendered three broken
 * images and nothing caught it, because a wrong path typechecks perfectly and
 * only fails at request time in a browser.
 *
 * Mirrors scripts/check-messages.ts, the existing precedent for a build-time
 * content gate (FR-005, specs/002-homepage/contracts/catalogue.md §4).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import catalogue from "../src/data/product.json" with { type: "json" };
import type { Product } from "../src/data/product-types";
import { SAMPLE_DEFINITIONS } from "../prisma/samples/definitions";
import { imageSizeProblems } from "./catalogue/image-size-check";
import { placeholderProblems } from "./catalogue/placeholder-check";

const PUBLIC_DIR = join(process.cwd(), "public");

/** Every public-relative media path the catalogue points at, with its origin for the error. */
function mediaReferences(products: Product[]): { path: string; origin: string }[] {
  return products.flatMap((product) => [
    ...product.images.map((image, index) => ({
      path: image.src,
      origin: `${product.slug}.images[${index}].src`,
    })),
    ...(product.video
      ? [
          { path: product.video.src, origin: `${product.slug}.video.src` },
          { path: product.video.poster, origin: `${product.slug}.video.poster` },
        ]
      : []),
  ]);
}

/** A public-relative path's bytes, or null when the file does not exist. */
function readPublic(publicPath: string): Uint8Array | null {
  const file = join(PUBLIC_DIR, publicPath.slice(1));
  return existsSync(file) ? readFileSync(file) : null;
}

function main() {
  const references = mediaReferences(catalogue as Product[]);
  const problems: string[] = [];

  for (const { path, origin } of references) {
    if (!path.startsWith("/")) {
      problems.push(`${origin}: "${path}" must be public-relative and start with "/"`);
      continue;
    }
    // Strip the leading slash so the path resolves inside public/ rather than
    // at the filesystem root.
    if (!existsSync(join(PUBLIC_DIR, path.slice(1)))) {
      problems.push(`${origin}: "${path}" does not exist under public/`);
    }
  }

  // The size the import stores for each catalogue image is the file's own.
  problems.push(...imageSizeProblems(catalogue as Product[], readPublic));

  // 005 R-413: the committed sample placeholders — each a distinct
  // 1200×1200 PNG under 200 KB.
  problems.push(...placeholderProblems(SAMPLE_DEFINITIONS, readPublic));

  if (problems.length > 0) {
    console.error("Catalogue media check failed:\n");
    console.error(problems.map((p) => `  ${p}`).join("\n"));
    console.error(
      "\nEvery media path in src/data/product.json must resolve to a real file under public/,\n" +
        "and every image's width and height must be that file's real size.",
    );
    process.exit(1);
  }

  console.log(`Catalogue media resolved: ${references.length} files, all present under public/.`);
  console.log(
    `Catalogue image sizes match their files: ${(catalogue as Product[]).flatMap((p) => p.images).length} images.`,
  );
  console.log(
    `Sample placeholders valid: ${SAMPLE_DEFINITIONS.length} distinct 1200×1200 PNGs under 200 KB.`,
  );
}

main();
