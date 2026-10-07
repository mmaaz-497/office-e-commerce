import { describe, expect, it } from "vitest";
import { codUnavailableProvinceNames } from "@/domain/shipping/delivery-facts";
import { rawShippingConfig } from "@/config/shipping.config";
import regions from "@/data/regions.id.json";

/**
 * 006 T015 — the homepage COD fact comes from configuration (research R-512).
 */

describe("codUnavailableProvinceNames", () => {
  it("resolves the configured Papua codes to their six names, in regions order", () => {
    expect(
      codUnavailableProvinceNames(rawShippingConfig.codDisabledProvinces, regions.provinces),
    ).toEqual([
      "Papua",
      "Papua Barat",
      "Papua Selatan",
      "Papua Tengah",
      "Papua Pegunungan",
      "Papua Barat Daya",
    ]);
  });

  it("follows provinces order, not config order", () => {
    expect(codUnavailableProvinceNames(["92", "91"], regions.provinces)).toEqual([
      "Papua",
      "Papua Barat",
    ]);
  });

  it("an empty list returns []", () => {
    expect(codUnavailableProvinceNames([], regions.provinces)).toEqual([]);
  });

  it("skips an unknown code", () => {
    expect(codUnavailableProvinceNames(["91", "00"], regions.provinces)).toEqual(["Papua"]);
  });
});
