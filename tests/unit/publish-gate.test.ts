import { describe, expect, it } from "vitest";
import {
  PUBLISHING_OPEN,
  allowedStatuses,
  allowedStatusesFor,
  allowedStatusesWhen,
  isStatusAllowed,
} from "@/domain/catalogue/publish-gate";
import type { ProductStatus } from "@/domain/catalogue/status";

/**
 * Spec FR-024, research R-309; opened in Phase 2c (R-401). While closed, a new
 * product could only be DRAFT and an existing product kept its status. Both
 * states of the gate stay tested, so closing it again is one constant.
 */

const ALL: ProductStatus[] = ["ACTIVE", "COMING_SOON", "DRAFT"];
const closed = (current: ProductStatus | null) => allowedStatusesWhen(false, current);

describe("publish gate — closed (Phase 2b)", () => {
  it("a new product may only be DRAFT", () => {
    expect(closed(null)).toEqual(["DRAFT"]);
  });

  it("an existing product keeps its status", () => {
    expect(closed("ACTIVE")).toEqual(["ACTIVE"]);
    expect(closed("DRAFT")).toEqual(["DRAFT"]);
    expect(closed("COMING_SOON")).toEqual(["COMING_SOON"]);
  });

  it("a status outside the closed list is refused", () => {
    expect(closed(null).includes("DRAFT")).toBe(true);
    expect(closed(null).includes("ACTIVE")).toBe(false);
    expect(closed(null).includes("COMING_SOON")).toBe(false);
    expect(closed("ACTIVE").includes("ACTIVE")).toBe(true);
    expect(closed("ACTIVE").includes("DRAFT")).toBe(false);
    expect(closed("DRAFT").includes("ACTIVE")).toBe(false);
  });
});

describe("publish gate — open (Phase 2c)", () => {
  it("is open as exported", () => {
    expect(PUBLISHING_OPEN).toBe(true);
  });

  it("allows every status for every current status", () => {
    for (const current of [null, ...ALL]) {
      expect([...allowedStatusesWhen(true, current)].sort()).toEqual([...ALL].sort());
    }
  });

  it("open matches allowedStatuses", () => {
    for (const current of [null, ...ALL]) {
      expect(allowedStatusesWhen(true, current)).toEqual(allowedStatuses(current));
    }
  });

  it("isStatusAllowed follows allowedStatuses", () => {
    for (const current of [null, ...ALL]) {
      for (const next of ALL) {
        expect(isStatusAllowed(current, next)).toBe(allowedStatuses(current).includes(next));
      }
    }
  });
});

describe("allowedStatusesFor — the sample rule (R-402)", () => {
  it("a sample may only be COMING_SOON, whatever its stored status", () => {
    for (const status of ALL) {
      expect(allowedStatusesFor({ status, isSample: true })).toEqual(["COMING_SOON"]);
    }
  });

  it("a new product may take every status", () => {
    expect([...allowedStatusesFor(null)].sort()).toEqual([...ALL].sort());
  });

  it("a non-sample may take every status", () => {
    for (const status of ALL) {
      expect([...allowedStatusesFor({ status, isSample: false })].sort()).toEqual([...ALL].sort());
    }
  });
});
