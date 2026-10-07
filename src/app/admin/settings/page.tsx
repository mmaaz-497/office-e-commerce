import { getAdminTranslations } from "@/i18n/admin";
import { getSoldCountBaseline } from "@/infrastructure/db/admin-settings";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";
import { SoldCountBaselineForm } from "@/components/admin/SoldCountBaselineForm";

export default async function AdminSettingsPage() {
  const [t, baseline, errorMessages] = await Promise.all([
    getAdminTranslations("admin.settings"),
    getSoldCountBaseline(),
    getAdminErrorMessages(),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <SoldCountBaselineForm
        initialValue={baseline}
        labels={{
          baseline: t("form.baseline"),
          submit: t("form.submit"),
          submitting: t("form.submitting"),
        }}
        errorMessages={errorMessages}
      />
    </main>
  );
}
