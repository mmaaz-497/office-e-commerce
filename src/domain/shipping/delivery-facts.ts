/**
 * The provinces where cash on delivery is unavailable, by name, for the
 * homepage payment and delivery facts (research R-512). Names follow the order
 * of `provinces`; a code with no matching province is skipped. Province names
 * are proper nouns and are not translated.
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export function codUnavailableProvinceNames(
  codDisabledProvinces: readonly string[],
  provinces: ReadonlyArray<{ code: string; name: string }>,
): string[] {
  const disabled = new Set(codDisabledProvinces);
  return provinces.filter((province) => disabled.has(province.code)).map((p) => p.name);
}
