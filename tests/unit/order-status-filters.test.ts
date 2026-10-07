import { describe, expect, it } from "vitest";
import { TRANSITIONS, isUnreachableStatus } from "@/domain/order/transitions";
import type { OrderStatus, PaymentMethod } from "@/domain/order/status";

const ALL_STATUSES = Object.keys(TRANSITIONS) as OrderStatus[];

/**
 * The statuses each payment method can never hold, written out deliberately.
 *
 * isUnreachableStatus derives its answer by walking TRANSITIONS, so asserting
 * against a second walk here would only test the algorithm against itself.
 * These literals pin the *intent* instead: if a future transition lets a COD
 * order expire, this test fails and someone has to decide that on purpose.
 */
const EXPECTED_UNREACHABLE: Record<PaymentMethod, OrderStatus[]> = {
  // An online order is created at PENDING_PAYMENT: it never enters the COD arm.
  ONLINE: ["COD_PENDING", "CONFIRMED"],
  // A COD order is created at COD_PENDING: it never enters the online arm, and
  // it cannot EXPIRE because it has no payment window to run out.
  COD: ["PENDING_PAYMENT", "PAID", "EXPIRED"],
};

describe("isUnreachableStatus", () => {
  it("matches the documented impossible pairings exactly, for every status", () => {
    for (const method of Object.keys(EXPECTED_UNREACHABLE) as PaymentMethod[]) {
      const expected = new Set(EXPECTED_UNREACHABLE[method]);
      for (const status of ALL_STATUSES) {
        expect(
          isUnreachableStatus(status, method),
          `${method} + ${status} should be ${expected.has(status) ? "impossible" : "possible"}`,
        ).toBe(expected.has(status));
      }
    }
  });

  it("is the reason PAID + COD renders an explanation rather than a blank table", () => {
    expect(isUnreachableStatus("PAID", "COD")).toBe(true);
    expect(isUnreachableStatus("COD_PENDING", "ONLINE")).toBe(true);
  });

  it("leaves every shared status reachable for both payment methods", () => {
    for (const status of ["SHIPPED", "COMPLETED", "CANCELLED", "RETURNED"] as OrderStatus[]) {
      expect(isUnreachableStatus(status, "ONLINE")).toBe(false);
      expect(isUnreachableStatus(status, "COD")).toBe(false);
    }
  });
});
