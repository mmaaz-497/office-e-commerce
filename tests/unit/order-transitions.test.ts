import { describe, expect, it } from "vitest";
import { TRANSITIONS, assertTransition, canTransition } from "@/domain/order/transitions";
import { InvalidTransitionError } from "@/domain/errors";
import type { OrderStatus } from "@/domain/order/status";

/**
 * Hardcoded, not derived from TRANSITIONS' own keys — adding a tenth status to
 * OrderStatus must force a human to update this list too, or the sanity check
 * below fails, rather than the matrix silently covering fewer cells than it
 * claims to (T022 AC: "a new state forces an explicit decision").
 */
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

describe("order transition matrix", () => {
  it("covers exactly the 9 statuses this test enumerates", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    expect(ALL_STATUSES).toHaveLength(9);
  });

  const pairs = ALL_STATUSES.flatMap((from) => ALL_STATUSES.map((to) => [from, to] as const));

  it.each(pairs)("from %s to %s", (from, to) => {
    const legal = TRANSITIONS[from].includes(to);

    expect(canTransition(from, to)).toBe(legal);

    if (legal) {
      expect(() => assertTransition(from, to)).not.toThrow();
    } else {
      expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    }
  });

  it("asserts 81 (from, to) pairs were exercised", () => {
    expect(pairs).toHaveLength(81);
  });

  it("has empty transition arrays for every terminal state", () => {
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(TRANSITIONS.EXPIRED).toEqual([]);
    expect(TRANSITIONS.RETURNED).toEqual([]);
  });

  it("InvalidTransitionError carries the attempted from/to", () => {
    try {
      assertTransition("CANCELLED", "PAID");
      throw new Error("expected assertTransition to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InstanceType<typeof InvalidTransitionError>;
      expect(e.from).toBe("CANCELLED");
      expect(e.to).toBe("PAID");
      expect(e.messageKey).toBe("errors.invalidTransition");
    }
  });
});
