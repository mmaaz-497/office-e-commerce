"use server";

import { checkoutInputSchema } from "./schemas";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderWithRetry } from "@/infrastructure/db/create-order";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { MidtransProvider } from "@/infrastructure/payment/midtrans-provider";
import { shippingProvider as shipping } from "@/infrastructure/shipping/provider";
import { quoteOrder, assertTotalsConsistent } from "@/domain/pricing/quote";
import { normalizePhone } from "@/domain/phone";
import { CodUnavailableError } from "@/domain/errors";
import { isOnSale } from "@/domain/catalogue/status";
import { getProductStock, resolveCheckoutProduct } from "@/infrastructure/db/catalogue";
import regions from "@/data/regions.id.json";

const EXPIRY_HOURS = 24;

export type CheckoutResult =
  | {
      ok: true;
      orderNumber: string;
      paymentMethod: "ONLINE" | "COD";
      snapToken?: string;
      snapRedirectUrl?: string;
    }
  | { ok: false; errorKey: string; available?: number };

/**
 * Resolves the product on the server, re-checks its stock, quotes
 * server-side, creates the order with its snapshot and an initial status
 * event in one transaction, and — for ONLINE — creates the Snap session from
 * the snapshot amount. Never trusts a client amount (FR-013): quantity is the
 * only checkout-relevant number the client supplies, and it is validated as a
 * plain positive integer, not a price. The product's price and stock come from
 * the database row the slug names (003 FR-014–FR-017).
 */
export async function submitCheckout(rawInput: unknown): Promise<CheckoutResult> {
  const parsed = checkoutInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: "errors.validation" };
  }
  const input = parsed.data;

  // Resolved before anything else: a product that is not on sale gets no
  // order and no payment session (contracts/checkout.md step 2). The order
  // snapshot keeps the Indonesian name, the store's operating language.
  const resolution = await resolveCheckoutProduct(input.productSlug, "id");
  if (resolution.kind !== "ok" || !isOnSale(resolution.product)) {
    return { ok: false, errorKey: "errors.productUnavailable" };
  }
  const catalogueProduct = resolution.product;
  const unitPrice = catalogueProduct.priceIDR!;

  const city = regions.cities.find((c) => c.code === input.cityCode);
  const province = regions.provinces.find((p) => p.code === input.provinceCode);
  if (!city || !province) {
    // Already validated by checkoutInputSchema's superRefine — reaching here
    // would mean the schema and this lookup have drifted apart.
    return { ok: false, errorKey: "errors.unknownCity" };
  }

  // First re-check: stock availability at submission (FR-034, FR-037). A
  // missing stock row is zero stock, logged, rather than a raw database error.
  const stockAtSubmission = await getProductStock(catalogueProduct.id);
  if (stockAtSubmission < input.quantity) {
    return {
      ok: false,
      errorKey: "errors.insufficientStock",
      available: stockAtSubmission,
    };
  }

  let breakdown;
  try {
    breakdown = quoteOrder({
      unitPrice,
      quantity: input.quantity,
      provinceCode: input.provinceCode,
      paymentMethod: input.paymentMethod,
      shipping,
    });
  } catch (err) {
    if (err instanceof CodUnavailableError) {
      return { ok: false, errorKey: err.messageKey };
    }
    throw err;
  }
  assertTotalsConsistent(breakdown);

  const phoneNormalized = normalizePhone(input.phone);
  const initialStatus = input.paymentMethod === "ONLINE" ? "PENDING_PAYMENT" : "COD_PENDING";
  const expiresAt =
    input.paymentMethod === "ONLINE" ? new Date(Date.now() + EXPIRY_HOURS * 60 * 60 * 1000) : null;

  const order = await prisma.$transaction(async (tx) => {
    const created = await createOrderWithRetry(
      {
        status: initialStatus,
        paymentMethod: input.paymentMethod,
        product: { connect: { id: catalogueProduct.id } },
        productNameSnapshot: catalogueProduct.name,
        customerName: input.name,
        phone: input.phone,
        phoneNormalized,
        email: input.email,
        provinceCode: input.provinceCode,
        provinceName: province.name,
        cityCode: input.cityCode,
        cityName: city.name,
        district: input.district,
        postalCode: input.postalCode,
        streetAddress: input.streetAddress,
        note: input.note,
        quantity: input.quantity,
        unitPriceIDR: breakdown.unitPrice,
        shippingCostIDR: breakdown.shippingCost,
        codFeeIDR: breakdown.codFee,
        totalIDR: breakdown.total,
        billableWeightKg: breakdown.billableWeightKg,
        expiresAt,
      },
      {},
      tx,
    );
    await tx.orderStatusEvent.create({
      data: { orderId: created.id, fromStatus: null, toStatus: initialStatus, actor: "CUSTOMER" },
    });
    return created;
  });

  if (input.paymentMethod === "COD") {
    return { ok: true, orderNumber: order.orderNumber, paymentMethod: "COD" };
  }

  // Second re-check: immediately before payment session creation (FR-034).
  // A stock change in this window aborts before a Snap token is created —
  // the just-created order is cancelled rather than left an orphaned,
  // unpayable PENDING_PAYMENT row the customer was never shown.
  const stockBeforePayment = await getProductStock(catalogueProduct.id);
  if (stockBeforePayment < order.quantity) {
    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.applyStatus({
        orderNumber: order.orderNumber,
        expectedStatus: "PENDING_PAYMENT",
        nextStatus: "CANCELLED",
        actor: "SYSTEM",
        note: "Stock became insufficient before the payment session was created",
      });
    });
    return {
      ok: false,
      errorKey: "errors.insufficientStock",
      available: stockBeforePayment,
    };
  }

  const paymentProvider = new MidtransProvider();
  let session;
  try {
    session = await paymentProvider.createCheckoutSession({
      providerOrderId: order.orderNumber,
      grossAmount: order.totalIDR,
      expiryHours: EXPIRY_HOURS,
      customer: {
        name: order.customerName,
        phone: order.phone,
        email: order.email ?? undefined,
      },
    });
  } catch (err) {
    // Midtrans refused the session — rejected credentials, a malformed request
    // or provider downtime. The order cannot ever be paid, so cancel it here
    // for the same reason the stock re-check above does: never leave the
    // customer an orphaned, unpayable PENDING_PAYMENT row. The vendor error
    // carries merchant detail, so it is logged rather than returned.
    console.error(
      `Midtrans rejected the payment session for ${order.orderNumber}. ` +
        "Check MIDTRANS_SERVER_KEY/MIDTRANS_CLIENT_KEY and MIDTRANS_IS_PRODUCTION.",
      err,
    );
    await prisma.$transaction(async (tx) => {
      const port = createOrderTransactionPort(tx);
      await port.applyStatus({
        orderNumber: order.orderNumber,
        expectedStatus: "PENDING_PAYMENT",
        nextStatus: "CANCELLED",
        actor: "SYSTEM",
        note: "Payment session could not be created",
      });
    });
    return { ok: false, errorKey: "errors.paymentProviderUnavailable" };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { midtransOrderId: order.orderNumber },
  });

  return {
    ok: true,
    orderNumber: order.orderNumber,
    paymentMethod: "ONLINE",
    snapToken: session.token,
    snapRedirectUrl: session.redirectUrl,
  };
}
