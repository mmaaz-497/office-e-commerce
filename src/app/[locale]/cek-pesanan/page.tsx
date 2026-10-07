import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LookupForm } from "@/components/lookup/LookupForm";
import { asAppLocale } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("lookup.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/cek-pesanan",
    title: t("title"),
    description: t("description"),
  });
}

export default function LookupPage() {
  return <LookupForm />;
}
