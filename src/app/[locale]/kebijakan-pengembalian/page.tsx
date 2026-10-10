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
 * Kebijakan Pengembalian / Return Policy (FR-068, FR-060a, ADR-0002, spec
 * Q-003). The refund section says plainly that refunds for online payments
 * are handled by hand: the system records a free-text refund reference and
 * makes no refund API call, so promising an automatic refund here would be a
 * claim the software does not keep. The return window is 7 days; the
 * contact email is PLACEHOLDER until the client supplies it.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("returns.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/kebijakan-pengembalian",
    title: t("title"),
    description: t("description"),
  });
}

export default async function ReturnPolicyPage() {
  const t = await getTranslations("returns");

  return (
    <ContentPage title={t("title")}>
      <ContentParagraph>{t("intro")}</ContentParagraph>

      <ContentSection heading={t("window.heading")}>
        <ContentParagraph>{t("window.body")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("eligibility.heading")}>
        <ContentList items={[t("eligibility.e1"), t("eligibility.e2"), t("eligibility.e3")]} />
      </ContentSection>

      <ContentSection heading={t("how.heading")}>
        <ContentList items={[t("how.s1"), t("how.s2"), t("how.s3")]} />
      </ContentSection>

      <ContentSection heading={t("refunds.heading")}>
        <ContentParagraph>{t("refunds.manual")}</ContentParagraph>
        <ContentParagraph>{t("refunds.cod")}</ContentParagraph>
        <ContentParagraph>{t("refunds.timing")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("cancellation.heading")}>
        <ContentParagraph>{t("cancellation.body")}</ContentParagraph>
      </ContentSection>

      <ContentSection heading={t("contact.heading")}>
        <ContentParagraph>{t("contact.body")}</ContentParagraph>
      </ContentSection>
    </ContentPage>
  );
}
