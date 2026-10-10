import { describe, expect, it } from "vitest";
import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";

const provider = new FlatZoneShippingProvider({
  pairsPerKg: 2,
  zoneRatesIDR: { JK: 10000 },
  codDisabledProvinces: [],
});

describe("billable weight rounding (pairsPerKg: 2)", () => {
  // Rounding up is the defect people ship — assert it directly, especially
  // the odd quantities where floor/round-half would silently undercharge.
  const cases: Array<[quantity: number, expectedKg: number]> = [
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [10, 5],
  ];

  it.each(cases)("quantity %i rounds up to %i kg", (quantity, expectedKg) => {
    const quote = provider.calculate({
      provinceCode: "JK",
      quantity,
      paymentMethod: "ONLINE",
    });
    expect(quote.billableWeightKg).toBe(expectedKg);
    expect(quote.shippingCost).toBe(10000 * expectedKg);
  });
});
