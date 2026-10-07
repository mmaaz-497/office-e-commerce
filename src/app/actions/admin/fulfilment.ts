"use server";

import { prisma } from "@/infrastructure/db/prisma";
import {
  createOrderTransactionPort,
  resolveStockRowId,
} from "@/infrastructure/db/order-transaction";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { assertTransition } from "@/domain/order/transitions";
import { allowedAdminActions } from "@/domain/order/cancellation";
import {
  InvalidTransitionError,
  FulfilmentConflictError,
  InsufficientStockError,
} from "@/domain/errors";
import type { AdminAction, OrderStatus } from "@/domain/order/status";
import {
  confirmCodOrderInputSchema,
  markShippedInputSchema,
  markCompletedInputSchema,
  markReturnedInputSchema,
  cancelOrderInputSchema,
} from "./schemas";
import { toErrorResult } from "./result";

export type AdminActionResult = { ok: true } | { ok: false; errorKey: string };

/**
 * FR-061: the admin interface may only OFFER the actions allowedAdminActions
 * returns for the order's current status, and the server independently
 * refuses anything else — a forged request for an action the UI would never
 * have shown must fail here, not slip through on the raw FSM edge alone
 * (which is deliberately looser for PAID: the FSM permits PAID -> CANCELLED
 * because APPROVE_CANCELLATION uses it, but bare CANCEL must not).
 */
function assertAdminActionOffered(status: OrderStatus, action: AdminAction, to: OrderStatus): void {
  if (!allowedAdminActions(status).includes(action)) {
    throw new InvalidTransitionError(status, to);
  }
}

export async function confirmCodOrder(rawInput: unknown): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = confirmCodOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { status: true, quantity: true },
      });
      const status = order.status as OrderStatus;
      assertAdminActionOffered(status, "CONFIRM_COD", "CONFIRMED");
      assertTransition(status, "CONFIRMED");

      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "CONFIRMED",
        actor: "OWNER",
      });
      if (!applied) throw new InvalidTransitionError(status, "CONFIRMED");

      // No payment has been collected for a COD order yet, so unlike the
      // online-payment path there is nothing to protect by keeping the
      // status change — if stock cannot cover it, undo the confirmation
      // entirely rather than raising a fulfilment conflict (FR-075 exists
      // for money already collected, which is not the case here).
      const decremented = await port.decrementStock({ quantity: order.quantity, orderNumber });
      if (!decremented) {
        // A missing level row means an unseeded environment, which is zero
        // stock as far as this order is concerned (checkout.ts takes the same
        // line) — not a raw database error in the operator's face. The row
        // read is the order's own product's, the one the decrement targeted.
        const stockRowId = await resolveStockRowId(tx, orderNumber);
        const level = stockRowId
          ? await tx.stockLevel.findUnique({ where: { id: stockRowId } })
          : null;
        throw new InsufficientStockError(level?.quantity ?? 0, order.quantity);
      }
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function markShipped(rawInput: unknown): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = markShippedInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber, trackingNumber } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { status: true, conflictFlag: true },
      });
      const status = order.status as OrderStatus;

      // FR-075: a paid order with no stock behind it must never ship.
      if (order.conflictFlag !== "NONE") {
        throw new FulfilmentConflictError();
      }

      assertAdminActionOffered(status, "MARK_SHIPPED", "SHIPPED");
      assertTransition(status, "SHIPPED");

      await tx.order.update({ where: { orderNumber }, data: { trackingNumber } });

      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "SHIPPED",
        actor: "OWNER",
      });
      if (!applied) throw new InvalidTransitionError(status, "SHIPPED");
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function markCompleted(rawInput: unknown): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = markCompletedInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { status: true },
      });
      const status = order.status as OrderStatus;
      assertAdminActionOffered(status, "MARK_COMPLETED", "COMPLETED");
      assertTransition(status, "COMPLETED");

      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "COMPLETED",
        actor: "OWNER",
      });
      if (!applied) throw new InvalidTransitionError(status, "COMPLETED");
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function markReturned(rawInput: unknown): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = markReturnedInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber, refundReference } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { status: true, stockDecremented: true, quantity: true },
      });
      const status = order.status as OrderStatus;
      assertAdminActionOffered(status, "MARK_RETURNED", "RETURNED");
      assertTransition(status, "RETURNED");

      const port = createOrderTransactionPort(tx);
      const applied = await port.applyStatus({
        orderNumber,
        expectedStatus: status,
        nextStatus: "RETURNED",
        actor: "OWNER",
      });
      if (!applied) throw new InvalidTransitionError(status, "RETURNED");

      if (order.stockDecremented) {
        await port.restoreStock({
          quantity: order.quantity,
          orderNumber,
          reason: "ORDER_RETURNED",
        });
      }
      if (refundReference) {
        await tx.order.update({ where: { orderNumber }, data: { refundReference } });
      }
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function cancelOrder(rawInput: unknown): Promise<AdminActionResult> {
  await requireAdminSession();
  const parsed = cancelOrderInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { orderNumber, refundReference } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { status: true, stockDecremented: true, quantity: true },
      });
      const status = order.status as OrderStatus;
      // Deliberately NOT offered for PAID (FR-044) — that order's only path
      // to CANCELLED is resolveCancellation's approve, never a bare cancel.
      assertAdminActionOffered(status, "CANCEL", "CANCELLED");
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
      if (refundReference) {
        await tx.order.update({ where: { orderNumber }, data: { refundReference } });
      }
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
