import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";
import { lookupOrder } from "@/app/actions/lookup";
import { getOrderDetailData } from "@/infrastructure/db/admin-orders";
import { quoteOrder } from "@/domain/pricing/quote";
import { FlatZoneShippingProvider } from "@/domain/shipping/flat-zone-provider";
import { shippingConfig } from "@/config";
import product from "@/data/product.json";
import type { OrderStatus } from "@/domain/order/status";

const { cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
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

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.60" }),
}));

let orderNumberCounter = 0;
function validOrderNumber(): string {
  orderNumberCounter += 1;
  return `TKS-260920-SNP${String(orderNumberCounter).padStart(2, "0")}`;
}

const ALL_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "COD_PENDING",
  "CONFIRMED",
  "SHIPPED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "RETURNED",
];

const PHONE_RAW = "081234567890";
const PHONE_NORMALIZED = "+6281234567890";
const PROVINCE_CODE = "31"; // Jakarta — present in shipping.config.ts's zones.

function realShippingProvider(): FlatZoneShippingProvider {
  return new FlatZoneShippingProvider({
    pairsPerKg: shippingConfig.pairsPerKg,
    zoneRatesIDR: Object.fromEntries(
      Object.entries(shippingConfig.zones).map(([code, zone]) => [code, zone.rateIDR]),
    ),
    codDisabledProvinces: shippingConfig.codDisabledProvinces,
  });
}

/**
 * Stands in for "the catalogue price changed and a zone rate changed, then
 * the app restarted" (T135's AC) without touching real files on disk or
 * fighting Vitest's module cache for an already-imported, eagerly-validated
 * singleton (src/config/index.ts throws at import time) — same effect, no
 * risk of leaving `shipping.config.ts` or the module registry dirty for
 * every other file in this test run (fileParallelism is off; they share a
 * process). `quoteOrder` and `FlatZoneShippingProvider` are the exact
 * production classes — only their *inputs* stand in for the post-edit files.
 */
function mutatedShippingProvider(): FlatZoneShippingProvider {
  return new FlatZoneShippingProvider({
    pairsPerKg: shippingConfig.pairsPerKg,
    zoneRatesIDR: {
      ...Object.fromEntries(
        Object.entries(shippingConfig.zones).map(([code, zone]) => [code, zone.rateIDR]),
      ),
      [PROVINCE_CODE]: 999_000,
    },
    codDisabledProvinces: shippingConfig.codDisabledProvinces,
  });
}

/** FR-018, R-006, SC-014. */
describe("price-snapshot immutability across every order status (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(50);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
    cookieStore.clear();
  });

  it(
    "keeps every seeded order's monetary snapshot unchanged, and both the lookup and admin " +
      "detail views render the original figures, after the catalogue price and a zone rate change",
    async () => {
      const originalUnitPrice = product[0].priceIDR;
      const quantity = 3;

      const originalBreakdown = quoteOrder({
        unitPrice: originalUnitPrice,
        quantity,
        provinceCode: PROVINCE_CODE,
        paymentMethod: "ONLINE",
        shipping: realShippingProvider(),
      });

      const snapshot = {
        unitPriceIDR: originalBreakdown.unitPrice,
        shippingCostIDR: originalBreakdown.shippingCost,
        totalIDR: originalBreakdown.total,
        billableWeightKg: originalBreakdown.billableWeightKg,
      };

      // Seed one order per status, all sharing the identical snapshot —
      // the transition to each status must never have touched these fields.
      const orderNumbers = new Map<OrderStatus, string>();
      for (const status of ALL_STATUSES) {
        const orderNumber = validOrderNumber();
        orderNumbers.set(status, orderNumber);
        await prisma.order.create({
          data: testOrderData({
            orderNumber,
            status,
            paymentMethod: "ONLINE",
            provinceCode: PROVINCE_CODE,
            provinceName: "Daerah Khusus Ibukota Jakarta",
            phone: PHONE_RAW,
            phoneNormalized: PHONE_NORMALIZED,
            quantity,
            unitPriceIDR: snapshot.unitPriceIDR,
            shippingCostIDR: snapshot.shippingCostIDR,
            totalIDR: snapshot.totalIDR,
            billableWeightKg: snapshot.billableWeightKg,
          }),
        });
      }

      // The catalogue price and a zone rate "change" (see mutatedShippingProvider
      // above) — sanity-check that this would actually matter for a NEW order,
      // otherwise the rest of this test would pass for a trivial reason.
      const mutatedUnitPrice = originalUnitPrice + 50_000;
      const newOrderBreakdown = quoteOrder({
        unitPrice: mutatedUnitPrice,
        quantity,
        provinceCode: PROVINCE_CODE,
        paymentMethod: "ONLINE",
        shipping: mutatedShippingProvider(),
      });
      expect(newOrderBreakdown.unitPrice).not.toBe(snapshot.unitPriceIDR);
      expect(newOrderBreakdown.shippingCost).not.toBe(snapshot.shippingCostIDR);
      expect(newOrderBreakdown.total).not.toBe(snapshot.totalIDR);

      // Every already-seeded order must still show the ORIGINAL snapshot —
      // through both read paths a real visitor or operator would use.
      for (const status of ALL_STATUSES) {
        const orderNumber = orderNumbers.get(status)!;

        const lookupResult = await lookupOrder({ orderNumber, phone: PHONE_RAW });
        expect(lookupResult.ok, `lookup failed for ${status} order ${orderNumber}`).toBe(true);
        if (lookupResult.ok) {
          expect(lookupResult.order.unitPriceIDR).toBe(snapshot.unitPriceIDR);
          expect(lookupResult.order.shippingCostIDR).toBe(snapshot.shippingCostIDR);
          expect(lookupResult.order.totalIDR).toBe(snapshot.totalIDR);
        }

        const detail = await getOrderDetailData(orderNumber);
        expect(detail, `admin detail missing for ${status} order ${orderNumber}`).not.toBeNull();
        if (detail) {
          expect(detail.order.unitPriceIDR).toBe(snapshot.unitPriceIDR);
          expect(detail.order.shippingCostIDR).toBe(snapshot.shippingCostIDR);
          expect(detail.order.totalIDR).toBe(snapshot.totalIDR);
          expect(detail.order.billableWeightKg).toBe(snapshot.billableWeightKg);
        }
      }
    },
  );
});
