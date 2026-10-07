import Link from "next/link";
import { getAdminTranslations } from "@/i18n/admin";
import { listCategories } from "@/infrastructure/db/admin-catalogue";
import { allowedStatuses } from "@/domain/catalogue/publish-gate";
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
import { buttonClass, pageClass } from "@/components/admin/catalogue/styles";

export const dynamic = "force-dynamic";

const EMPTY_TRANSLATION: ProductInput["translations"]["id"] = {
  name: "",
  shortDescription: "",
  longDescription: "",
  highlights: [],
  specs: [],
  seoTitle: null,
  seoDescription: null,
  videoAlt: null,
};

/** A blank DRAFT; saveProduct without a productId creates it (spec US4). */
export default async function AdminProductNewPage() {
  const [tAdmin, t, categories, errorMessages] = await Promise.all([
    getAdminTranslations("admin"),
    getAdminTranslations("admin.products"),
    listCategories(),
    getAdminErrorMessages(),
  ]);

  const initial: ProductFormInitial = {
    categoryId: categories[0]?.id ?? "",
    position: 0,
    product: {
      slug: "",
      sku: null,
      status: "DRAFT",
      priceIDR: null,
      compareAtPriceIDR: null,
      images: [],
      video: null,
      translations: { id: EMPTY_TRANSLATION, en: EMPTY_TRANSLATION },
    },
  };
  const statusLabels: Record<ProductStatus, string> = {
    ACTIVE: t("status.ACTIVE"),
    COMING_SOON: t("status.COMING_SOON"),
    DRAFT: t("status.DRAFT"),
  };

  return (
    <main className={`${pageClass} max-w-5xl`}>
      <Link href="/admin/products" className={`${buttonClass.link} self-start text-base`}>
        ← {t("backToList")}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-ink text-2xl font-bold lg:text-[32px] lg:leading-10">
          {t("create.title")}
        </h1>
        <p className="text-ink-3 text-sm">{t("create.help")}</p>
      </div>

      <ProductForm
        initial={initial}
        categories={categories.map((c) => ({ id: c.id, name: c.nameEn }))}
        allowedStatuses={allowedStatuses(null)}
        slugLocked={false}
        statusLabels={statusLabels}
        labels={tAdmin.raw("productForm") as ProductFormLabels}
        unpublishLabels={t.raw("unpublish") as UnpublishLabels}
        uploadLabels={tAdmin.raw("uploads") as UploadLabels}
        errorMessages={errorMessages}
      />
    </main>
  );
}
