import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { midtransNotificationSchema } from "./schema";
import { prisma } from "@/infrastructure/db/prisma";
import { applyPaymentSuccess } from "@/infrastructure/db/order-transaction";
import { MidtransProvider } from "@/infrastructure/payment/midtrans-provider";
import { interpretNotification } from "@/domain/payment/interpret-notification";

const paymentProvider = new MidtransProvider();

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/**
 * Ordered steps are part of the contract (contracts/http-api.md, research
 * R-007, ADR-0002): parse+validate the body → verify signature BEFORE any
 * order state is read or written → insert-first into ProcessedNotification
 * (a unique violation IS the idempotency check) → interpret → apply via
 * assertTransition inside a transaction → ALWAYS return 2xx once durably
 * recorded. A 4xx here would invite five Midtrans retries of a payload we
 * will never accept.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    console.error("Midtrans webhook: request body is not valid JSON");
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 200 });
  }

  const parsedBody = midtransNotificationSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    console.error("Midtrans webhook: payload failed schema validation", parsedBody.error.flatten());
    return NextResponse.json({ ok: false, reason: "invalid_payload" }, { status: 200 });
  }
  const notification = parsedBody.data;

  const signatureValid = paymentProvider.verifyNotificationSignature(notification);
  if (!signatureValid) {
    console.error("Midtrans webhook: signature verification failed", {
      orderId: notification.orderId,
    });
    return NextResponse.json({ ok: false, reason: "invalid_signature" }, { status: 200 });
  }

  let processedNotificationId: string;
  try {
    const record = await prisma.processedNotification.create({
      data: {
        transactionId: notification.transactionId,
        transactionStatus: notification.transactionStatus,
        statusCode: notification.statusCode,
        orderNumber: notification.orderId,
        applied: false,
        grossAmount: Math.round(Number(notification.grossAmount)),
        paymentType: notification.paymentType,
        transactionTime: notification.transactionTime
          ? new Date(notification.transactionTime)
          : undefined,
        signatureKey: notification.signatureKey,
      },
    });
    processedNotificationId = record.id;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      // Duplicate (transactionId, transactionStatus, statusCode) — the
      // insert-first pattern IS the idempotency check (FR-029).
      return NextResponse.json({ ok: true, reason: "duplicate" }, { status: 200 });
    }
    throw err;
  }

  const outcome = interpretNotification({
    transactionStatus: notification.transactionStatus,
    fraudStatus: notification.fraudStatus,
    statusCode: notification.statusCode,
  });

  if (outcome !== "PAYMENT_SUCCESS") {
    // pending/failed/expired/ignore are recorded (applied stays false) but
    // never move the order — a `pending` arriving after `settlement` must
    // not downgrade it (FR-030).
    return NextResponse.json({ ok: true, reason: outcome }, { status: 200 });
  }

  const result = await prisma.$transaction((tx) =>
    applyPaymentSuccess(tx, notification.orderId, "PAYMENT_PROVIDER"),
  );

  await prisma.processedNotification.update({
    where: { id: processedNotificationId },
    data: { applied: result.kind === "APPLIED" },
  });

  return NextResponse.json({ ok: true, reason: result.kind }, { status: 200 });
}
