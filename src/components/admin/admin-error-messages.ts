import { getAdminTranslations } from "@/i18n/admin";

/**
 * Admin client components cannot call useTranslations directly — the admin
 * route tree sits outside [locale]/layout.tsx's NextIntlClientProvider (it is
 * deliberately non-localised). Server components resolve every error key the
 * client might see up front and pass the resolved strings down as props.
 */
const ERROR_KEYS = [
  "insufficientStock",
  "codUnavailable",
  "validation",
  "unknownCity",
  "unknownProvince",
  "invalidPostalCode",
  "cityProvinceMismatch",
  "invalidTransition",
  "rateLimited",
  "orderLookupFailed",
  "reviewNotEligible",
  "duplicateReview",
  "unauthorized",
  "fulfilmentConflict",
  "paymentProviderUnreachable",
  "invalidCredentials",
  "productChanged",
  "stockChanged",
  "statusLocked",
  "slugLocked",
  "sampleStatusLocked",
  "sampleStockLocked",
  "unpublishNeedsConfirmation",
] as const;

export async function getAdminErrorMessages(): Promise<Record<string, string>> {
  const t = await getAdminTranslations("errors");
  const messages: Record<string, string> = {};
  for (const key of ERROR_KEYS) {
    messages[`errors.${key}`] = t(key, { current: 0, available: 0 });
  }
  return messages;
}
