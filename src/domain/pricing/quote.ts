import type { IDR } from "../money";
import type { PaymentMethod } from "../order/status";
import type { ShippingProvider } from "../shipping/provider";

export interface PriceBreakdown {
  unitPrice: IDR;
  quantity: number;
  subtotal: IDR;
  shippingCost: IDR;
  billableWeightKg: number;
  total: IDR;
}

export interface QuoteOrderInput {
  /**
   * MUST come from the server-side catalogue, never from client-supplied
   * request data (FR-013) — deliberately explicit here rather than read
   * internally, since src/domain must not perform file I/O; the caller is
   * responsible for sourcing it from the trusted catalogue.
   */
  unitPrice: IDR;
  quantity: number;
  provinceCode: string;
  paymentMethod: PaymentMethod;
  shipping: ShippingProvider;
}

/**
 * Computes the breakdown from the authoritative unit price + shipping
 * provider only. Accepts no client-supplied amount (FR-013).
 */
export function quoteOrder(input: QuoteOrderInput): PriceBreakdown {
  const { unitPrice, quantity, provinceCode, paymentMethod, shipping } = input;

  const subtotal = unitPrice * quantity;
  const { shippingCost, billableWeightKg } = shipping.calculate({
    provinceCode,
    quantity,
    paymentMethod,
  });
  // COD is free: the payment method changes availability, never the total.
  const total = subtotal + shippingCost;

  return { unitPrice, quantity, subtotal, shippingCost, billableWeightKg, total };
}

/** Guards the snapshot invariant on every write (FR-018). */
export function assertTotalsConsistent(b: PriceBreakdown): void {
  const expectedSubtotal = b.unitPrice * b.quantity;
  const expectedTotal = expectedSubtotal + b.shippingCost;

  if (b.subtotal !== expectedSubtotal || b.total !== expectedTotal) {
    throw new Error(
      `Order totals are inconsistent: subtotal=${b.subtotal} (expected ${expectedSubtotal}), ` +
        `total=${b.total} (expected ${expectedTotal})`,
    );
  }
}
