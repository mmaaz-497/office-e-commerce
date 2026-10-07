"use server";

import { prisma } from "@/infrastructure/db/prisma";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { assertTransition } from "@/domain/order/transitions";
import { InvalidTransitionError } from "@/domain/errors";
import type { OrderStatus } from "@/domain/order/status";
import { resolveCancellationInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type ResolveCancellationResult = { ok: true } | { ok: false; errorKey: string };

/**
 * Approve transitions to CANCELLED and restores stock when stockDecremented
 * (FR-044); reject closes the request with the order left completely
 * unchanged. Both go through the same OrderTransactionPort every other
 * cancellation path uses (ADR-0001) rather than a bespoke update here.
 */
export async function resolveCancellation(rawInput: unknown): Promise<ResolveCancellationResult> {
  await requireAdminSession();
  const parsed = resolveCancellationInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber, approve } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { id: true, status: true, stockDecremented: true, quantity: true },
      });
      const status = order.status as OrderStatus;

      const cancellationRequest = await tx.cancellationRequest.findUnique({
        where: { orderId: order.id },
      });
      if (!cancellationRequest || cancellationRequest.resolution !== "OPEN") {
        throw new InvalidTransitionError(status, "CANCELLED");
      }

      if (!approve) {
        await tx.cancellationRequest.update({
          where: { orderId: order.id },
          data: { resolution: "REJECTED", resolvedAt: new Date() },
        });
        return;
      }

      assertTransition(status, "CANCELLED");
      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "CANCELLED",
        actor: "OWNER",
      });
      if (!applied) throw new InvalidTransitionError(status, "CANCELLED");

      if (order.stockDecremented) {
        await port.restoreStock({
          quantity: order.quantity,
          orderNumber,
          reason: "ORDER_CANCELLED",
        });
      }
      await tx.cancellationRequest.update({
        where: { orderId: order.id },
        data: { resolution: "APPROVED", resolvedAt: new Date() },
      });
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
