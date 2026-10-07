import { getAdminTranslations } from "@/i18n/admin";
import { getStockPageData } from "@/infrastructure/db/admin-stock";
import { StockAdjustForm } from "@/components/admin/StockAdjustForm";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";

export default async function AdminStockPage() {
  const [t, data, errorMessages] = await Promise.all([
    getAdminTranslations("admin.stock"),
    getStockPageData(),
    getAdminErrorMessages(),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <p className="text-lg">
        {t("current")}: <span className="font-bold">{data.quantity}</span>
      </p>

      <StockAdjustForm
        labels={{
          delta: t("form.delta"),
          note: t("form.note"),
          submit: t("form.submit"),
          submitting: t("form.submitting"),
        }}
        errorMessages={errorMessages}
      />

      <section>
        <h2 className="mb-2 font-bold">{t("log")}</h2>
        {/* Wrapped, not the bare table: a 6-column table is wider than 360px,
            and scrolling this region keeps the page itself from scrolling
            horizontally (T126, SC-001). */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-brown border-b">
                <th className="p-2">{t("logTable.date")}</th>
                <th className="p-2">{t("logTable.delta")}</th>
                <th className="p-2">{t("logTable.resulting")}</th>
                <th className="p-2">{t("logTable.reason")}</th>
                <th className="p-2">{t("logTable.note")}</th>
                <th className="p-2">{t("logTable.order")}</th>
              </tr>
            </thead>
            <tbody>
              {data.changes.map((change) => (
                <tr key={change.id} className="border-b">
                  <td className="p-2">{change.createdAt.toISOString()}</td>
                  <td className="p-2">{change.delta}</td>
                  <td className="p-2">{change.resultingQuantity}</td>
                  <td className="p-2">{change.reason}</td>
                  <td className="p-2">{change.note ?? "—"}</td>
                  <td className="p-2 font-mono">{change.order?.orderNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
