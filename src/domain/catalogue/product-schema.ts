import { z } from "zod";
import { SALEABLE_STATUSES, isListed } from "./status";

/**
 * The one product validation schema — FR-013. Its consumers are the catalogue
 * import, the 2b admin ProductForm (client) and the saveProduct server action,
 * so the form can never accept what the server would reject. It imports zod and the
 * status rules only: no server modules, so it is safe in a client bundle (T047).
 *
 * Field rules apply to every status; the status-dependent requirements are
 * added in superRefine. One rule cannot live here: "an ACTIVE product has a
 * stock record" needs the database, so the import and the admin actions check
 * it themselves.
 *
 * Every custom issue carries params.key, which the admin form maps to an
 * admin.productForm.errors.* message (Principle I); the English message stays
 * for logs and the import (R-308).
 */

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Z0-9-]{3,32}$/;

/** "shopee" not preceded by "toko" — Principle II; replaces the old JSON scan. */
const MARKETPLACE_BRAND = /(?<!toko)shopee/i;

const MIN_PRICE_IDR = 1_000;
const MAX_PRICE_IDR = 100_000_000;

/** FR-018. The imported product has 6, so the import still passes. */
export const MAX_PRODUCT_IMAGES = 8;

const specRowSchema = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(200),
});

const translationSchema = z.object({
  name: z.string().trim().min(3).max(120),
  shortDescription: z.string().trim().min(20).max(200),
  longDescription: z.string().max(5000),
  highlights: z.array(z.string().trim().min(1).max(80)).max(6),
  specs: z.array(specRowSchema).max(20),
  seoTitle: z.string().trim().max(60).nullable(),
  seoDescription: z.string().trim().max(160).nullable(),
  videoAlt: z.string().trim().max(200).nullable(),
});

const imageSchema = z.object({
  url: z.string().startsWith("/"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  orientation: z.enum(["landscape", "portrait", "square"]),
  altId: z.string().trim().min(1).max(200),
  altEn: z.string().trim().min(1).max(200),
});

const priceSchema = z.number().int().min(MIN_PRICE_IDR).max(MAX_PRICE_IDR);

export const productInputSchema = z
  .object({
    slug: z.string().min(3).max(80).regex(SLUG_PATTERN),
    sku: z.string().regex(SKU_PATTERN).nullable(),
    status: z.enum(["ACTIVE", "COMING_SOON", "DRAFT"]),
    priceIDR: priceSchema.nullable(),
    compareAtPriceIDR: priceSchema.nullable(),
    images: z.array(imageSchema).max(MAX_PRODUCT_IMAGES),
    video: z
      .object({ url: z.string().startsWith("/"), posterUrl: z.string().startsWith("/") })
      .nullable(),
    translations: z.object({ id: translationSchema, en: translationSchema }),
  })
  .superRefine((product, ctx) => {
    if (product.compareAtPriceIDR !== null) {
      if (product.priceIDR === null) {
        ctx.addIssue({
          code: "custom",
          path: ["compareAtPriceIDR"],
          message: "An original price needs a selling price.",
          params: { key: "compareAtNeedsPrice" },
        });
      } else if (product.compareAtPriceIDR <= product.priceIDR) {
        ctx.addIssue({
          code: "custom",
          path: ["compareAtPriceIDR"],
          message: "The original price must be higher than the selling price.",
          params: { key: "compareAtAbovePrice" },
        });
      }
    }

    if (product.video) {
      for (const locale of ["id", "en"] as const) {
        if (!product.translations[locale].videoAlt) {
          ctx.addIssue({
            code: "custom",
            path: ["translations", locale, "videoAlt"],
            message: "A video needs a description in both languages.",
            params: { key: "videoNeedsAlt" },
          });
        }
      }
    }

    // Status meaning comes from status.ts, never a second comparison (T048).
    if (SALEABLE_STATUSES.includes(product.status) && product.priceIDR === null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceIDR"],
        message: "An active product needs a price.",
        params: { key: "activeNeedsPrice" },
      });
    }

    if (isListed(product) && product.images.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "A listed product needs at least one image.",
        params: { key: "listedNeedsImage" },
      });
    }

    for (const [path, text] of textFields(product)) {
      if (MARKETPLACE_BRAND.test(text)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Third-party marketplace names are not allowed (Principle II).",
          params: { key: "marketplaceBrand" },
        });
      }
    }
  });

export type ProductInput = z.infer<typeof productInputSchema>;

function textFields(product: ProductInput): Array<[Array<string | number>, string]> {
  const fields: Array<[Array<string | number>, string]> = [];
  for (const locale of ["id", "en"] as const) {
    const t = product.translations[locale];
    const base = ["translations", locale];
    fields.push([[...base, "name"], t.name]);
    fields.push([[...base, "shortDescription"], t.shortDescription]);
    fields.push([[...base, "longDescription"], t.longDescription]);
    t.highlights.forEach((h, i) => fields.push([[...base, "highlights", i], h]));
    t.specs.forEach((s, i) => {
      fields.push([[...base, "specs", i, "label"], s.label]);
      fields.push([[...base, "specs", i, "value"], s.value]);
    });
    if (t.seoTitle) fields.push([[...base, "seoTitle"], t.seoTitle]);
    if (t.seoDescription) fields.push([[...base, "seoDescription"], t.seoDescription]);
    if (t.videoAlt) fields.push([[...base, "videoAlt"], t.videoAlt]);
  }
  product.images.forEach((image, i) => {
    fields.push([["images", i, "altId"], image.altId]);
    fields.push([["images", i, "altEn"], image.altEn]);
  });
  return fields;
}
