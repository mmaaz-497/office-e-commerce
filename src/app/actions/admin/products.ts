"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/db/prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { productInputSchema, type ProductInput } from "@/domain/catalogue/product-schema";
import { allowedStatusesFor } from "@/domain/catalogue/publish-gate";
import { detectFormat, readDimensions } from "@/infrastructure/storage/image-header";
import { UPLOAD_URL_PREFIX, uploadUrlSchema } from "@/infrastructure/storage/upload-name";
import { readUpload, uploadExists } from "@/infrastructure/storage/uploads";
import {
  DomainError,
  ProductChangedError,
  SampleStatusLockedError,
  SlugLockedError,
  StatusLockedError,
  UnpublishNeedsConfirmationError,
} from "@/domain/errors";
import { toFieldErrors, type FieldError } from "@/components/admin/catalogue/form-errors";
import { adminProductInputSchema, markProductRealInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type SaveProductResult =
  | { ok: true; productId: string; updatedAt: string }
  | {
      ok: false;
      errorKey: string;
      fieldErrors?: Record<string, FieldError[]>;
      /** With errors.unpublishNeedsConfirmation: is this the last product on sale (R-404)? */
      confirm?: { lastActive: boolean };
    };

/** A refusal that names fields; thrown inside the transaction so it rolls back. */
class FieldErrorsFailure extends DomainError {
  readonly fieldErrors: Record<string, FieldError[]>;

  constructor(fieldErrors: Record<string, FieldError[]>, messageKey = "errors.validation") {
    super(messageKey);
    this.fieldErrors = fieldErrors;
  }
}

type ImageInput = ProductInput["images"][number];
type StoredImage = Omit<ImageInput, "orientation"> & { orientation: string };

/**
 * Dimensions of a stored upload, read again from the file's header rather
 * than trusted from the client. Null when the URL is not an upload URL, the
 * file is missing, or its header no longer parses.
 */
async function uploadDimensions(url: string): Promise<{ width: number; height: number } | null> {
  if (!uploadUrlSchema.safeParse(url).success || !(await uploadExists(url))) return null;
  const bytes = await readUpload(url.slice(UPLOAD_URL_PREFIX.length));
  if (!bytes) return null;
  const format = detectFormat(bytes);
  return format ? readDimensions(bytes, format) : null;
}

/**
 * Image provenance (research R-312). The client never supplies trusted
 * dimensions: an image already on the product keeps its stored width, height
 * and orientation, which is how the imported landscape banners survive edits
 * (FR-020); a stored upload takes its width and height from the file, and is
 * square by the upload rules. Anything else is refused, so a forged request
 * cannot attach an arbitrary URL.
 */
async function resolveImages(
  requested: ImageInput[],
  stored: StoredImage[],
): Promise<ImageInput[]> {
  const fieldErrors: Record<string, FieldError[]> = {};
  const resolved = await Promise.all(
    requested.map(async (image, i) => {
      const existing = stored.find((s) => s.url === image.url);
      if (existing) {
        return {
          ...image,
          width: existing.width,
          height: existing.height,
          orientation: existing.orientation as ImageInput["orientation"],
        };
      }
      const upload = await uploadDimensions(image.url);
      if (upload) return { ...image, ...upload, orientation: "square" as const };
      fieldErrors[`images.${i}`] = [{ key: "imageUnknown" }];
      return image;
    }),
  );
  if (Object.keys(fieldErrors).length > 0) throw new FieldErrorsFailure(fieldErrors);
  return resolved;
}

/** Issues from the wrapped schema carry a leading "product" segment the form does not use. */
function withoutProductPrefix<T extends { path: PropertyKey[] }>(issues: readonly T[]): T[] {
  return issues.map((issue) =>
    issue.path[0] === "product" ? { ...issue, path: issue.path.slice(1) } : issue,
  );
}

function uniqueViolationField(err: unknown): "slug" | "sku" | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];
  if (fields.some((f) => f.includes("slug"))) return "slug";
  if (fields.some((f) => f.includes("sku"))) return "sku";
  return null;
}

function translationData(t: ProductInput["translations"]["id"]) {
  return {
    name: t.name,
    shortDescription: t.shortDescription,
    longDescription: t.longDescription,
    highlights: t.highlights,
    specs: t.specs,
    seoTitle: t.seoTitle,
    seoDescription: t.seoDescription,
    videoAlt: t.videoAlt,
  };
}

