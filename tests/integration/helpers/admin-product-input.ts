import { prisma } from "@/infrastructure/db/prisma";
import type { ProductInput } from "@/domain/catalogue/product-schema";

/**
 * Shared by the Phase 2c admin tests (publishing, mark real, unpublish): the
 * saveProduct input the edit form builds for a stored product, and thin
 * wrappers that import the actions after the test file's next/* mocks.
 */

export type SaveInput = {
  productId?: string;
  expectedUpdatedAt?: string;
  categoryId: string;
  position: number;
  product: ProductInput;
  confirmUnpublish?: boolean;
};

/** The edit form's initial values for a stored product, as ProductForm builds them. */
export async function editInputFor(slug: string): Promise<SaveInput> {
  const p = await prisma.product.findUniqueOrThrow({
    where: { slug },
    include: { translations: true, images: { orderBy: { position: "asc" } } },
  });
  const translation = (locale: "id" | "en") => {
    const t = p.translations.find((row) => row.locale === locale)!;
    return {
      name: t.name,
      shortDescription: t.shortDescription,
      longDescription: t.longDescription,
      highlights: t.highlights,
      specs: t.specs as Array<{ label: string; value: string }>,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      videoAlt: t.videoAlt,
    };
  };
  return {
    productId: p.id,
    expectedUpdatedAt: p.updatedAt.toISOString(),
    categoryId: p.categoryId,
    position: p.position,
    product: {
      slug: p.slug,
      sku: p.sku,
      status: p.status,
      priceIDR: p.priceIDR,
      compareAtPriceIDR: p.compareAtPriceIDR,
      images: p.images.map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
        orientation: image.orientation as "landscape" | "portrait" | "square",
        altId: image.altId,
        altEn: image.altEn,
      })),
      video:
        p.videoUrl && p.videoPosterUrl ? { url: p.videoUrl, posterUrl: p.videoPosterUrl } : null,
      translations: { id: translation("id"), en: translation("en") },
    },
  };
}

/** The full stored row, for "nothing changed" comparisons. */
export function productSnapshot(slug: string) {
  return prisma.product.findUniqueOrThrow({
    where: { slug },
    include: {
      translations: { orderBy: { locale: "asc" } },
      images: { orderBy: { position: "asc" } },
    },
  });
}

export async function saveProduct(input: unknown) {
  const { saveProduct } = await import("@/app/actions/admin/products");
  return saveProduct(input);
}

export async function signIn(): Promise<void> {
  const { issueAdminSession } = await import("@/infrastructure/auth/session");
  await issueAdminSession();
}
