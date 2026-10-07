import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContentPage, ContentParagraph, ContentSection } from "@/components/content/ContentPage";
import { asAppLocale } from "@/i18n/pathnames";
import { routeMetadata } from "@/infrastructure/seo/metadata";

/**
 * Syarat & Ketentuan / Terms (FR-068, spec D-003). Store legal name, address
 * and contact email are PLACEHOLDER values until the client supplies them;
 * replacing them is a release blocker on the quickstart.md checklist.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("terms.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/syarat-ketentuan",
    title: t("title"),
    description: t("description"),
  });
}

export default async function TermsPage() {
  const t = await getTranslations("terms");

  return (
    <ContentPage title={t("title")}>
      <ContentParagraph>{t("intro")}</ContentParagraph>

      <ContentSection heading={t("seller.heading")}>
        <ContentParagraph>{t("seller.legalName")}</ContentParagraph>
        <ContentParagraph>{t("seller.address")}</ContentParagraph>
        <ContentParagraph>{t("seller.contactEmail")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("orders.heading")}>
        <ContentParagraph>{t("orders.formation")}</ContentParagraph>
        <ContentParagraph>{t("orders.stock")}</ContentParagraph>
        <ContentParagraph>{t("orders.expiry")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("pricing.heading")}>
        <ContentParagraph>{t("pricing.currency")}</ContentParagraph>
        <ContentParagraph>{t("pricing.shipping")}</ContentParagraph>
        <ContentParagraph>{t("pricing.cod")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("cancellation.heading")}>
        <ContentParagraph>{t("cancellation.body")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("reviews.heading")}>
        <ContentParagraph>{t("reviews.body")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("liability.heading")}>
        <ContentParagraph>{t("liability.body")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("changes.heading")}>
        <ContentParagraph>{t("changes.body")}</ContentParagraph>
      </ContentSection>
    </ContentPage>
  );
}
