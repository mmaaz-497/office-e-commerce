import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedCatalogue } from "./helpers/db";

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
  headers: async () => new Headers(),
}));

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

const JAKARTA_ADDRESS = {
  name: "Rina Kusuma",
  phone: "081234567890",
  provinceCode: "31",
  cityCode: "3171",
  district: "Kebayoran Baru",
  postalCode: "12110",
  streetAddress: "Jl. Melati No. 12",
};

/**
 * The whole customer-to-operator path in one pass, in the order a real order
 * actually travels it: stock is opened, a shopper checks out, and every
 * screen the operator then looks at is asked whether it can see that order.
 *
 * The per-action tests around it (admin-actions, checkout, stock, webhook-*)
 * each prove one step in isolation. None of them proves the steps join up —
 * an order can be created correctly and still never reach the dashboard if a
 * counter filters on the wrong status or a page reads a stale row. That seam
 * is what this file covers, so it deliberately asserts through the same data
 * loaders the admin pages call rather than querying Prisma directly.
 */
describe("order journey end to end (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    // 003: checkout now requires the catalogue
    await seedCatalogue();
    cookieStore.clear();
    mockPaymentProvider.createCheckoutSession.mockReset();
    mockPaymentProvider.verifyNotificationSignature.mockReset();
    mockPaymentProvider.fetchTransactionStatus.mockReset();
    mockPaymentProvider.createCheckoutSession.mockResolvedValue({
      token: "mock-snap-token",
      redirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/mock",
    });
    // Real signature verification is covered by webhook-signature.test.ts;
    // here the notification is a stand-in for "Midtrans said it was paid".
    mockPaymentProvider.verifyNotificationSignature.mockReturnValue(true);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("COD: opening stock, checkout, confirm, ship, complete stay visible on every admin screen", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");
    const { getStockPageData } = await import("@/infrastructure/db/admin-stock");
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    const { getOrderList, getOrderDetailData } = await import("@/infrastructure/db/admin-orders");
    const { submitCheckout } = await import("@/app/actions/checkout");
    const { confirmCodOrder, markShipped, markCompleted } = await import(
      "@/app/actions/admin/fulfilment"
    );

    // 1. The operator opens stock from an empty database.
    const opened = await adjustStock({ delta: 25, note: "Opening stock" });
    expect(opened).toEqual({ ok: true, quantity: 25 });
    expect((await getStockPageData()).quantity).toBe(25);
    expect((await getDashboardData()).currentStock).toBe(25);

    // 2. A shopper checks out with Cash on Delivery.
    const checkout = await submitCheckout({
      ...JAKARTA_ADDRESS,
      quantity: 2,
      paymentMethod: "COD",
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;
    const { orderNumber } = checkout;

    // 3. The order is on the dashboard and in the order list immediately —
    //    COD stock is not committed until the operator confirms (FR-062).
    const afterCheckout = await getDashboardData();
    expect(afterCheckout.todayOrderCount).toBe(1);
    expect(afterCheckout.codAwaitingConfirmation).toBe(1);
    expect(afterCheckout.awaitingShipment).toBe(0);
    expect(afterCheckout.currentStock).toBe(25);
    expect(afterCheckout.conflicts).toEqual([]);

    const list = await getOrderList({});
    expect(list.map((o) => o.orderNumber)).toEqual([orderNumber]);
    expect(list[0].status).toBe("COD_PENDING");
    expect(list[0].customerName).toBe("Rina Kusuma");

    // The list filters the operator actually clicks must find it too.
    expect((await getOrderList({ status: "COD_PENDING" })).map((o) => o.orderNumber)).toEqual([
      orderNumber,
    ]);
    expect((await getOrderList({ paymentMethod: "COD" })).map((o) => o.orderNumber)).toEqual([
      orderNumber,
    ]);
    expect((await getOrderList({ search: orderNumber })).map((o) => o.orderNumber)).toEqual([
      orderNumber,
    ]);
    // Searching by the phone as the shopper typed it, not as it is stored.
    expect((await getOrderList({ search: "081234567890" })).map((o) => o.orderNumber)).toEqual([
      orderNumber,
    ]);
    expect(await getOrderList({ status: "PAID" })).toEqual([]);

    const detail = await getOrderDetailData(orderNumber);
    expect(detail).not.toBeNull();
    expect(detail!.order.status).toBe("COD_PENDING");
    expect(detail!.order.quantity).toBe(2);
    expect(detail!.allowedActions).toContain("CONFIRM_COD");
    expect(detail!.order.statusEvents.map((e) => e.toStatus)).toEqual(["COD_PENDING"]);

    // 4. The operator confirms it: stock commits here, not at checkout.
    expect(await confirmCodOrder({ orderNumber })).toEqual({ ok: true });
    const afterConfirm = await getDashboardData();
    expect(afterConfirm.codAwaitingConfirmation).toBe(0);
    expect(afterConfirm.awaitingShipment).toBe(1);
    expect(afterConfirm.currentStock).toBe(23);
    expect(afterConfirm.todayOrderCount).toBe(1);

    const stockAfterConfirm = await getStockPageData();
    expect(stockAfterConfirm.quantity).toBe(23);
    expect(stockAfterConfirm.changes[0].delta).toBe(-2);
    expect(stockAfterConfirm.changes[0].order?.orderNumber).toBe(orderNumber);

    const confirmedDetail = await getOrderDetailData(orderNumber);
    expect(confirmedDetail!.order.status).toBe("CONFIRMED");
    expect(confirmedDetail!.allowedActions).toContain("MARK_SHIPPED");

    // 5. Ship, then complete.
    expect(await markShipped({ orderNumber, trackingNumber: "JNE0001112223" })).toEqual({
      ok: true,
    });
    const shipped = await getOrderDetailData(orderNumber);
    expect(shipped!.order.status).toBe("SHIPPED");
    expect(shipped!.order.trackingNumber).toBe("JNE0001112223");
    expect((await getDashboardData()).awaitingShipment).toBe(0);

    expect(await markCompleted({ orderNumber })).toEqual({ ok: true });
    const completed = await getOrderDetailData(orderNumber);
    expect(completed!.order.status).toBe("COMPLETED");
    expect(completed!.allowedActions).toEqual(["MARK_RETURNED"]);

    // 6. The timeline the operator reads is the full history, in order.
    expect(completed!.order.statusEvents.map((e) => e.toStatus)).toEqual([
      "COD_PENDING",
      "CONFIRMED",
      "SHIPPED",
      "COMPLETED",
    ]);
    expect(completed!.order.statusEvents.map((e) => e.actor)).toEqual([
      "CUSTOMER",
      "OWNER",
      "OWNER",
      "OWNER",
    ]);
    // Stock was committed exactly once across the whole journey.
    expect(await prisma.stockChange.count({ where: { orderId: { not: null } } })).toBe(1);
  });

  it("ONLINE: checkout, settlement, ship, complete stay visible on every admin screen", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    const { getOrderList, getOrderDetailData } = await import("@/infrastructure/db/admin-orders");
    const { submitCheckout } = await import("@/app/actions/checkout");
    const { markShipped, markCompleted } = await import("@/app/actions/admin/fulfilment");

    await adjustStock({ delta: 25, note: "Opening stock" });

    const checkout = await submitCheckout({
      ...JAKARTA_ADDRESS,
      quantity: 1,
      paymentMethod: "ONLINE",
    });
    expect(checkout.ok).toBe(true);
    if (!checkout.ok) return;
    const { orderNumber } = checkout;
    expect(checkout.snapToken).toBe("mock-snap-token");

    // Unpaid, but the operator can already see it — an order that only shows
    // up once it is paid is an order nobody can chase.
    const beforePayment = await getDashboardData();
    expect(beforePayment.todayOrderCount).toBe(1);
    expect(beforePayment.awaitingShipment).toBe(0);
    expect(beforePayment.codAwaitingConfirmation).toBe(0);
    expect((await getOrderList({})).map((o) => o.orderNumber)).toEqual([orderNumber]);

    const pending = await getOrderDetailData(orderNumber);
    expect(pending!.order.status).toBe("PENDING_PAYMENT");
    expect(pending!.order.midtransOrderId).toBe(orderNumber);
    expect(pending!.allowedActions).toEqual(["CANCEL"]);

    // Midtrans settles the payment.
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    const { POST } = await import("@/app/api/webhooks/midtrans/route");
    const response = await POST(
      new NextRequest("http://localhost/api/webhooks/midtrans", {
        method: "POST",
        body: JSON.stringify({
          order_id: orderNumber,
          transaction_id: "txn-journey-online",
          transaction_status: "settlement",
          status_code: "200",
          gross_amount: `${order.totalIDR}.00`,
          fraud_status: "ACCEPT",
          signature_key: "verified-by-the-provider-double",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);

    const afterPayment = await getDashboardData();
    expect(afterPayment.awaitingShipment).toBe(1);
    expect(afterPayment.currentStock).toBe(24);
    expect(afterPayment.conflicts).toEqual([]);

    const paid = await getOrderDetailData(orderNumber);
    expect(paid!.order.status).toBe("PAID");
    expect(paid!.order.stockDecremented).toBe(true);
    expect(paid!.allowedActions).toContain("MARK_SHIPPED");

    expect(await markShipped({ orderNumber, trackingNumber: "JNT0004445556" })).toEqual({
      ok: true,
    });
    expect(await markCompleted({ orderNumber })).toEqual({ ok: true });

    const completed = await getOrderDetailData(orderNumber);
    expect(completed!.order.status).toBe("COMPLETED");
    expect(completed!.order.statusEvents.map((e) => e.toStatus)).toEqual([
      "PENDING_PAYMENT",
      "PAID",
      "SHIPPED",
      "COMPLETED",
    ]);
    expect(completed!.order.statusEvents.map((e) => e.actor)).toEqual([
      "CUSTOMER",
      "PAYMENT_PROVIDER",
      "OWNER",
      "OWNER",
    ]);
  });
});
