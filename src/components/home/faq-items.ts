/**
 * The FAQ's one list, and the JSON-LD built from it.
 *
 * Both live here rather than inside Faq.tsx so the structural guarantee behind
 * FR-025 — that the FAQPage structured data matches the questions actually
 * displayed — is testable directly: the component renders `FAQ_ITEM_KEYS` and
 * emits `faqPageJsonLd(...)` over the same array, and a test can assert the two
 * agree without needing to render React (research.md R-005).
 */

export const FAQ_ITEM_KEYS = [
  // FR-023 names these four as the minimum.
  "cod",
  "ongkir",
  "ukuran",
  "pengembalian",
  // Added beyond the minimum; both restate rules feature 001 already enforces.
  "lacak",
  "akun",
] as const;

export type FaqItemKey = (typeof FAQ_ITEM_KEYS)[number];

export type FaqItem = {
  key: FaqItemKey;
  question: string;
  answer: string;
};

/** Resolves the list against a translator scoped to the `faq` namespace. */
export function faqItems(t: (key: string) => string): FaqItem[] {
  return FAQ_ITEM_KEYS.map((key) => ({
    key,
    question: t(`items.${key}.q`),
    answer: t(`items.${key}.a`),
  }));
}

export function faqPageJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}
