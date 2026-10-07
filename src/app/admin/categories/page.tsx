import { getAdminTranslations } from "@/i18n/admin";
import { listCategoriesWithCounts } from "@/infrastructure/db/admin-catalogue";
import { Icon } from "@/components/ui/Icon";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";
import {
  CategoryForm,
  CategoryRows,
  type CategoryLabels,
} from "@/components/admin/catalogue/CategoryForm";
import { pageClass } from "@/components/admin/catalogue/styles";

export const dynamic = "force-dynamic";

/** Spec US6: list, create and edit categories. There is no delete. */
export default async function AdminCategoriesPage() {
  const [tAdmin, categories, errorMessages] = await Promise.all([
    getAdminTranslations("admin"),
    listCategoriesWithCounts(),
    getAdminErrorMessages(),
  ]);
  const labels = tAdmin.raw("categories") as CategoryLabels;
  const rows = categories.map((c) => ({
    categoryId: c.id,
    slug: c.slug,
    nameId: c.nameId,
    nameEn: c.nameEn,
    position: c.position,
    productCount: c._count.products,
  }));

  return (
    <main className={pageClass}>
      <h1 className="text-ink text-2xl font-bold lg:text-[32px] lg:leading-10">{labels.title}</h1>

      <section className="border-border bg-surface flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="text-ink text-xl font-semibold">{labels.new}</h2>
        <CategoryForm labels={labels} errorMessages={errorMessages} />
      </section>

      {rows.length === 0 ? (
        <section className="border-border bg-surface flex flex-col items-center gap-2 rounded-lg border px-4 py-10 text-center">
          <Icon name="package" className="text-ink-3 h-10 w-10" />
          <h2 className="text-ink text-lg font-semibold">{labels.empty.title}</h2>
          <p className="text-ink-2 text-base">{labels.empty.body}</p>
        </section>
      ) : (
        // The table scrolls inside this wrapper so the page itself never
        // scrolls sideways at 360px (spec SC-009).
        <div className="border-border bg-surface relative overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-base">
            <caption className="sr-only">{labels.title}</caption>
            <thead className="bg-surface-muted text-ink-2 text-sm">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.table.nameId}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.table.nameEn}
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  {labels.table.slug}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {labels.table.position}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  {labels.table.products}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{labels.edit}</span>
                </th>
              </tr>
            </thead>
            <CategoryRows rows={rows} labels={labels} errorMessages={errorMessages} />
          </table>
        </div>
      )}
    </main>
  );
}
