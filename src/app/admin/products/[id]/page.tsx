import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminTranslations } from "@/i18n/admin";
import {
  getAdminProduct,
  listCategories,
  type AdminProduct,
} from "@/infrastructure/db/admin-catalogue";
import { adminProductIdSchema } from "@/app/actions/admin/schemas";
import { allowedStatusesFor } from "@/domain/catalogue/publish-gate";
import type { ProductInput } from "@/domain/catalogue/product-schema";
import type { ProductStatus } from "@/domain/catalogue/status";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";
import {
  ProductForm,
  type ProductFormInitial,
  type ProductFormLabels,
  type UnpublishLabels,
} from "@/components/admin/catalogue/ProductForm";
import type { UploadLabels } from "@/components/admin/catalogue/ImageUploader";
import { MarkRealPanel, type MarkRealLabels } from "@/components/admin/catalogue/MarkRealPanel";
import { buttonClass, pageClass } from "@/components/admin/catalogue/styles";

export const dynamic = "force-dynamic";

/** The stored product as the form's values — the shape saveProduct takes back. */
function toFormInitial(product: AdminProduct): ProductFormInitial {
  const translation = (locale: "id" | "en"): ProductInput["translations"]["id"] => {
    const t = product.translations.find((row) => row.locale === locale);
    return {
      name: t?.name ?? "",
      shortDescription: t?.shortDescription ?? "",
      longDescription: t?.longDescription ?? "",
      highlights: t?.highlights ?? [],
      specs: (t?.specs as Array<{ label: string; value: string }> | undefined) ?? [],
      seoTitle: t?.seoTitle ?? null,
      seoDescription: t?.seoDescription ?? null,
      videoAlt: t?.videoAlt ?? null,
    };
  };
  return {
    productId: product.id,
    updatedAt: product.updatedAt.toISOString(),
    categoryId: product.categoryId,
    position: product.position,
    product: {
      slug: product.slug,
      sku: product.sku,
      status: product.status,
      priceIDR: product.priceIDR,
      compareAtPriceIDR: product.compareAtPriceIDR,
      images: product.images.map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
        orientation: image.orientation as ProductInput["images"][number]["orientation"],
        altId: image.altId,
        altEn: image.altEn,
      })),
      video:
        product.videoUrl && product.videoPosterUrl
          ? { url: product.videoUrl, posterUrl: product.videoPosterUrl }
          : null,
      translations: { id: translation("id"), en: translation("en") },
    },
  };
}

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Parsed before any query (Principle IX): a malformed id is a 404, not a lookup.
  const parsedId = adminProductIdSchema.safeParse((await params).id);
  if (!parsedId.success) notFound();

  const product = await getAdminProduct(parsedId.data);
  if (!product) notFound();

  const [tAdmin, t, categories, errorMessages] = await Promise.all([
    getAdminTranslations("admin"),
    getAdminTranslations("admin.products"),
    listCategories(),
    getAdminErrorMessages(),
  ]);

  const statusLabels: Record<ProductStatus, string> = {
    ACTIVE: t("status.ACTIVE"),
    COMING_SOON: t("status.COMING_SOON"),
    DRAFT: t("status.DRAFT"),
  };
  const name = product.translations.find((row) => row.locale === "en")?.name ?? product.slug;

  return (
    <main className={`${pageClass} max-w-5xl`}>
      <Link href="/admin/products" className={`${buttonClass.link} self-start text-base`}>
        ← {t("backToList")}
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-ink-3 text-sm">{t("edit.title")}</p>
        <h1 className="text-ink text-2xl font-bold lg:text-[32px] lg:leading-10">{name}</h1>
      </div>

      <section className="border-border bg-surface-muted flex flex-col gap-1 rounded-lg border p-4">
        <p className="text-ink text-base">
          {t("edit.currentStock")}:{" "}
          <span className="font-bold tabular-nums">
            {product.stockLevel ? product.stockLevel.quantity : t("noStock")}
          </span>
        </p>
        <p className="text-ink-3 text-sm">{t("edit.stockHelp")}</p>
      </section>

      <MarkRealPanel
        productId={product.id}
        isSample={product.isSample}
        updatedAt={product.updatedAt.toISOString()}
        labels={t.raw("markReal") as MarkRealLabels}
        errorMessages={errorMessages}
      />

      <ProductForm
        initial={toFormInitial(product)}
        categories={categories.map((c) => ({ id: c.id, name: c.nameEn }))}
        allowedStatuses={allowedStatusesFor(product)}
        slugLocked={product.publishedAt !== null}
        isSample={product.isSample}
        statusLabels={statusLabels}
        labels={tAdmin.raw("productForm") as ProductFormLabels}
        unpublishLabels={t.raw("unpublish") as UnpublishLabels}
        uploadLabels={tAdmin.raw("uploads") as UploadLabels}
        errorMessages={errorMessages}
      />
    </main>
  );
}
