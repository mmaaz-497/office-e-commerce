"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/prisma";
import { createOrderTransactionPort } from "@/infrastructure/db/order-transaction";
import { findOrderByCredentials } from "@/infrastructure/db/order-lookup";
import { customerCancellationRight } from "@/domain/order/cancellation";
import { assertTransition } from "@/domain/order/transitions";
import {
  OrderLookupFailedError,
  InvalidTransitionError,
  DuplicateCancellationRequestError,
} from "@/domain/errors";
import type { OrderStatus } from "@/domain/order/status";
import { cancelOrderInputSchema, requestCancellationInputSchema } from "./schemas/lookup";
import { toErrorResult } from "./result";

export type CancellationResult = { ok: true } | { ok: false; errorKey: string };

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

/** Direct self-service cancellation — only when customerCancellationRight
 * says CANCEL_DIRECTLY (FR-043). Routed through assertTransition and the
 * same conditional applyStatus every other mutation path uses (ADR-0001). */
export async function cancelOrder(rawInput: unknown): Promise<CancellationResult> {
  const parsed = cancelOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }
  const { orderNumber, phone } = parsed.data;

  const order = await findOrderByCredentials(orderNumber, phone);
  if (!order) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }

  const right = customerCancellationRight(order.status, order.paymentMethod);
  if (right !== "CANCEL_DIRECTLY") {
    return { ok: false, errorKey: "errors.invalidTransition" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const status = order.status as OrderStatus;
      assertTransition(status, "CANCELLED");

      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "CANCELLED",
        actor: "CUSTOMER",
      });
      if (!applied) throw new InvalidTransitionError(status, "CANCELLED");

      if (order.stockDecremented) {
        await port.restoreStock({
          quantity: order.quantity,
          orderNumber,
          reason: "ORDER_CANCELLED",
        });
      }
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

/** REQUEST_ONLY path (PAID) — creates a CancellationRequest and leaves the
 * order's status untouched (FR-044); the owner resolves it later via
 * resolveCancellation. */
export async function requestCancellation(rawInput: unknown): Promise<CancellationResult> {
  const parsed = requestCancellationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }
  const { orderNumber, phone, reason } = parsed.data;

  const order = await findOrderByCredentials(orderNumber, phone);
  if (!order) {
    return { ok: false, errorKey: new OrderLookupFailedError().messageKey };
  }

  const right = customerCancellationRight(order.status, order.paymentMethod);
  if (right !== "REQUEST_ONLY") {
    return { ok: false, errorKey: "errors.invalidTransition" };
  }

  try {
    await prisma.cancellationRequest.create({ data: { orderId: order.id, reason } });
    return { ok: true };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_CONSTRAINT_VIOLATION
    ) {
      return toErrorResult(new DuplicateCancellationRequestError());
    }
    return toErrorResult(err);
  }
}
