import { CodUnavailableError } from "../errors";
import type { ShippingProvider, ShippingQuote, ShippingQuoteInput } from "./provider";

/**
 * The shape FlatZoneShippingProvider needs — satisfied by the real,
 * zod-validated config built in Phase 2B (src/config/shipping.config.ts).
 * Kept local so this pure domain class never imports the config loader.
 */
export interface FlatZoneShippingConfig {
  pairsPerKg: number;
  /** Province code -> IDR rate per billable kilogram. */
  zoneRatesIDR: Readonly<Record<string, number>>;
  codDisabledProvinces: readonly string[];
}

export class FlatZoneShippingProvider implements ShippingProvider {
  constructor(private readonly config: FlatZoneShippingConfig) {}

  isCodAvailable(provinceCode: string): boolean {
    return !this.config.codDisabledProvinces.includes(provinceCode);
  }

  calculate(input: ShippingQuoteInput): ShippingQuote {
    const { provinceCode, quantity, paymentMethod } = input;

    if (paymentMethod === "COD" && !this.isCodAvailable(provinceCode)) {
      throw new CodUnavailableError(provinceCode);
    }

    const rate = this.config.zoneRatesIDR[provinceCode];
    if (rate === undefined) {
      throw new Error(`No shipping rate configured for province ${provinceCode}`);
    }

    const billableWeightKg = Math.ceil(quantity / this.config.pairsPerKg);
    const shippingCost = rate * billableWeightKg;

    return { shippingCost, billableWeightKg };
  }
}