/**
 * Creates a product (spec US4): the publish gate for a new product (open from
 * 2c, R-401; a new product is never a sample), the category, and image
 * provenance with nothing stored yet, so only existing uploads are accepted.
 * Video is not editable in 2b, so a new product has none. The product, both
 * translations, its images and its own stock row at 0 are written in the
 * caller's transaction; no StockChange, since nothing moved. A product created
 * as ACTIVE gets publishedAt now (R-405).
 */
async function createProduct(
  tx: Prisma.TransactionClient,
  input: ProductInput,
  categoryId: string,
  position: number,
): Promise<{ productId: string; updatedAt: Date }> {
  if (!allowedStatusesFor(null).includes(input.status)) throw new StatusLockedError();

  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new FieldErrorsFailure({ categoryId: [{ key: "categoryUnknown" }] });

  const images = await resolveImages(input.images, []);
  const effective: ProductInput = {
    ...input,
    images,
    video: null,
    translations: {
      id: { ...input.translations.id, videoAlt: null },
      en: { ...input.translations.en, videoAlt: null },
    },
  };
  const recheck = productInputSchema.safeParse(effective);
  if (!recheck.success) throw new FieldErrorsFailure(toFieldErrors(recheck.error.issues));

  const product = await tx.product.create({
    data: {
      slug: effective.slug,
      sku: effective.sku,
      status: effective.status,
      priceIDR: effective.priceIDR,
      compareAtPriceIDR: effective.compareAtPriceIDR,
      categoryId,
      position,
      publishedAt: effective.status === "ACTIVE" ? new Date() : null,
      translations: {
        create: (["id", "en"] as const).map((locale) => ({
          locale,
          ...translationData(effective.translations[locale]),
        })),
      },
      images: { create: images.map((image, index) => ({ ...image, position: index })) },
    },
    select: { id: true, updatedAt: true },
  });
  await tx.stockLevel.create({
    data: { id: product.id, productId: product.id, quantity: 0 },
  });
  return { productId: product.id, updatedAt: product.updatedAt };
}

/**
 * Creates or edits a product (contracts/admin-catalogue-actions.md
 * saveProduct, extended by 005 contracts/admin-publishing.md). Without a
 * productId it creates a product (createProduct above). With one, one
 * transaction: the publish gate and the sample rule (a sample stays
 * COMING_SOON, R-402), slug lock, category and image checks, the stock rule
 * (ACTIVE needs a stock row, R-406), then a conditional UPDATE guarded by the
 * updatedAt the form loaded, both translations upserted and the image set
 * replaced. The first ACTIVE save sets publishedAt, which is never cleared
 * (R-405). Taking an ACTIVE product off sale needs confirmUnpublish (R-404);
 * it still writes only Product fields, translations and images, so orders,
 * stock history and reviews are untouched. isSample is never written here (R-403). Video is not editable in
 * 2b: it and both videoAlt values always come from the stored row.
 */
