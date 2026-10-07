/**
 * A client-safe live order-summary preview. Imports shipping.config.ts
 * DIRECTLY (pure static data + zod schema, no process.env access) rather
 * than through src/config/index.ts, which eagerly validates environment
 * secrets and must never be pulled into a browser bundle. The authoritative
 * total is always recomputed server-side by submitCheckout (FR-013); this is
 * a preview only, never sent back as an amount.
 */
import { rawShippingConfig, shippingConfigSchema } from "@/config/shipping.config";
import { FlatZoneShippingProvider } from "./flat-zone-provider";
import { quoteOrder, type PriceBreakdown } from "../pricing/quote";
import type { PaymentMethod } from "../order/status";

const parsedShippingConfig = shippingConfigSchema.parse(rawShippingConfig);
const zoneRatesIDR = Object.fromEntries(
  Object.entries(parsedShippingConfig.zones).map(([code, zone]) => [code, zone.rateIDR]),
);

const clientShippingProvider = new FlatZoneShippingProvider({
  pairsPerKg: parsedShippingConfig.pairsPerKg,
  zoneRatesIDR,
  codFeeIDR: parsedShippingConfig.codFeeIDR,
  codDisabledProvinces: parsedShippingConfig.codDisabledProvinces,
});

export function liveQuote(args: {
  unitPrice: number;
  quantity: number;
  provinceCode: string;
  paymentMethod: PaymentMethod;
}): PriceBreakdown {
  return quoteOrder({ ...args, shipping: clientShippingProvider });
}

export function isCodAvailable(provinceCode: string): boolean {
  return clientShippingProvider.isCodAvailable(provinceCode);
}
