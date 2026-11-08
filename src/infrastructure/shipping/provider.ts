import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";
import { shippingConfig } from "@/config";

/**
 * Adapts the validated shippingConfig (zones: { code: { rateIDR } }) to the
 * shape FlatZoneShippingProvider's pure domain constructor expects
 * (zoneRatesIDR: { code: number }) — the one place this mapping happens.
 */
function buildShippingProvider(): FlatZoneShippingProvider {
  const zoneRatesIDR = Object.fromEntries(
    Object.entries(shippingConfig.zones).map(([code, zone]) => [code, zone.rateIDR]),
  );
  return new FlatZoneShippingProvider({
    pairsPerKg: shippingConfig.pairsPerKg,
    zoneRatesIDR,
    codDisabledProvinces: shippingConfig.codDisabledProvinces,
    freeShipping: shippingConfig.freeShipping,
  });
}

export const shippingProvider = buildShippingProvider();
