import { describe, expect, it } from "vitest";
import { classifySampleForCleanup, type SampleCleanupFacts } from "@/domain/catalogue/samples";

/** T046 (005 R-414): which samples cleanup may delete, and why it keeps the rest. */
const CLEAN: SampleCleanupFacts = {
  status: "COMING_SOON",
  orders: 0,
  reviews: 0,
  stockChanges: 0,
  stockQuantity: null,
};

describe("classifySampleForCleanup", () => {
  it("deletes a sample with nothing attached", () => {
    expect(classifySampleForCleanup(CLEAN)).toEqual({ kind: "delete" });
  });

  it("deletes a sample whose stock row is at zero", () => {
    expect(classifySampleForCleanup({ ...CLEAN, stockQuantity: 0 })).toEqual({ kind: "delete" });
  });

  it("deletes a DRAFT sample with nothing attached", () => {
    expect(classifySampleForCleanup({ ...CLEAN, status: "DRAFT" })).toEqual({ kind: "delete" });
  });

  it.each([
    ["active", { status: "ACTIVE" }],
    ["hasOrders", { orders: 1 }],
    ["hasReviews", { reviews: 2 }],
    ["hasStockHistory", { stockChanges: 1 }],
    ["hasStock", { stockQuantity: 3 }],
  ] as const)("keeps with reason %s when only that holds", (reason, change) => {
    expect(classifySampleForCleanup({ ...CLEAN, ...change })).toEqual({ kind: "keep", reason });
  });

  it("reports the first reason in check order when several hold", () => {
    const all: SampleCleanupFacts = {
      status: "ACTIVE",
      orders: 1,
      reviews: 1,
      stockChanges: 1,
      stockQuantity: 1,
    };
    expect(classifySampleForCleanup(all)).toEqual({ kind: "keep", reason: "active" });
    expect(classifySampleForCleanup({ ...all, status: "COMING_SOON" })).toEqual({
      kind: "keep",
      reason: "hasOrders",
    });
    expect(classifySampleForCleanup({ ...all, status: "COMING_SOON", orders: 0 })).toEqual({
      kind: "keep",
      reason: "hasReviews",
    });
    expect(
      classifySampleForCleanup({ ...all, status: "COMING_SOON", orders: 0, reviews: 0 }),
    ).toEqual({ kind: "keep", reason: "hasStockHistory" });
  });
});
