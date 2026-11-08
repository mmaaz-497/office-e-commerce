import type { Prisma } from "@prisma/client";
import { env } from "@/config";
import { STORE_CONTACT_EMAIL } from "@/config/store.config";
import id from "@/messages/id.json";
import { buildOrderEmail, type OrderEmailLabels } from "@/domain/notification/order-email";
import { ResendEmailSender, type EmailSender } from "@/infrastructure/email/resend-sender";
import { prisma } from "./prisma";

/**
 * The owner's "new order" email, sent at least once and, through Resend's
 * idempotency key, at most once per order.
 *
 * - recordOwnerNotification runs inside the transaction that makes an order
 *   count as placed, so a placed order always has a reminder row.
 * - sendOwnerNotifications sends pending rows. Checkout calls it for its own
 *   order right after responding; the expiry job (every 5 minutes) calls it
 *   for anything still pending.
 * - A row is claimed before sending, so the two callers never send the same
 *   row at once; a claim left behind by a crashed sender expires after the
 *   lease. Every failure counts an attempt; after MAX_ATTEMPTS (about an hour
 *   of job runs) the row is FAILED and logged. A failure never touches the order.
 */

/** Sent in Indonesian, the store's operating language; one place to change it. */
const ORDER_EMAIL_LABELS: OrderEmailLabels = id.admin.orderEmail;

export const MAX_ATTEMPTS = 12;
export const CLAIM_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_BATCH = 20;

export interface OwnerNotificationConfig {
  sender: EmailSender;
  from: string;
  to: string;
  /** Absolute origin for the admin link, e.g. https://tokoshopee.example */
  baseUrl: string;
}

export type SendSummary =
  { enabled: false } | { enabled: true; sent: number; failed: number; skipped: number };

let warnedDisabled = false;

/** The configuration from the environment; null when RESEND_API_KEY is unset. */
export function ownerNotificationConfig(): OwnerNotificationConfig | null {
  if (!env.RESEND_API_KEY) {
    if (!warnedDisabled) {
      warnedDisabled = true;
      console.warn("Owner order emails are off: RESEND_API_KEY is not set.");
    }
    return null;
  }
  return {
    sender: new ResendEmailSender(env.RESEND_API_KEY),
    from: env.EMAIL_FROM,
    to: env.ORDER_NOTIFY_EMAIL ?? STORE_CONTACT_EMAIL,
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
  };
}

/** Called inside the transaction that places the order. */
export async function recordOwnerNotification(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.ownerNotification.create({ data: { orderId } });
}

function adminOrderUrl(baseUrl: string, orderNumber: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/admin/orders/${encodeURIComponent(orderNumber)}`;
}

/**
 * Sends pending reminders, oldest first. `orderId` narrows it to one order
 * (checkout's own); without it, up to `limit` rows (the job's sweep).
 */
export async function sendOwnerNotifications(
  config: OwnerNotificationConfig | null,
  options: { orderId?: string; limit?: number; now?: Date } = {},
): Promise<SendSummary> {
  if (!config) return { enabled: false };
  const now = options.now ?? new Date();
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);
  const claimable: Prisma.OwnerNotificationWhereInput = {
    status: "PENDING",
    OR: [{ claimedAt: null }, { claimedAt: { lt: leaseCutoff } }],
  };

  const candidates = await prisma.ownerNotification.findMany({
    where: { ...claimable, ...(options.orderId ? { orderId: options.orderId } : {}) },
    orderBy: { createdAt: "asc" },
    take: options.limit ?? DEFAULT_BATCH,
    select: { id: true },
  });

  const summary = { enabled: true as const, sent: 0, failed: 0, skipped: 0 };
  for (const { id: rowId } of candidates) {
    // The claim is the guard: it only succeeds while the row is still
    // claimable, so a concurrent sender that got here first wins.
    const claim = await prisma.ownerNotification.updateMany({
      where: { id: rowId, ...claimable },
      data: { claimedAt: now },
    });
    if (claim.count === 0) {
      summary.skipped += 1;
      continue;
    }

    const row = await prisma.ownerNotification.findUniqueOrThrow({
      where: { id: rowId },
      select: {
        attempts: true,
        order: {
          select: {
            orderNumber: true,
            createdAt: true,
            productNameSnapshot: true,
            size: true,
            quantity: true,
            totalIDR: true,
            paymentMethod: true,
            cityName: true,
            provinceName: true,
          },
        },
      },
    });
    const { order } = row;

    try {
      const email = buildOrderEmail(
        {
          orderNumber: order.orderNumber,
          createdAt: order.createdAt,
          productName: order.productNameSnapshot,
          size: order.size,
          quantity: order.quantity,
          totalIDR: order.totalIDR,
          paymentMethod: order.paymentMethod,
          cityName: order.cityName,
          provinceName: order.provinceName,
        },
        ORDER_EMAIL_LABELS,
        adminOrderUrl(config.baseUrl, order.orderNumber),
      );
      await config.sender.send({
        ...email,
        from: config.from,
        to: config.to,
        idempotencyKey: `owner-new-order/${order.orderNumber}`,
      });
      await prisma.ownerNotification.update({
        where: { id: rowId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          attempts: row.attempts + 1,
          claimedAt: null,
          lastError: null,
        },
      });
      summary.sent += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const message = (err as Error).message.slice(0, 500);
      await prisma.ownerNotification.update({
        where: { id: rowId },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          attempts,
          lastError: message,
          claimedAt: null,
        },
      });
      console.error(
        `Owner email for ${order.orderNumber} failed (attempt ${attempts}/${MAX_ATTEMPTS}` +
          `${giveUp ? ", giving up" : ", will retry"}): ${message}`,
      );
      summary.failed += 1;
    }
  }
  return summary;
}
