import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ReviewForm } from "@/components/review/ReviewForm";
import { asAppLocale } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("review.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/ulasan",
    title: t("title"),
    description: t("description"),
  });
}

export default function ReviewPage() {
  return <ReviewForm />;
}
