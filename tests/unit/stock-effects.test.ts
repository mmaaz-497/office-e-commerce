import { describe, expect, it } from "vitest";
import { TRANSITIONS } from "@/domain/order/transitions";
import { stockEffectOf } from "@/domain/order/stock-effects";
import type { OrderStatus } from "@/domain/order/status";

const EXPECTED: Record<string, "DECREMENT" | "RESTORE_IF_DECREMENTED" | "NONE"> = {
  "PENDING_PAYMENT->PAID": "DECREMENT",
  "PENDING_PAYMENT->EXPIRED": "RESTORE_IF_DECREMENTED",
  "PENDING_PAYMENT->CANCELLED": "RESTORE_IF_DECREMENTED",
  "PAID->SHIPPED": "NONE",
  "PAID->CANCELLED": "RESTORE_IF_DECREMENTED",
  "COD_PENDING->CONFIRMED": "DECREMENT",
  "COD_PENDING->CANCELLED": "RESTORE_IF_DECREMENTED",
  "CONFIRMED->SHIPPED": "NONE",
  "CONFIRMED->CANCELLED": "RESTORE_IF_DECREMENTED",
  "SHIPPED->COMPLETED": "NONE",
  "SHIPPED->RETURNED": "RESTORE_IF_DECREMENTED",
  "COMPLETED->RETURNED": "RESTORE_IF_DECREMENTED",
};

describe("stockEffectOf", () => {
  const legalPairs = (Object.keys(TRANSITIONS) as OrderStatus[]).flatMap((from) =>
    TRANSITIONS[from].map((to) => [from, to] as const),
  );

  it("covers every legal transition in the matrix (12 edges)", () => {
    expect(legalPairs).toHaveLength(12);
    expect(legalPairs.map(([f, t]) => `${f}->${t}`).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(legalPairs)("%s -> %s has the expected stock effect", (from, to) => {
    expect(stockEffectOf(from, to)).toBe(EXPECTED[`${from}->${to}`]);
  });

  it("PENDING_PAYMENT -> EXPIRED is RESTORE_IF_DECREMENTED, but only restores an order that actually decremented", () => {
    // stockEffectOf is pure and cannot know whether THIS order ever took
    // stock — that is exactly why OrderTransactionPort (T048) gates the
    // restore on the order's own stockDecremented flag rather than acting on
    // this return value alone. An order that expired before ever being paid
    // never decremented, so the infrastructure layer's guard is what stops
    // this RESTORE_IF_DECREMENTED effect from crediting stock it never took.
    expect(stockEffectOf("PENDING_PAYMENT", "EXPIRED")).toBe("RESTORE_IF_DECREMENTED");
  });
});
