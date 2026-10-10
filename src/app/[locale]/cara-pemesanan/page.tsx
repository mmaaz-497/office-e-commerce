import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ContentList,
  ContentPage,
  ContentParagraph,
  ContentSection,
  emailTag,
} from "@/components/content/ContentPage";
import { asAppLocale } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

/**
 * Cara Pemesanan / How to Order (FR-068). Every string comes from the message
 * catalogues; the contact address comes from store.config.ts.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("howToOrder.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/cara-pemesanan",
    title: t("title"),
    description: t("description"),
  });
}

export default async function HowToOrderPage() {
  const t = await getTranslations("howToOrder");

  return (
    <ContentPage title={t("title")}>
      <ContentParagraph>{t("intro")}</ContentParagraph>

      <ContentSection heading={t("steps.heading")}>
        <ContentList
          items={[t("steps.s1"), t("steps.s2"), t("steps.s3"), t("steps.s4"), t("steps.s5")]}
        />
      </ContentSection>

      <ContentSection heading={t("payment.heading")}>
        <ContentParagraph>{t("payment.online")}</ContentParagraph>
        <ContentParagraph>{t("payment.cod")}</ContentParagraph>
        <ContentParagraph>{t("payment.expiry")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("delivery.heading")}>
        <ContentParagraph>{t("delivery.body")}</ContentParagraph>
        <ContentParagraph>{t("delivery.tracking")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("help.heading")}>
        <ContentParagraph>{t.rich("help.body", emailTag)}</ContentParagraph>
      </ContentSection>
    </ContentPage>
  );
}
