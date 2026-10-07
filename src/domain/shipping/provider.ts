import type { IDR } from "../money";
import type { PaymentMethod } from "../order/status";

export interface ShippingQuoteInput {
  provinceCode: string;
  quantity: number;
  paymentMethod: PaymentMethod;
}

export interface ShippingQuote {
  shippingCost: IDR;
  codFee: IDR;
  /** Quantity ÷ pairsPerKg, rounded UP to a whole kilogram (FR-007). */
  billableWeightKg: number;
}

/**
 * The seam Principle X mandates. Exactly one implementation today
 * (FlatZoneShippingProvider); a courier-rate provider would implement the
 * same interface without touching any caller.
 */
export interface ShippingProvider {
  calculate(input: ShippingQuoteInput): ShippingQuote;
  /** False for provinces in codDisabledProvinces (FR-010). */
  isCodAvailable(provinceCode: string): boolean;
}
