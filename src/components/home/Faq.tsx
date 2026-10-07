import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Icon } from "@/components/ui/Icon";
import { localeHref } from "@/i18n/pathnames";
import type { AppLocale } from "@/i18n/routing";
import { faqItems, faqPageJsonLd } from "./faq-items";

/**
 * FR-023 to FR-025, implementing research.md R-005.
 *
 * Native <details>/<summary>: each item expands and collapses on its own with
 * no JavaScript at all (FR-024, A-006), is keyboard operable and is announced
 * correctly by screen readers — an ARIA accordion would be more code for none
 * of that.
 *
 * The FAQPage JSON-LD is built by mapping over the same list that renders the
 * visible items — see faq-items.ts, which owns both the list and the builder.
 * That is what makes FR-025's "matches the questions and answers actually
 * displayed" structural rather than a convention someone has to remember:
 * there is one list, so the markup and the structured data cannot drift apart.
 */

export async function Faq({ locale }: { locale: AppLocale }) {
  const [t, tSteps] = await Promise.all([getTranslations("faq"), getTranslations("home.steps")]);

  const items = faqItems(t);
  const jsonLd = faqPageJsonLd(items);

  return (
    <section aria-labelledby="home-faq" className="py-10 lg:py-16">
      <script
        type="application/ld+json"
        // The payload is built here from translation values, not from user
        // input; JSON.stringify is the serialiser, not a sanitiser.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Container size="prose">
        <SectionHeader
          id="home-faq"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <ul className="border-border border-t">
          {items.map(({ key, question, answer }) => (
            <li key={key}>
              <details className="group border-border border-b">
                <summary className="text-ink flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 text-base font-semibold [&::-webkit-details-marker]:hidden">
                  {question}
                  {/* A state indicator, not a hover transform; the reduced-motion
                      backstop turns its transition off. */}
                  <Icon
                    name="chevronDown"
                    className="text-ink-2 h-5 w-5 shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
                  />
                </summary>
                <p className="text-ink-2 pb-4 text-base">{answer}</p>
              </details>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <ButtonLink href={localeHref("/cara-pemesanan", locale)} variant="link">
            {tSteps("link")}
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
