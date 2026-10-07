import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  ContentList,
  ContentPage,
  ContentParagraph,
  ContentSection,
} from "@/components/content/ContentPage";
import { asAppLocale } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

/**
 * Kebijakan Privasi / Privacy Policy (FR-068, Constitution Principle IX).
 * The "what we collect" list is written from what the system actually stores
 * — order contact and address fields, the review, and the IP address the rate
 * limiter keys on — not from a generic template. Store legal name, address
 * and contact email remain PLACEHOLDER until the client supplies them.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("privacy.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/kebijakan-privasi",
    title: t("title"),
    description: t("description"),
  });
}

export default async function PrivacyPolicyPage() {
  const t = await getTranslations("privacy");

  return (
    <ContentPage title={t("title")}>
      <ContentParagraph>{t("intro")}</ContentParagraph>

      <ContentSection heading={t("controller.heading")}>
        <ContentParagraph>{t("controller.legalName")}</ContentParagraph>
        <ContentParagraph>{t("controller.address")}</ContentParagraph>
        <ContentParagraph>{t("controller.contactEmail")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("collected.heading")}>
        <ContentList
          items={[
            t("collected.contact"),
            t("collected.address"),
            t("collected.order"),
            t("collected.payment"),
            t("collected.review"),
            t("collected.technical"),
          ]}
        />
        <ContentParagraph>{t("collected.noAccount")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("purpose.heading")}>
        <ContentParagraph>{t("purpose.body")}</ContentParagraph>
        <ContentParagraph>{t("purpose.noMarketing")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("sharing.heading")}>
        <ContentParagraph>{t("sharing.payment")}</ContentParagraph>
        <ContentParagraph>{t("sharing.courier")}</ContentParagraph>
        <ContentParagraph>{t("sharing.noSale")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("retention.heading")}>
        <ContentParagraph>{t("retention.orders")}</ContentParagraph>
        <ContentParagraph>{t("retention.reviews")}</ContentParagraph>
        <ContentParagraph>{t("retention.technical")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("rights.heading")}>
        <ContentParagraph>{t("rights.body")}</ContentParagraph>
      </ContentSection>
    </ContentPage>
  );
}
