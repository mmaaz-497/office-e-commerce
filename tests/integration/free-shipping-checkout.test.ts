import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import { makeMockPaymentProvider } from "./helpers/mock-payment-provider";

/**
 * Shipping is free on every order (shipping.config.ts `freeShipping`): what
 * the server freezes on the order, and what it asks Midtrans to charge, is the
 * item price alone, for COD and online, near and far.
 */
const { mockPaymentProvider, cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    mockPaymentProvider: {} as ReturnType<typeof makeMockPaymentProvider>,
    cookieStore: {
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
      clear: () => store.clear(),
    },
  };
});

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.42" }),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PRICE = 184999;
const SLUG = "sandal-gratis-ongkir";

const BASE = {
  productSlug: SLUG,
  name: "Sari Wulandari",
  phone: "081234567890",
  district: "Menteng",
  postalCode: "10310",
  streetAddress: "Jl. Merdeka No. 1",
};

const JAKARTA = { provinceCode: "31", cityCode: "3171" };
const SULAWESI_SELATAN = { provinceCode: "73", cityCode: "7302" };

async function checkout(input: Record<string, unknown>) {
  const { submitCheckout } = await import("@/app/actions/checkout");
  return submitCheckout({ ...BASE, ...input });
}

describe("free shipping at checkout (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    Object.assign(mockPaymentProvider, makeMockPaymentProvider());
    await seedStockLevel(10);
    await seedProduct({ slug: SLUG, status: "ACTIVE", priceIDR: PRICE, stock: 10 });
  });

  afterEach(async () => {
    await resetDb();
  });

  it.each([
    ["COD", "Jakarta", JAKARTA, 1],
    ["COD", "Sulawesi Selatan", SULAWESI_SELATAN, 3],
    ["ONLINE", "Jakarta", JAKARTA, 2],
    ["ONLINE", "Sulawesi Selatan", SULAWESI_SELATAN, 4],
  ] as const)(
    "a %s order to %s for %i pair(s) is charged the item price only",
    async (paymentMethod, _place, region, quantity) => {
      const result = await checkout({ ...region, quantity, paymentMethod });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: result.orderNumber },
      });
      expect(order.shippingCostIDR).toBe(0);
      expect(order.totalIDR).toBe(PRICE * quantity);
      expect(order.billableWeightKg).toBe(Math.ceil(quantity / 2));

      if (paymentMethod === "ONLINE") {
        expect(mockPaymentProvider.createCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({ grossAmount: PRICE * quantity }),
        );
      } else {
        expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
      }
    },
  );
});
