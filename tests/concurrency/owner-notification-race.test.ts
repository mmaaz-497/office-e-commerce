import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  sendOwnerNotifications,
  type OwnerNotificationConfig,
} from "@/infrastructure/db/owner-notifications";
import { resetDb, seedStockLevel, testOrderData } from "../integration/helpers/db";

/**
 * Checkout's after() send and the expiry job's sweep can run at the same
 * moment. The claim guard must let exactly one of them send each reminder,
 * against real PostgreSQL, so the owner never gets the same order twice.
 */
describe("owner notification sending under concurrency", () => {
  beforeEach(async () => {
    await resetDb();
    await seedStockLevel(10);
  });

  afterEach(async () => {
    await resetDb();
  });

  it("sends each pending reminder exactly once across simultaneous senders", async () => {
    const ORDERS = 8;
    for (let i = 0; i < ORDERS; i++) {
      const order = await prisma.order.create({ data: testOrderData({ status: "COD_PENDING" }) });
      await prisma.ownerNotification.create({ data: { orderId: order.id } });
    }

    const keys: string[] = [];
    const config: OwnerNotificationConfig = {
      sender: {
        send: async (email) => {
          // Hold the claim long enough for the other senders to collide with it.
          await new Promise((resolve) => setTimeout(resolve, 25));
          keys.push(email.idempotencyKey);
        },
      },
      from: "Tokoshopee <onboarding@resend.dev>",
      to: "owner@example.com",
      baseUrl: "https://tokoshopee.example",
    };

    const results = await Promise.all(
      Array.from({ length: 4 }, () => sendOwnerNotifications(config)),
    );

    expect(keys).toHaveLength(ORDERS);
    expect(new Set(keys).size).toBe(ORDERS);
    const sent = results.reduce((sum, r) => sum + (r.enabled ? r.sent : 0), 0);
    expect(sent).toBe(ORDERS);
    expect(await prisma.ownerNotification.count({ where: { status: "SENT" } })).toBe(ORDERS);
  });
});
