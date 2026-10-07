import { getAdminTranslations } from "@/i18n/admin";
import { LoginForm } from "@/components/admin/LoginForm";
import { getAdminErrorMessages } from "@/components/admin/admin-error-messages";

export default async function AdminLoginPage() {
  const t = await getAdminTranslations("admin.login");
  const errorMessages = await getAdminErrorMessages();

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-brown-dark text-2xl font-bold">{t("title")}</h1>
      <LoginForm
        labels={{
          username: t("username"),
          password: t("password"),
          submit: t("submit"),
          submitting: t("submitting"),
        }}
        errorMessages={errorMessages}
      />
    </main>
  );
}
