import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { env } from "@/config";
import { prisma } from "@/infrastructure/db/prisma";
import {
  CLAIM_LEASE_MS,
  MAX_ATTEMPTS,
  sendOwnerNotifications,
  type OwnerNotificationConfig,
} from "@/infrastructure/db/owner-notifications";
import type { OutgoingEmail } from "@/infrastructure/email/resend-sender";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";
import { makeMockPaymentProvider } from "./helpers/mock-payment-provider";

/**
 * Owner email on every placed order: a placed order always gets exactly one
 * reminder row, written with the order; failed checkouts get none; sending
 * marks it SENT once, failures retry and eventually give up, and the email
 * carries no buyer contact details. Nothing here reaches Resend: setup.ts
 * clears RESEND_API_KEY and sending tests pass a fake sender.
 */
const { mockPaymentProvider } = vi.hoisted(() => ({
  mockPaymentProvider: {} as ReturnType<typeof makeMockPaymentProvider>,
}));

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

const INPUT = {
  quantity: 1,
  name: "Sari Wulandari",
  phone: "081234567890",
  provinceCode: "31",
  cityCode: "3171",
  district: "Menteng",
  postalCode: "10310",
  streetAddress: "Jl. Merdeka No. 1",
  paymentMethod: "COD" as const,
};

function fakeSender(behaviour: "ok" | "fail" = "ok") {
  const sent: OutgoingEmail[] = [];
  const config: OwnerNotificationConfig = {
    sender: {
      send: async (email) => {
        if (behaviour === "fail") throw new Error("Resend answered 503: unavailable");
        sent.push(email);
      },
    },
    from: "Tokoshopee <onboarding@resend.dev>",
    to: "owner@example.com",
    baseUrl: "https://tokoshopee.example/",
  };
  return { config, sent };
}

async function checkout(input: Record<string, unknown> = {}) {
  const { submitCheckout } = await import("@/app/actions/checkout");
  return submitCheckout({ ...INPUT, ...input });
}

async function placeCodOrder(): Promise<{ id: string; orderNumber: string }> {
  const result = await checkout();
  if (!result.ok) throw new Error(`checkout failed: ${result.errorKey}`);
  return prisma.order.findUniqueOrThrow({
    where: { orderNumber: result.orderNumber },
    select: { id: true, orderNumber: true },
  });
}

