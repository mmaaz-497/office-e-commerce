import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderWithRetry } from "@/infrastructure/db/create-order";
import { resetDb, testOrderData } from "./helpers/db";

/**
 * Order.orderNumber carries a UNIQUE constraint (prisma/schema.prisma), and
 * order creation retries generation up to 3 times on a collision before
 * failing — the generator's collision rate (T026: ~77% across 10,000 draws
 * from its 32^5 suffix space) makes uniqueness a database guarantee, not a
 * probability. A CSPRNG-based generator cannot be made to collide on
 * demand, so these tests inject a deterministic sequence instead.
 */
describe("createOrderWithRetry", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("retries with a fresh order number after a unique-constraint collision, rather than surfacing an error", async () => {
    const collidingNumber = "TKS-260919-COLLD";
    await prisma.order.create({ data: testOrderData({ orderNumber: collidingNumber }) });

    const freshNumber = "TKS-260919-FRESH";
    const generate = vi
      .fn<() => string>()
      .mockReturnValueOnce(collidingNumber) // 1st attempt: collides with the pre-existing row
      .mockReturnValueOnce(freshNumber); // 2nd attempt: succeeds

    const created = await createOrderWithRetry(testOrderData(), { generateOrderNumber: generate });

    expect(created.orderNumber).toBe(freshNumber);
    expect(generate).toHaveBeenCalledTimes(2);

    const rows = await prisma.order.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.orderNumber).sort()).toEqual([collidingNumber, freshNumber].sort());
  });

  it("propagates a non-collision error immediately without retrying", async () => {
    const generate = vi.fn<() => string>().mockReturnValue("TKS-260919-ABCDE");

    // customerName set to a Prisma-rejected value -> a validation error
    // unrelated to orderNumber uniqueness. This must NOT be retried —
    // retrying it would silently mask a real defect instead of surfacing it.
    const invalidData = { ...testOrderData(), customerName: 12345 } as unknown as ReturnType<
      typeof testOrderData
    >;

    await expect(
      createOrderWithRetry(invalidData, { generateOrderNumber: generate }),
    ).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("fails after maxAttempts consecutive collisions rather than retrying forever", async () => {
    const stuckNumber = "TKS-260919-STUCK";
    await prisma.order.create({ data: testOrderData({ orderNumber: stuckNumber }) });

    const generate = vi.fn<() => string>().mockReturnValue(stuckNumber); // always collides

    await expect(
      createOrderWithRetry(testOrderData(), { generateOrderNumber: generate, maxAttempts: 3 }),
    ).rejects.toThrow(/3 attempts/);
    expect(generate).toHaveBeenCalledTimes(3);

    const rows = await prisma.order.findMany();
    expect(rows).toHaveLength(1); // only the pre-existing row — every retry failed
  });
});