export async function saveProduct(rawInput: unknown): Promise<SaveProductResult> {
  try {
    await requireAdminSession();
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = adminProductInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "errors.validation",
      fieldErrors: toFieldErrors(withoutProductPrefix(parsed.error.issues)),
    };
  }
  const {
    productId,
    expectedUpdatedAt,
    categoryId,
    position,
    confirmUnpublish,
    product: input,
  } = parsed.data;

  try {
    if (productId === undefined || expectedUpdatedAt === undefined) {
      const created = await prisma.$transaction((tx) =>
        createProduct(tx, input, categoryId, position),
      );
      revalidatePath("/admin/products");
      return { ok: true, productId: created.productId, updatedAt: created.updatedAt.toISOString() };
    }

    const updatedAt = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({
        where: { id: productId },
        include: { translations: true, images: true, stockLevel: { select: { id: true } } },
      });
      if (!current) throw new FieldErrorsFailure({});

      if (!allowedStatusesFor(current).includes(input.status)) {
        throw current.isSample ? new SampleStatusLockedError() : new StatusLockedError();
      }
      if (current.status === "ACTIVE" && input.status !== "ACTIVE" && confirmUnpublish !== true) {
        const otherActive = await tx.product.count({
          where: { status: "ACTIVE", id: { not: productId } },
        });
        throw new UnpublishNeedsConfirmationError(otherActive === 0);
      }
      if (current.publishedAt !== null && input.slug !== current.slug) {
        throw new SlugLockedError();
      }

      const category = await tx.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new FieldErrorsFailure({ categoryId: [{ key: "categoryUnknown" }] });

      const images = await resolveImages(input.images, current.images);

      // The stored video, re-validated with the shared schema so its
      // video-needs-alt rule holds for what is actually saved.
      const storedVideoAlt = (locale: "id" | "en") =>
        current.translations.find((t) => t.locale === locale)?.videoAlt ?? null;
      const effective: ProductInput = {
        ...input,
        images,
        video:
          current.videoUrl && current.videoPosterUrl
            ? { url: current.videoUrl, posterUrl: current.videoPosterUrl }
            : null,
        translations: {
          id: { ...input.translations.id, videoAlt: storedVideoAlt("id") },
          en: { ...input.translations.en, videoAlt: storedVideoAlt("en") },
        },
      };
      const recheck = productInputSchema.safeParse(effective);
      if (!recheck.success) throw new FieldErrorsFailure(toFieldErrors(recheck.error.issues));

      if (effective.status === "ACTIVE" && !current.stockLevel) {
        throw new FieldErrorsFailure({ status: [{ key: "stockRequired" }] });
      }

      const updated = await tx.product.updateMany({
        where: { id: productId, updatedAt: new Date(expectedUpdatedAt) },
        data: {
          slug: effective.slug,
          sku: effective.sku,
          status: effective.status,
          priceIDR: effective.priceIDR,
          compareAtPriceIDR: effective.compareAtPriceIDR,
          categoryId,
          position,
          ...(effective.status === "ACTIVE" && current.publishedAt === null
            ? { publishedAt: new Date() }
            : {}),
          updatedAt: new Date(),
        },
      });
      if (updated.count === 0) throw new ProductChangedError();

      for (const locale of ["id", "en"] as const) {
        const data = translationData(effective.translations[locale]);
        await tx.productTranslation.upsert({
          where: { productId_locale: { productId, locale } },
          create: { productId, locale, ...data },
          update: data,
        });
      }

      // Nothing references ProductImage.id, so replacing the set is safe. The
      // files a removed image pointed at are never deleted (FR-018).
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.productImage.createMany({
        data: images.map((image, index) => ({ productId, ...image, position: index })),
      });

      const saved = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { updatedAt: true },
      });
      return saved.updatedAt;
    });

    revalidatePath("/admin/products");
    return { ok: true, productId, updatedAt: updatedAt.toISOString() };
  } catch (err) {
    const field = uniqueViolationField(err);
    if (field) {
      return {
        ok: false,
        errorKey: "errors.validation",
        fieldErrors: { [field]: [{ key: field === "slug" ? "slugTaken" : "skuTaken" }] },
      };
    }
    if (err instanceof FieldErrorsFailure) {
      const hasFields = Object.keys(err.fieldErrors).length > 0;
      return {
        ok: false,
        errorKey: err.messageKey,
        ...(hasFields ? { fieldErrors: err.fieldErrors } : {}),
      };
    }
    if (err instanceof UnpublishNeedsConfirmationError) {
      return { ok: false, errorKey: err.messageKey, confirm: { lastActive: err.lastActive } };
    }
    if (err instanceof SampleStatusLockedError) {
      return {
        ok: false,
        errorKey: err.messageKey,
        fieldErrors: { status: [{ key: "sampleStatusLocked" }] },
      };
    }
    if (err instanceof SlugLockedError) {
      return {
        ok: false,
        errorKey: err.messageKey,
        fieldErrors: { slug: [{ key: "slugLocked" }] },
      };
    }
    return toErrorResult(err);
  }
}

export type MarkProductRealResult =
  { ok: true; updatedAt: string } | { ok: false; errorKey: string };

/**
 * Turns a sample into an ordinary product (contracts/admin-publishing.md,
 * research R-403). One way only: no action sets isSample back to true. The
 * update is conditional on the row still being a sample at the updatedAt the
 * edit page loaded; when nothing matched, a re-read says why — gone, already
 * real (idempotent ok, no write) or edited elsewhere.
 */
export async function markProductReal(rawInput: unknown): Promise<MarkProductRealResult> {
  try {
    await requireAdminSession();
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = markProductRealInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { productId, expectedUpdatedAt } = parsed.data;

  try {
    const updatedAt = new Date();
    const updated = await prisma.product.updateMany({
      where: { id: productId, isSample: true, updatedAt: new Date(expectedUpdatedAt) },
      data: { isSample: false, updatedAt },
    });
    if (updated.count === 0) {
      const current = await prisma.product.findUnique({
        where: { id: productId },
        select: { isSample: true, updatedAt: true },
      });
      if (!current) return { ok: false, errorKey: "errors.validation" };
      if (!current.isSample) return { ok: true, updatedAt: current.updatedAt.toISOString() };
      throw new ProductChangedError();
    }

    revalidatePath("/admin/products");
    return { ok: true, updatedAt: updatedAt.toISOString() };
  } catch (err) {
    return toErrorResult(err);
  }
}
