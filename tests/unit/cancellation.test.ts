import { describe, expect, it } from "vitest";
import { allowedAdminActions, customerCancellationRight } from "@/domain/order/cancellation";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";

const ALL_STATUSES: readonly OrderStatus[] = [
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
const ALL_METHODS: readonly PaymentMethod[] = ["ONLINE", "COD"];

const EXPECTED: Record<string, "CANCEL_DIRECTLY" | "REQUEST_ONLY" | "NONE"> = {
  "PENDING_PAYMENT,ONLINE": "CANCEL_DIRECTLY",
  "PENDING_PAYMENT,COD": "NONE",
  "PAID,ONLINE": "REQUEST_ONLY",
  "PAID,COD": "NONE",
  "COD_PENDING,ONLINE": "NONE",
  "COD_PENDING,COD": "CANCEL_DIRECTLY",
  "CONFIRMED,ONLINE": "NONE",
  "CONFIRMED,COD": "CANCEL_DIRECTLY",
  "SHIPPED,ONLINE": "NONE",
  "SHIPPED,COD": "NONE",
  "COMPLETED,ONLINE": "NONE",
  "COMPLETED,COD": "NONE",
  "CANCELLED,ONLINE": "NONE",
  "CANCELLED,COD": "NONE",
  "EXPIRED,ONLINE": "NONE",
  "EXPIRED,COD": "NONE",
  "RETURNED,ONLINE": "NONE",
  "RETURNED,COD": "NONE",
};

describe("customerCancellationRight", () => {
  const combos = ALL_STATUSES.flatMap((status) =>
    ALL_METHODS.map((method) => [status, method] as const),
  );

  it("covers all 18 (status x paymentMethod) combinations", () => {
    expect(combos).toHaveLength(18);
    expect(Object.keys(EXPECTED)).toHaveLength(18);
  });

  it.each(combos)("%s + %s", (status, method) => {
    expect(customerCancellationRight(status, method)).toBe(EXPECTED[`${status},${method}`]);
  });

  it("SHIPPED and COMPLETED yield NONE for both payment methods", () => {
    for (const method of ALL_METHODS) {
      expect(customerCancellationRight("SHIPPED", method)).toBe("NONE");
      expect(customerCancellationRight("COMPLETED", method)).toBe("NONE");
    }
  });
});

describe("allowedAdminActions", () => {
  it("PENDING_PAYMENT allows only CANCEL", () => {
    expect(allowedAdminActions("PENDING_PAYMENT")).toEqual(["CANCEL"]);
  });

  it("PAID allows shipping and cancellation-request resolution, but not a bare cancel", () => {
    const actions = allowedAdminActions("PAID");
    expect(actions).toContain("MARK_SHIPPED");
    expect(actions).toContain("APPROVE_CANCELLATION");
    expect(actions).toContain("REJECT_CANCELLATION");
    expect(actions).not.toContain("CANCEL");
  });

  it("COD_PENDING allows CONFIRM_COD and CANCEL", () => {
    expect(allowedAdminActions("COD_PENDING")).toEqual(["CONFIRM_COD", "CANCEL"]);
  });

  it("CONFIRMED allows MARK_SHIPPED and CANCEL", () => {
    expect(allowedAdminActions("CONFIRMED")).toEqual(["MARK_SHIPPED", "CANCEL"]);
  });

  it("SHIPPED allows MARK_COMPLETED and MARK_RETURNED only", () => {
    expect(allowedAdminActions("SHIPPED")).toEqual(["MARK_COMPLETED", "MARK_RETURNED"]);
  });

  it("COMPLETED allows only MARK_RETURNED", () => {
    expect(allowedAdminActions("COMPLETED")).toEqual(["MARK_RETURNED"]);
  });

  it("terminal states allow no actions", () => {
    expect(allowedAdminActions("CANCELLED")).toEqual([]);
    expect(allowedAdminActions("EXPIRED")).toEqual([]);
    expect(allowedAdminActions("RETURNED")).toEqual([]);
  });
});
