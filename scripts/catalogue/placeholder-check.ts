import { createHash } from "node:crypto";
import { detectFormat, readDimensions } from "../../src/infrastructure/storage/image-header";
import { SAMPLE_IMAGE_SIZE, type SampleDefinition } from "../../src/domain/catalogue/samples";

/** The plan's ceiling for one placeholder (docs/redesign-plan.md §6 item 8). */
export const MAX_PLACEHOLDER_BYTES = 204_800;

/**
 * The sample placeholder rules for `npm run check:media` (005 R-413): each of
 * the definitions' images exists under public/, is a 1200×1200 PNG under
 * 200 KB, and no two are the same file. Pure apart from the injected reader,
 * so tests/unit/catalogue-media.test.ts can feed it a missing or wrong file.
 *
 * `read` takes a public-relative path and returns its bytes, or null when the
 * file does not exist.
 */
export function placeholderProblems(
  definitions: readonly SampleDefinition[],
  read: (publicPath: string) => Uint8Array | null,
): string[] {
  const problems: string[] = [];
  const digests = new Map<string, string>();

  for (const { slug, image } of definitions) {
    const origin = `samples.${slug}.image`;
    const bytes = read(image);
    if (bytes === null) {
      problems.push(`${origin}: "${image}" does not exist under public/`);
      continue;
    }
    const format = detectFormat(bytes);
    const size = format ? readDimensions(bytes, format) : null;
    if (format !== "png") {
      problems.push(`${origin}: "${image}" is not a PNG`);
    } else if (size?.width !== SAMPLE_IMAGE_SIZE || size?.height !== SAMPLE_IMAGE_SIZE) {
      problems.push(
        `${origin}: "${image}" is ${size?.width}×${size?.height}, expected ${SAMPLE_IMAGE_SIZE}×${SAMPLE_IMAGE_SIZE}`,
      );
    }
    if (bytes.length >= MAX_PLACEHOLDER_BYTES) {
      problems.push(`${origin}: "${image}" is ${bytes.length} bytes, must be under 200 KB`);
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    const twin = digests.get(digest);
    if (twin) problems.push(`${origin}: "${image}" is identical to "${twin}"`);
    else digests.set(digest, image);
  }
  return problems;
}
