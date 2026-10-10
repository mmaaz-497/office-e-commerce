import { describe, expect, it } from "vitest";
import { quoteOrder, assertTotalsConsistent, type PriceBreakdown } from "@/domain/pricing/quote";
import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";

const UNIT_PRICE = 169999;

const shipping = new FlatZoneShippingProvider({
  pairsPerKg: 2,
  zoneRatesIDR: { JK: 10000, JB: 15000, PP: 20000 },
  codDisabledProvinces: ["PP"],
});

describe("quoteOrder", () => {
  const zones = ["JK", "JB"];
  const quantities = Array.from({ length: 10 }, (_, i) => i + 1);

  for (const zone of zones) {
    for (const quantity of quantities) {
      for (const paymentMethod of ["ONLINE", "COD"] as const) {
        it(`quantity ${quantity} in ${zone} via ${paymentMethod} has correct arithmetic`, () => {
          const quote = quoteOrder({
            unitPrice: UNIT_PRICE,
            quantity,
            provinceCode: zone,
            paymentMethod,
            shipping,
          });

          expect(quote.subtotal).toBe(UNIT_PRICE * quantity);
          // COD is free: the total never depends on the payment method.
          expect(quote.total).toBe(quote.subtotal + quote.shippingCost);

          for (const value of [
            quote.unitPrice,
            quote.quantity,
            quote.subtotal,
            quote.shippingCost,
            quote.billableWeightKg,
            quote.total,
          ]) {
            expect(Number.isInteger(value)).toBe(true);
          }
        });
      }
    }
  }

  it("assertTotalsConsistent accepts a correct breakdown", () => {
    const quote = quoteOrder({
      unitPrice: UNIT_PRICE,
      quantity: 3,
      provinceCode: "JK",
      paymentMethod: "ONLINE",
      shipping,
    });
    expect(() => assertTotalsConsistent(quote)).not.toThrow();
  });

  it("assertTotalsConsistent rejects a tampered total", () => {
    const quote = quoteOrder({
      unitPrice: UNIT_PRICE,
      quantity: 3,
      provinceCode: "JK",
      paymentMethod: "ONLINE",
      shipping,
    });
    const tampered: PriceBreakdown = { ...quote, total: quote.total - 1 };
    expect(() => assertTotalsConsistent(tampered)).toThrow();
  });

  it("assertTotalsConsistent rejects a tampered subtotal", () => {
    const quote = quoteOrder({
      unitPrice: UNIT_PRICE,
      quantity: 3,
      provinceCode: "JK",
      paymentMethod: "ONLINE",
      shipping,
    });
    const tampered: PriceBreakdown = { ...quote, subtotal: quote.subtotal + 1000 };
    expect(() => assertTotalsConsistent(tampered)).toThrow();
  });
});
