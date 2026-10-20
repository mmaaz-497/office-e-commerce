import { productInputSchema, type ProductInput } from "./product-schema";

/**
 * What a DRAFT product still lacks before it can be saved as ACTIVE, for the
 * admin edit page's notice. Derived by running the one product schema with
 * the status set to ACTIVE, so the list cannot drift from what saveProduct
 * enforces (FR-013); the stock-row rule needs the database, so the caller
 * passes it in, as saveProduct checks it itself (R-406).
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export type PublishRequirement =
  "price" | "image" | "contentId" | "contentEn" | "stock" | "otherFields";

/** Display order: the usual gaps of a new draft first. */
export const PUBLISH_REQUIREMENTS: readonly PublishRequirement[] = [
  "price",
  "image",
  "contentId",
  "contentEn",
  "stock",
  "otherFields",
];

function requirementFor(path: readonly PropertyKey[]): PublishRequirement {
  const [field, locale] = path;
  if (field === "priceIDR" || field === "compareAtPriceIDR") return "price";
  if (field === "images") return "image";
  if (field === "translations") return locale === "en" ? "contentEn" : "contentId";
  return "otherFields";
}

export function missingPublishRequirements(
  product: ProductInput,
  hasStockRow: boolean,
): PublishRequirement[] {
  const missing = new Set<PublishRequirement>();
  const result = productInputSchema.safeParse({ ...product, status: "ACTIVE" });
  if (!result.success) {
    for (const issue of result.error.issues) missing.add(requirementFor(issue.path));
  }
  if (!hasStockRow) missing.add("stock");
  return PUBLISH_REQUIREMENTS.filter((requirement) => missing.has(requirement));
}
