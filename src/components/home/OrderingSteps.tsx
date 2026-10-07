import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";

/**
 * FR-022: a four-step summary that links out to the full Cara Pemesanan page.
 *
 * A summary, not a second copy — the authoritative wording lives on
 * /cara-pemesanan, and these four cards restate the same flow in one line
 * each. The link is what keeps them a summary rather than a fork.
 */
const STEPS: ReadonlyArray<{ key: string; icon: IconName }> = [
  { key: "s1", icon: "cart" },
  { key: "s2", icon: "address" },
  { key: "s3", icon: "wallet" },
  { key: "s4", icon: "package" },
];

export async function OrderingSteps({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("home.steps");

  return (
    <section aria-labelledby="home-steps" className="py-8 lg:py-12">
      <Container>
        <SectionHeader
          id="home-steps"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {STEPS.map(({ key, icon }, index) => (
            <li key={key} className="bg-surface border-border rounded-md border p-4">
              <div className="flex items-center gap-3">
                <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-md">
                  <Icon name={icon} className="h-5 w-5" />
                </span>
                <span className="text-accent-strong text-base font-semibold tabular-nums">
                  {index + 1}
                </span>
              </div>
              <h3 className="text-ink mt-3 text-base font-semibold">{t(`${key}.title`)}</h3>
              <p className="text-ink-2 mt-1 text-sm">{t(`${key}.body`)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4">
          <ButtonLink href={localeHref("/cara-pemesanan", locale)} variant="link">
            {t("link")}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
