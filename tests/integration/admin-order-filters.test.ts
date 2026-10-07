import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { wibDayStartUtc } from "@/domain/time";
import { resetDb, testOrderData } from "./helpers/db";

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

const HOUR_MS = 60 * 60 * 1000;

/** A deterministic instant inside the WIB day `daysAgo` days back. */
const insideWibDay = (daysAgo: number, hour = 1) =>
  new Date(wibDayStartUtc(daysAgo).getTime() + hour * HOUR_MS);

/**
 * The order list's filters. These exist because the filters looked broken in
 * exactly the cases nothing matched: an empty result and a wrong result are
 * indistinguishable from the page, so the query itself has to be pinned.
 */
describe("admin order list filters (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();

    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-FILT01-00001",
        status: "COD_PENDING",
        paymentMethod: "COD",
        customerName: "Cod Today",
        createdAt: insideWibDay(0),
      }),
    });
    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-FILT01-00002",
        status: "PAID",
        paymentMethod: "ONLINE",
        customerName: "Online Today",
        phone: "081999888777",
        phoneNormalized: "+6281999888777",
        createdAt: insideWibDay(0, 2),
      }),
    });
    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-FILT01-00003",
        status: "COMPLETED",
        paymentMethod: "ONLINE",
        customerName: "Online Last Week",
        createdAt: insideWibDay(4, 12),
      }),
    });
    await prisma.order.create({
      data: testOrderData({
        orderNumber: "TKS-FILT01-00004",
        status: "COMPLETED",
        paymentMethod: "COD",
        customerName: "Cod Last Month",
        createdAt: insideWibDay(20, 12),
      }),
    });
  });

  afterEach(async () => {
    await resetDb();
    cookieStore.clear();
  });

  const numbers = (rows: Array<{ orderNumber: string }>) => rows.map((row) => row.orderNumber);

  it("returns every order when nothing is filtered", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");
    expect(await getOrderList({})).toHaveLength(4);
  });

  it("filters by status and by payment method, separately and together", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");

    expect(numbers(await getOrderList({ status: "COD_PENDING" }))).toEqual(["TKS-FILT01-00001"]);
    expect(numbers(await getOrderList({ paymentMethod: "COD" }))).toEqual([
      "TKS-FILT01-00001",
      "TKS-FILT01-00004",
    ]);
    expect(numbers(await getOrderList({ status: "COMPLETED", paymentMethod: "ONLINE" }))).toEqual([
      "TKS-FILT01-00003",
    ]);
  });

  it("returns nothing for a pairing the transition table makes impossible", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");
    const { isUnreachableStatus } = await import("@/domain/order/transitions");

    // The UI explains this case rather than showing a blank table.
    expect(isUnreachableStatus("PAID", "COD")).toBe(true);
    expect(await getOrderList({ status: "PAID", paymentMethod: "COD" })).toEqual([]);
  });

  it("scopes to a WIB calendar-day window, matching the dashboard's own count", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");

    const today = await getOrderList({ period: "today" });
    expect(numbers(today)).toEqual(["TKS-FILT01-00002", "TKS-FILT01-00001"]);

    // The whole point of the period filter: the card and the list agree.
    expect(today).toHaveLength((await getDashboardData()).todayOrderCount);

    expect(await getOrderList({ period: "7d" })).toHaveLength(3);
    expect(await getOrderList({ period: "30d" })).toHaveLength(4);
  });

  it("combines the period with the other filters instead of overriding them", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");

    expect(numbers(await getOrderList({ period: "7d", paymentMethod: "ONLINE" }))).toEqual([
      "TKS-FILT01-00002",
      "TKS-FILT01-00003",
    ]);
    expect(await getOrderList({ period: "today", status: "COMPLETED" })).toEqual([]);
  });

  it("searches by order number and by phone in any format", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");

    expect(numbers(await getOrderList({ search: "FILT01-00003" }))).toEqual(["TKS-FILT01-00003"]);
    expect(numbers(await getOrderList({ search: "081999888777" }))).toEqual(["TKS-FILT01-00002"]);
    expect(numbers(await getOrderList({ search: "+6281999888777" }))).toEqual(["TKS-FILT01-00002"]);
    expect(await getOrderList({ search: "nothing-matches-this" })).toEqual([]);
  });

  it("treats a blank search as no search, so clearing the box restores the list", async () => {
    const { getOrderList } = await import("@/infrastructure/db/admin-orders");
    expect(await getOrderList({ search: "" })).toHaveLength(4);
    expect(await getOrderList({ search: "   " })).toHaveLength(4);
  });

  it("coerces anything else in the URL to no period at all", async () => {
    const { asOrderListPeriod } = await import("@/infrastructure/db/admin-orders");

    expect(asOrderListPeriod("today")).toBe("today");
    expect(asOrderListPeriod("7d")).toBe("7d");
    expect(asOrderListPeriod("30d")).toBe("30d");
    expect(asOrderListPeriod("all")).toBeUndefined();
    expect(asOrderListPeriod("")).toBeUndefined();
    expect(asOrderListPeriod(undefined)).toBeUndefined();
    expect(asOrderListPeriod("1 OR 1=1")).toBeUndefined();
  });
});
