import { describe, expect, it } from "vitest";
import { rawShippingConfig, shippingConfigSchema } from "@/config/shipping.config";
import { CodUnavailableError } from "@/domain/errors";
import { quoteOrder, assertTotalsConsistent } from "@/domain/pricing/quote";
import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";
import { liveQuote } from "@/domain/shipping/client-quote";
import regions from "@/data/regions.id.json";

const UNIT_PRICE = 184999;

const freeShipping = new FlatZoneShippingProvider({
  pairsPerKg: 2,
  zoneRatesIDR: { JK: 10000, PP: 20000 },
  codDisabledProvinces: ["PP"],
  freeShipping: true,
});

describe("FlatZoneShippingProvider with freeShipping", () => {
  for (const paymentMethod of ["COD", "ONLINE"] as const) {
    it(`charges Rp 0 via ${paymentMethod}, whatever the quantity`, () => {
      for (let quantity = 1; quantity <= 10; quantity++) {
        const quote = freeShipping.calculate({ provinceCode: "JK", quantity, paymentMethod });
        expect(quote.shippingCost).toBe(0);
        // The weight is still recorded for the courier.
        expect(quote.billableWeightKg).toBe(Math.ceil(quantity / 2));
      }
    });
  }

  it("makes the order total exactly the item price", () => {
    const quote = quoteOrder({
      unitPrice: UNIT_PRICE,
      quantity: 3,
      provinceCode: "JK",
      paymentMethod: "COD",
      shipping: freeShipping,
    });
    expect(quote.shippingCost).toBe(0);
    expect(quote.total).toBe(UNIT_PRICE * 3);
    expect(() => assertTotalsConsistent(quote)).not.toThrow();
  });

  it("still refuses COD where it is not offered, and unknown provinces", () => {
    expect(() =>
      freeShipping.calculate({ provinceCode: "PP", quantity: 1, paymentMethod: "COD" }),
    ).toThrow(CodUnavailableError);
    expect(
      freeShipping.calculate({ provinceCode: "PP", quantity: 1, paymentMethod: "ONLINE" })
        .shippingCost,
    ).toBe(0);
    expect(() =>
      freeShipping.calculate({ provinceCode: "XX", quantity: 1, paymentMethod: "ONLINE" }),
    ).toThrow(/No shipping rate/);
  });
});

describe("the store's shipping config", () => {
  it("is free shipping (the site copy says so)", () => {
    // The FAQ, homepage, footer, How to Order, Terms and page descriptions all
    // say shipping is free. Turning this off means rewriting that copy too.
    expect(shippingConfigSchema.parse(rawShippingConfig).freeShipping).toBe(true);
  });

  it("quotes Rp 0 shipping for every province the store delivers to, COD and online", () => {
    const { codDisabledProvinces } = rawShippingConfig;
    for (const province of regions.provinces) {
      const methods = (codDisabledProvinces as readonly string[]).includes(province.code)
        ? (["ONLINE"] as const)
        : (["ONLINE", "COD"] as const);
      for (const paymentMethod of methods) {
        const quote = liveQuote({
          unitPrice: UNIT_PRICE,
          quantity: 2,
          provinceCode: province.code,
          paymentMethod,
        });
        expect(quote.shippingCost, `${province.name} via ${paymentMethod}`).toBe(0);
        expect(quote.total).toBe(UNIT_PRICE * 2);
      }
    }
  });
});
