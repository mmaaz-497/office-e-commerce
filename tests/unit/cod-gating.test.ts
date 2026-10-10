import { describe, expect, it } from "vitest";
import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";
import { CodUnavailableError } from "@/domain/errors";

const provider = new FlatZoneShippingProvider({
  pairsPerKg: 2,
  zoneRatesIDR: { JK: 10000, PP: 20000 },
  codDisabledProvinces: ["PP"],
});

describe("COD gating", () => {
  it("charges COD exactly the same as online — COD is free", () => {
    const online = provider.calculate({ provinceCode: "JK", quantity: 2, paymentMethod: "ONLINE" });
    const cod = provider.calculate({ provinceCode: "JK", quantity: 2, paymentMethod: "COD" });

    expect(cod).toEqual(online);
    expect(cod).not.toHaveProperty("codFee");
  });

  it("isCodAvailable is false for every configured disabled province", () => {
    expect(provider.isCodAvailable("PP")).toBe(false);
    expect(provider.isCodAvailable("JK")).toBe(true);
  });

  it("throws CodUnavailableError for a disabled province with COD selected", () => {
    expect(() =>
      provider.calculate({ provinceCode: "PP", quantity: 1, paymentMethod: "COD" }),
    ).toThrow(CodUnavailableError);
  });

  it("does not throw for a disabled province when paying online", () => {
    expect(() =>
      provider.calculate({ provinceCode: "PP", quantity: 1, paymentMethod: "ONLINE" }),
    ).not.toThrow();
  });
});
