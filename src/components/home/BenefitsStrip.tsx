import { getTranslations } from "next-intl/server";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon, type IconName } from "@/components/ui/Icon";
import { HOME_BENEFIT_KEYS, type HomeBenefitKey } from "./benefit-keys";

/**
 * FR-014: the homepage benefit band. Since 003 it is homepage copy rather than
 * product data (research R-208): each item has an icon here, a title under
 * `home.benefitTitles.<key>` and a sentence under `home.benefits.<key>`. The
 * titles carry the same text the product page's highlights did at import.
 */
const ICONS: Record<HomeBenefitKey, IconName> = {
  empukNyaman: "cushion",
  antiSlip: "grip",
  designLucu: "sparkle",
  allSize: "ruler",
};

export async function BenefitsStrip() {
  const [tTitles, tHome] = await Promise.all([
    getTranslations("home.benefitTitles"),
    getTranslations("home.benefits"),
  ]);

  return (
    <section aria-labelledby="home-benefits" className="py-8 lg:py-12">
      <Container>
        <SectionHeader
          id="home-benefits"
          eyebrow={tHome("eyebrow")}
          title={tHome("title")}
          subtitle={tHome("subtitle")}
        />

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
          {HOME_BENEFIT_KEYS.map((leaf) => (
            <li
              key={leaf}
              className="bg-surface border-border flex items-start gap-3 rounded-md border p-4"
            >
              <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
                <Icon name={ICONS[leaf]} className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-ink text-base font-semibold">{tTitles(leaf)}</h3>
                <p className="text-ink-2 mt-1 text-sm">{tHome(leaf)}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
