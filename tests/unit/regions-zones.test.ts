import { describe, expect, it } from "vitest";
import { rawShippingConfig } from "@/config/shipping.config";
import regions from "@/data/regions.id.json";

/**
 * A missing regency means a real customer cannot check out (research R-014,
 * named risk). This test is the guard, checked in both directions.
 */
describe("shipping zones <-> regions dataset cross-check", () => {
  const zoneCodes = new Set(Object.keys(rawShippingConfig.zones));
  const provinceCodes = new Set(regions.provinces.map((p) => p.code));

  it("every zone-config province code resolves in the regions dataset", () => {
    const missing = [...zoneCodes].filter((code) => !provinceCodes.has(code));
    expect(missing).toEqual([]);
  });

  it("every province in the regions dataset has a zone rate configured", () => {
    const missing = [...provinceCodes].filter((code) => !zoneCodes.has(code));
    expect(missing).toEqual([]);
  });

  it("both sides agree on exactly 38 provinces", () => {
    expect(zoneCodes.size).toBe(38);
    expect(provinceCodes.size).toBe(38);
  });

  it("every city's provinceCode resolves to a real province", () => {
    const orphans = regions.cities.filter((c) => !provinceCodes.has(c.provinceCode));
    expect(orphans).toEqual([]);
  });
});
