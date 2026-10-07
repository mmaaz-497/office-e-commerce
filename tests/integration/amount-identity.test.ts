import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel } from "./helpers/db";

const { mockPaymentProvider } = vi.hoisted(() => ({
  mockPaymentProvider: {
    createCheckoutSession: vi.fn(),
    verifyNotificationSignature: vi.fn(),
    fetchTransactionStatus: vi.fn(),
  },
}));

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

/**
 * SC-002: order summary total === Order.totalIDR === the gross_amount sent
 * to the payment provider, for every quantity/zone/paymentMethod combination
 * (research R-006 — all amount reads come from the snapshot).
 */
describe("three-way amount identity (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(1000);
    mockPaymentProvider.createCheckoutSession.mockReset().mockResolvedValue({
      token: "mock-snap-token",
      redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/mock",
    });
  });

  afterEach(async () => {
    await resetDb();
  });

  const zones: Array<{ provinceCode: string; cityCode: string }> = [
    { provinceCode: "31", cityCode: "3171" },
    { provinceCode: "32", cityCode: "3201" },
  ];
  const quantities = Array.from({ length: 10 }, (_, i) => i + 1);
  const paymentMethods = ["ONLINE", "COD"] as const;

  for (const zone of zones) {
    for (const quantity of quantities) {
      for (const paymentMethod of paymentMethods) {
        it(`quantity ${quantity} in ${zone.provinceCode} via ${paymentMethod} — amounts agree`, async () => {
          const { submitCheckout } = await import("@/app/actions/checkout");
          const result = await submitCheckout({
            quantity,
            name: "Test Customer",
            phone: "081234567890",
            provinceCode: zone.provinceCode,
            cityCode: zone.cityCode,
            district: "Test District",
            postalCode: "12345",
            streetAddress: "Jl. Test No. 1",
            paymentMethod,
          });

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const order = await prisma.order.findUniqueOrThrow({
            where: { orderNumber: result.orderNumber },
          });
          const summaryTotal =
            order.unitPriceIDR * order.quantity + order.shippingCostIDR + order.codFeeIDR;

          expect(Number.isInteger(order.totalIDR)).toBe(true);
          expect(summaryTotal).toBe(order.totalIDR);

          if (paymentMethod === "ONLINE") {
            expect(mockPaymentProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
            const call = mockPaymentProvider.createCheckoutSession.mock.calls[0][0];
            expect(Number.isInteger(call.grossAmount)).toBe(true);
            expect(call.grossAmount).toBe(order.totalIDR);
            expect(call.grossAmount).toBe(summaryTotal);
          }

          // Re-read from the database — the identity must still hold, not
          // just at the moment of creation.
          const reread = await prisma.order.findUniqueOrThrow({
            where: { orderNumber: result.orderNumber },
          });
          expect(reread.totalIDR).toBe(summaryTotal);
        });
      }
    }
  }
});
