/**
 * The homepage benefit band's four items (R-208). Each leaf names an icon in
 * BenefitsStrip, a title under `home.benefitTitles.<leaf>` and a sentence under
 * `home.benefits.<leaf>`. This is homepage marketing copy, not product data, so
 * it no longer reads the catalogue's highlights (Principle III).
 */
export const HOME_BENEFIT_KEYS = ["empukNyaman", "antiSlip", "designLucu", "allSize"] as const;
export type HomeBenefitKey = (typeof HOME_BENEFIT_KEYS)[number];
