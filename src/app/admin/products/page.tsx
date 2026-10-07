import Image from "next/image";
import Link from "next/link";
import { z } from "zod";
import { getAdminTranslations } from "@/i18n/admin";
import { listAdminProducts, listCategories } from "@/infrastructure/db/admin-catalogue";
import { formatIDR } from "@/domain/money";
import type { ProductStatus } from "@/domain/catalogue/status";
import { Icon } from "@/components/ui/Icon";
import { ProductFilters } from "@/components/admin/catalogue/ProductFilters";
import {
  InlineStockEditor,
  type InlineStockLabels,
} from "@/components/admin/catalogue/InlineStockEditor";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";
import { badgeClass, buttonClass, pageClass } from "@/components/admin/catalogue/styles";

export const dynamic = "force-dynamic";

const STATUSES: readonly ProductStatus[] = ["ACTIVE", "COMING_SOON", "DRAFT"];

/** Each filter is parsed on its own; an invalid value is ignored, never an error (FR-003). */
const filtersSchema = z.object({
  status: z.enum(["ACTIVE", "COMING_SOON", "DRAFT"]).optional().catch(undefined),
  category: z.string().min(1).max(64).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
});

const STATUS_BADGE: Record<ProductStatus, string> = {
  ACTIVE: badgeClass.success,
  COMING_SOON: badgeClass.neutral,
  DRAFT: badgeClass.neutral,
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const filters = filtersSchema.parse({
    status: single(raw.status),
    category: single(raw.category),
    q: single(raw.q),
  });

  const [tAdmin, tErrors, t, products, categories, errorMessages] = await Promise.all([
    getAdminTranslations("admin"),
    getAdminTranslations("errors"),
    getAdminTranslations("admin.products"),
    listAdminProducts({ status: filters.status, categoryId: filters.category, q: filters.q }),
    listCategories(),
    getAdminErrorMessages(),
  ]);
  const stockLabels = tAdmin.raw("stockInline") as InlineStockLabels;
  // Unresolved, so the editor can fill {current} with the value it gets back.
  const stockChangedTemplate = tErrors.raw("stockChanged") as string;

  return (
    <main className={pageClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-ink text-2xl font-bold lg:text-[32px] lg:leading-10">{t("title")}</h1>
        <Link href="/admin/products/new" className={`${buttonClass.primary} w-full sm:w-auto`}>
          {t("newButton")}
        </Link>
      </div>

      <ProductFilters
        statuses={STATUSES.map((status) => ({ value: status, label: t(`status.${status}`) }))}
        categories={categories.map((c) => ({ value: c.id, label: c.nameEn }))}
        labels={{
          legend: t("filters.legend"),
          status: t("filters.status"),
          statusAll: t("filters.statusAll"),
          category: t("filters.category"),
          categoryAll: t("filters.categoryAll"),
          search: t("filters.search"),
          searchPlaceholder: t("filters.searchPlaceholder"),
          clear: t("filters.clear"),
        }}
      />

      {products.length === 0 ? (
        <section className="border-border bg-surface flex flex-col items-center gap-2 rounded-lg border px-4 py-10 text-center">
          <Icon name="package" className="text-ink-3 h-10 w-10" />
          <h2 className="text-ink text-lg font-semibold">{t("empty.title")}</h2>
          <p className="text-ink-2 text-base">{t("empty.body")}</p>
          <Link href="/admin/products" className={buttonClass.secondary}>
            {t("filters.clear")}
          </Link>
        </section>
      ) : (
        // The table scrolls inside this wrapper so the page itself never
        // scrolls sideways at 360px (spec SC-009).
        <div className="border-border bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-base">
            <caption className="sr-only">{t("table.caption")}</caption>
            <thead className="bg-surface-muted text-ink-2 text-sm">
              <tr>
                <th scope="col" className="w-16 px-3 py-2 font-semibold">
                  <span className="sr-only">{t("table.image")}</span>
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("table.name")}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("table.category")}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {t("table.status")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("table.price")}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {t("table.stock")}
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const image = product.images[0];
                const name = product.translations[0]?.name ?? product.slug;
                return (
                  <tr key={product.id} className="border-border h-11 border-t">
                    <td className="px-3 py-2">
                      {image ? (
                        <Image
                          src={image.url}
                          alt={image.altEn}
                          width={48}
                          height={48}
                          sizes="48px"
                          className="bg-surface-muted h-12 w-12 rounded-md object-cover"
                        />
                      ) : (
                        <span className="bg-surface-muted text-ink-3 flex h-12 w-12 items-center justify-center rounded-md text-center text-xs">
                          {t("noImage")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/products/${product.id}`}
                          className="text-primary focus-visible:outline-primary font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                          {name}
                        </Link>
                        {product.isSample && (
                          <span className={badgeClass.neutral}>{t("sample")}</span>
                        )}
                      </div>
                      <div className="text-ink-3 text-sm">{product.slug}</div>
                    </td>
                    <td className="text-ink-2 px-3 py-2">{product.category.nameEn}</td>
                    <td className="px-3 py-2">
                      <span className={STATUS_BADGE[product.status]}>
                        {t(`status.${product.status}`)}
                      </span>
                    </td>
                    <td className="text-ink px-3 py-2 text-right font-bold tabular-nums">
                      {product.priceIDR !== null ? formatIDR(product.priceIDR) : t("noPrice")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {/* A sample never gets stock (005 R-406, FR-017a): no editor,
                          only its tag, until it is marked real. */}
                      {product.isSample ? (
                        <span className={badgeClass.neutral}>{t("sample")}</span>
                      ) : (
                        <InlineStockEditor
                          productId={product.id}
                          productName={name}
                          quantity={product.stockLevel ? product.stockLevel.quantity : null}
                          emptyLabel={t("noStock")}
                          labels={stockLabels}
                          errorMessages={errorMessages}
                          stockChangedTemplate={stockChangedTemplate}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