describe("owner order notification (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    Object.assign(mockPaymentProvider, makeMockPaymentProvider());
    await seedStockLevel(10);
  });

  afterEach(async () => {
    await resetDb();
  });

  describe("recording", () => {
    it("records one pending reminder with a COD order", async () => {
      const order = await placeCodOrder();
      const rows = await prisma.ownerNotification.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ orderId: order.id, status: "PENDING", attempts: 0 });
    });

    it("records one pending reminder with an online order once its payment session exists", async () => {
      const result = await checkout({ paymentMethod: "ONLINE" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const order = await prisma.order.findUniqueOrThrow({
        where: { orderNumber: result.orderNumber },
      });
      const rows = await prisma.ownerNotification.findMany();
      expect(rows.map((row) => row.orderId)).toEqual([order.id]);
    });

    it("records nothing when checkout fails", async () => {
      // Invalid input, insufficient stock, and a payment session Midtrans refused.
      expect((await checkout({ postalCode: "123" })).ok).toBe(false);

      await prisma.stockLevel.update({ where: { id: "default" }, data: { quantity: 0 } });
      expect(await checkout()).toMatchObject({ ok: false, errorKey: "errors.insufficientStock" });

      await prisma.stockLevel.update({ where: { id: "default" }, data: { quantity: 10 } });
      mockPaymentProvider.createCheckoutSession.mockRejectedValueOnce(new Error("401"));
      const refused = await checkout({ paymentMethod: "ONLINE" });
      expect(refused).toEqual({ ok: false, errorKey: "errors.paymentProviderUnavailable" });

      expect(await prisma.ownerNotification.count()).toBe(0);
    });

    it("never emails orders that existed before the feature", async () => {
      await prisma.order.create({ data: testOrderData({ status: "COD_PENDING" }) });
      const { config, sent } = fakeSender();

      const summary = await sendOwnerNotifications(config);

      expect(summary).toEqual({ enabled: true, sent: 0, failed: 0, skipped: 0 });
      expect(sent).toHaveLength(0);
    });
  });

  describe("sending", () => {
    it("emails the owner once, with the admin link and no buyer contact details", async () => {
      const order = await placeCodOrder();
      const { config, sent } = fakeSender();

      expect(await sendOwnerNotifications(config)).toMatchObject({ sent: 1, failed: 0 });
      expect(await sendOwnerNotifications(config)).toMatchObject({ sent: 0 });

      expect(sent).toHaveLength(1);
      const [email] = sent;
      expect(email.to).toBe("owner@example.com");
      expect(email.from).toBe("Tokoshopee <onboarding@resend.dev>");
      expect(email.idempotencyKey).toBe(`owner-new-order/${order.orderNumber}`);
      expect(email.subject).toContain(order.orderNumber);
      expect(email.text).toContain(`https://tokoshopee.example/admin/orders/${order.orderNumber}`);
      for (const secret of [INPUT.name, INPUT.phone, INPUT.streetAddress, INPUT.postalCode]) {
        expect(email.text).not.toContain(secret);
        expect(email.html).not.toContain(secret);
      }

      const row = await prisma.ownerNotification.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(row).toMatchObject({ status: "SENT", attempts: 1, claimedAt: null, lastError: null });
      expect(row.sentAt).not.toBeNull();
    });

    it("keeps a failed send pending and succeeds on the next run", async () => {
      const order = await placeCodOrder();

      const failing = fakeSender("fail");
      expect(await sendOwnerNotifications(failing.config)).toMatchObject({ sent: 0, failed: 1 });
      const afterFailure = await prisma.ownerNotification.findUniqueOrThrow({
        where: { orderId: order.id },
      });
      expect(afterFailure).toMatchObject({ status: "PENDING", attempts: 1, claimedAt: null });
      expect(afterFailure.lastError).toContain("503");

      const working = fakeSender();
      expect(await sendOwnerNotifications(working.config)).toMatchObject({ sent: 1 });
      expect(
        await prisma.ownerNotification.findUniqueOrThrow({ where: { orderId: order.id } }),
      ).toMatchObject({ status: "SENT", attempts: 2, lastError: null });
    });

    it(`gives up after ${MAX_ATTEMPTS} attempts and never retries a FAILED row`, async () => {
      const order = await placeCodOrder();
      await prisma.ownerNotification.update({
        where: { orderId: order.id },
        data: { attempts: MAX_ATTEMPTS - 1 },
      });

      await sendOwnerNotifications(fakeSender("fail").config);
      expect(
        await prisma.ownerNotification.findUniqueOrThrow({ where: { orderId: order.id } }),
      ).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });

      const { config, sent } = fakeSender();
      await sendOwnerNotifications(config);
      expect(sent).toHaveLength(0);
    });

    it("leaves a freshly claimed row alone and takes over a stale claim", async () => {
      const order = await placeCodOrder();
      const now = new Date();
      await prisma.ownerNotification.update({
        where: { orderId: order.id },
        data: { claimedAt: new Date(now.getTime() - 1000) },
      });
      const { config, sent } = fakeSender();

      await sendOwnerNotifications(config, { now });
      expect(sent).toHaveLength(0);

      await sendOwnerNotifications(config, { now: new Date(now.getTime() + CLAIM_LEASE_MS) });
      expect(sent).toHaveLength(1);
    });

    it("sends only the named order when given an orderId", async () => {
      const first = await placeCodOrder();
      const second = await placeCodOrder();
      const { config, sent } = fakeSender();

      await sendOwnerNotifications(config, { orderId: second.id });

      expect(sent.map((email) => email.idempotencyKey)).toEqual([
        `owner-new-order/${second.orderNumber}`,
      ]);
      expect(
        await prisma.ownerNotification.findUniqueOrThrow({ where: { orderId: first.id } }),
      ).toMatchObject({ status: "PENDING" });
    });

    it("does nothing when email is off, leaving the reminder for later", async () => {
      const order = await placeCodOrder();

      expect(await sendOwnerNotifications(null)).toEqual({ enabled: false });
      expect(
        await prisma.ownerNotification.findUniqueOrThrow({ where: { orderId: order.id } }),
      ).toMatchObject({ status: "PENDING", attempts: 0 });
    });

    it("reports the sweep as off in the expiry job when no key is set", async () => {
      await placeCodOrder();
      const { POST } = await import("@/app/api/jobs/expire-orders/route");

      const response = await POST(
        new NextRequest("http://localhost/api/jobs/expire-orders", {
          method: "POST",
          headers: { authorization: `Bearer ${env.JOB_SECRET}` },
        }),
      );

      expect(response.status).toBe(200);
      expect((await response.json()).ownerEmails).toBe("off");
      expect(await prisma.ownerNotification.count({ where: { status: "PENDING" } })).toBe(1);
    });
  });
});
