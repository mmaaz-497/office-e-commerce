import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSessionError } from "@/domain/errors";
import { resetDb } from "./helpers/db";

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

/** FR-055, SC-008: every admin route and action verifies an active session
 * before doing any work or exposing any data — independent of middleware,
 * which cannot be exercised from this test layer. */
describe("admin authentication and route guarding (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("confirmCodOrder refuses an unauthenticated request", async () => {
    const { confirmCodOrder } = await import("@/app/actions/admin/fulfilment");
    await expect(confirmCodOrder({ orderNumber: "TKS-260920-ABCDE" })).rejects.toThrow(
      AdminSessionError,
    );
  });

  it("markShipped refuses an unauthenticated request", async () => {
    const { markShipped } = await import("@/app/actions/admin/fulfilment");
    await expect(
      markShipped({ orderNumber: "TKS-260920-ABCDE", trackingNumber: "JNE123" }),
    ).rejects.toThrow(AdminSessionError);
  });

  it("markCompleted refuses an unauthenticated request", async () => {
    const { markCompleted } = await import("@/app/actions/admin/fulfilment");
    await expect(markCompleted({ orderNumber: "TKS-260920-ABCDE" })).rejects.toThrow(
      AdminSessionError,
    );
  });

  it("markReturned refuses an unauthenticated request", async () => {
    const { markReturned } = await import("@/app/actions/admin/fulfilment");
    await expect(markReturned({ orderNumber: "TKS-260920-ABCDE" })).rejects.toThrow(
      AdminSessionError,
    );
  });

  it("cancelOrder refuses an unauthenticated request", async () => {
    const { cancelOrder } = await import("@/app/actions/admin/fulfilment");
    await expect(cancelOrder({ orderNumber: "TKS-260920-ABCDE" })).rejects.toThrow(
      AdminSessionError,
    );
  });

  it("adjustStock refuses an unauthenticated request", async () => {
    const { adjustStock } = await import("@/app/actions/admin/stock");
    await expect(adjustStock({ delta: 1, note: "test" })).rejects.toThrow(AdminSessionError);
  });

  it("recheckPaymentStatus refuses an unauthenticated request", async () => {
    const { recheckPaymentStatus } = await import("@/app/actions/admin/recheck-payment");
    await expect(recheckPaymentStatus({ orderNumber: "TKS-260920-ABCDE" })).rejects.toThrow(
      AdminSessionError,
    );
  });

  it("every admin page's data loader refuses an unauthenticated request and exposes no data", async () => {
    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    const { getOrderList, getOrderDetailData } = await import("@/infrastructure/db/admin-orders");
    const { getStockPageData } = await import("@/infrastructure/db/admin-stock");

    await expect(getDashboardData()).rejects.toThrow(AdminSessionError);
    await expect(getOrderList({})).rejects.toThrow(AdminSessionError);
    await expect(getOrderDetailData("TKS-260920-ABCDE")).rejects.toThrow(AdminSessionError);
    await expect(getStockPageData()).rejects.toThrow(AdminSessionError);
  });

  it("an action succeeds once a valid session cookie is present", async () => {
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();

    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await expect(getDashboardData()).resolves.toMatchObject({ currentStock: expect.any(Number) });
  });

  it("logging out clears the session so a subsequent action is refused again", async () => {
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    const { logout } = await import("@/app/actions/admin/login");
    await issueAdminSession();
    await logout();

    const { getDashboardData } = await import("@/infrastructure/db/admin-dashboard");
    await expect(getDashboardData()).rejects.toThrow(AdminSessionError);
  });
});
