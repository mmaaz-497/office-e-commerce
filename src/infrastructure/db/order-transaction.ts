import type { Prisma } from "@prisma/client";
import type { Actor, OrderStatus, PaymentMethod } from "@/domain/order/status";
import { canTransition } from "@/domain/order/transitions";
import type { NotificationOutcome, PaymentProvider } from "@/domain/payment/provider";
import { prisma } from "./prisma";
import { LEGACY_STOCK_LEVEL_ID } from "./legacy-stock";

export type StockChangeReason =
  | "ORDER_PAID"
  | "ORDER_CONFIRMED"
  | "ORDER_CANCELLED"
  | "ORDER_EXPIRED"
  | "ORDER_RETURNED"
  | "MANUAL_ADJUSTMENT";

/**
 * Everything here runs INSIDE one database transaction. Implementations MUST
 * perform the status re-read and the conditional stock update within that
 * same transaction (R-004, R-005).
 */
export interface OrderTransactionPort {
  /** Reads the order FOR UPDATE; the returned status is the one to authorise on. */
  loadForUpdate(orderNumber: string): Promise<{
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    quantity: number;
    stockDecremented: boolean;
  }>;

  /** Conditional on the status read above; returns false if another writer won the race. */
  applyStatus(args: {
    orderNumber: string;
    expectedStatus: OrderStatus;
    nextStatus: OrderStatus;
    actor: Actor;
    note?: string;
  }): Promise<boolean>;

  /** `UPDATE ... WHERE quantity >= n`. Returns false when stock is insufficient. */
  decrementStock(args: { quantity: number; orderNumber: string }): Promise<boolean>;

  /** Only called when `stockDecremented` is true. Writes the ledger row in the same tx. */
  restoreStock(args: {
    quantity: number;
    orderNumber: string;
    reason: StockChangeReason;
  }): Promise<void>;
}

/**
 * The StockLevel an order's stock moves on (contracts/checkout.md "Stock
 * port"): the row linked to the order's product. An order with no product was
 * placed before the catalogue existed, or by the pre-catalogue release during
 * a rollback window, and belongs to the legacy product's 'default' row
 * (R-202). A product with no stock row yields null.
 *
 * Exported for the admin COD confirmation, which reports that same row's
 * quantity when stock cannot cover the order.
 */
export async function resolveStockRowId(
  tx: Prisma.TransactionClient,
  orderNumber: string,
): Promise<string | null> {
  const rows = await tx.$queryRaw<Array<{ orderProductId: string | null; stockId: string | null }>>`
    SELECT o."productId" AS "orderProductId", s.id AS "stockId"
    FROM "Order" o
    LEFT JOIN "StockLevel" s ON s."productId" = o."productId"
    WHERE o."orderNumber" = ${orderNumber}
  `;
  if (rows.length === 0) {
    throw new Error(`Order ${orderNumber} not found`);
  }
  const [row] = rows;
  return row.orderProductId === null ? LEGACY_STOCK_LEVEL_ID : row.stockId;
}

function decrementReasonFor(status: OrderStatus): StockChangeReason {
  if (status === "PAID") return "ORDER_PAID";
  if (status === "CONFIRMED") return "ORDER_CONFIRMED";
  // stockEffectOf only returns DECREMENT for ->PAID and ->CONFIRMED (T023) —
  // reaching here means a caller invoked decrementStock outside that
  // contract, which is a bug worth surfacing loudly rather than guessing.
  throw new Error(`decrementStock called for order in unexpected status ${status}`);
}

/**
 * Callers pass the same `tx` (a Prisma transaction client, from
 * prisma.$transaction) across every call within one mutation, so the status
 * re-read and the conditional stock update are atomic together.
 */
export function createOrderTransactionPort(tx: Prisma.TransactionClient): OrderTransactionPort {
  return {
    async loadForUpdate(orderNumber) {
      const rows = await tx.$queryRaw<
        Array<{
          status: OrderStatus;
          paymentMethod: PaymentMethod;
          quantity: number;
          stockDecremented: boolean;
        }>
      >`
        SELECT status, "paymentMethod", quantity, "stockDecremented"
        FROM "Order"
        WHERE "orderNumber" = ${orderNumber}
        FOR UPDATE
      `;
      if (rows.length === 0) {
        throw new Error(`Order ${orderNumber} not found`);
      }
      return rows[0];
    },

    async applyStatus({ orderNumber, expectedStatus, nextStatus, actor, note }) {
      if (nextStatus === "SHIPPED") {
        // FR-075: an order in an unresolved fulfilment conflict must never
        // be marked shipped. Enforced here, at the single authorisation
        // point every mutation path shares, rather than only in the admin
        // action — a policy violation, not an ordinary lost race, so it
        // throws instead of returning false.
        const conflict = await tx.order.findUniqueOrThrow({
          where: { orderNumber },
          select: { conflictFlag: true },
        });
        if (conflict.conflictFlag !== "NONE") {
          throw new Error(
            `Order ${orderNumber} has an unresolved fulfilment conflict (${conflict.conflictFlag}) and cannot be marked shipped until the owner resolves it`,
          );
        }
      }

      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        UPDATE "Order"
        SET status = ${nextStatus}::"OrderStatus", "updatedAt" = now()
        WHERE "orderNumber" = ${orderNumber} AND status = ${expectedStatus}::"OrderStatus"
        RETURNING id
      `;
      if (rows.length === 0) {
        return false;
      }
      await tx.orderStatusEvent.create({
        data: {
          orderId: rows[0].id,
          fromStatus: expectedStatus,
          toStatus: nextStatus,
          actor,
          note,
        },
      });
      return true;
    },

    async decrementStock({ quantity, orderNumber }) {
      const stockRowId = await resolveStockRowId(tx, orderNumber);
      if (stockRowId === null) {
        // No stock row for this product is no stock at all: the caller's
        // existing insufficient-stock or conflict path handles it.
        return false;
      }
      const rows = await tx.$queryRaw<Array<{ quantity: number; productId: string | null }>>`
        UPDATE "StockLevel"
        SET quantity = quantity - ${quantity}, "updatedAt" = now()
        WHERE id = ${stockRowId} AND quantity >= ${quantity}
        RETURNING quantity, "productId"
      `;
      if (rows.length === 0) {
        return false;
      }
      const { quantity: resultingQuantity, productId } = rows[0];

      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { id: true, status: true },
      });
      const reason = decrementReasonFor(order.status as OrderStatus);

      await tx.stockChange.create({
        data: { delta: -quantity, resultingQuantity, reason, orderId: order.id, productId },
      });
      await tx.order.update({ where: { orderNumber }, data: { stockDecremented: true } });
      return true;
    },

    async restoreStock({ quantity, orderNumber, reason }) {
      const stockRowId = await resolveStockRowId(tx, orderNumber);
      const rows =
        stockRowId === null
          ? []
          : await tx.$queryRaw<Array<{ quantity: number; productId: string | null }>>`
              UPDATE "StockLevel"
              SET quantity = quantity + ${quantity}, "updatedAt" = now()
              WHERE id = ${stockRowId}
              RETURNING quantity, "productId"
            `;
      if (rows.length === 0) {
        throw new Error("StockLevel row does not exist — seed the store before accepting orders");
      }
      const { quantity: resultingQuantity, productId } = rows[0];

      const order = await tx.order.findUniqueOrThrow({
        where: { orderNumber },
        select: { id: true },
      });
      await tx.stockChange.create({
        data: { delta: quantity, resultingQuantity, reason, orderId: order.id, productId },
      });
      // Clearing stockDecremented here, not left to the caller, is what makes
      // a double restore structurally impossible even if this were somehow
      // invoked twice (data-model.md).
      await tx.order.update({ where: { orderNumber }, data: { stockDecremented: false } });
    },
  };
}

export type PaymentSuccessOutcome =
  | { kind: "APPLIED"; nextStatus: "PAID" | "CONFIRMED" }
  | { kind: "CONFLICT_STOCK_UNAVAILABLE" }
  | { kind: "CONFLICT_ALREADY_EXPIRED" }
  | { kind: "IGNORED_INVALID_TRANSITION" };

/**
 * Applies a successful payment to an order — shared by the Midtrans webhook
 * (T073a) and the expiry job's rescue path (T076), so "a payment succeeded
 * for this order" means exactly one code path regardless of which caller
 * discovered it.
 */
export async function applyPaymentSuccess(
  tx: Prisma.TransactionClient,
  orderNumber: string,
  actor: Actor,
): Promise<PaymentSuccessOutcome> {
  const port = createOrderTransactionPort(tx);
  const current = await port.loadForUpdate(orderNumber);

  // FR-031/FR-075: a success against an already-EXPIRED order must not
  // revive it — flag it for the owner instead.
  if (current.status === "EXPIRED") {
    await tx.order.update({
      where: { orderNumber },
      data: { conflictFlag: "PAID_AFTER_EXPIRY", conflictDetectedAt: new Date() },
    });
    return { kind: "CONFLICT_ALREADY_EXPIRED" };
  }

  const nextStatus: OrderStatus = current.paymentMethod === "ONLINE" ? "PAID" : "CONFIRMED";

  // Covers "already applied" (a second success notification/rescue attempt
  // after the order is already PAID/CONFIRMED) and any other status this
  // outcome has no legal edge to (FR-030: never move an order backwards).
  if (!canTransition(current.status, nextStatus)) {
    return { kind: "IGNORED_INVALID_TRANSITION" };
  }

  const applied = await port.applyStatus({
    orderNumber,
    expectedStatus: current.status,
    nextStatus,
    actor,
  });
  if (!applied) {
    return { kind: "IGNORED_INVALID_TRANSITION" };
  }

  const decremented = await port.decrementStock({ quantity: current.quantity, orderNumber });
  if (!decremented) {
    // FR-075: the payment is real and stays PAID/CONFIRMED — the customer's
    // money arrived — but stock cannot cover it. Flag, never oversell.
    await tx.order.update({
      where: { orderNumber },
      data: { conflictFlag: "PAID_STOCK_UNAVAILABLE", conflictDetectedAt: new Date() },
    });
    return { kind: "CONFLICT_STOCK_UNAVAILABLE" };
  }

  return { kind: "APPLIED", nextStatus: nextStatus as "PAID" | "CONFIRMED" };
}

export type ExpiryCheckResult =
  | { action: "none" }
  | { action: "skipped" }
  | { action: "expired" }
  | { action: "rescued" }
  | { action: "rescued-conflict" };

/**
 * The single expiry decision, called identically by the cron job (T076) and
 * by any read of a PENDING_PAYMENT order past expiresAt (T078) — one expiry
 * behaviour, not two. Re-queries the provider before ever expiring an order,
 * so a paid-but-notification-lost order is rescued rather than killed; when
 * the provider is unreachable the order is left untouched (ADR-0002).
 */
export async function checkAndExpireOrRescue(
  orderNumber: string,
  paymentProvider: PaymentProvider,
): Promise<ExpiryCheckResult> {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (
    !order ||
    order.status !== "PENDING_PAYMENT" ||
    !order.expiresAt ||
    order.expiresAt > new Date()
  ) {
    return { action: "none" };
  }

  let outcome: NotificationOutcome;
  try {
    outcome = await paymentProvider.fetchTransactionStatus(
      order.midtransOrderId ?? order.orderNumber,
    );
  } catch {
    // Expiry is late during an outage; it is never wrong (ADR-0002).
    return { action: "skipped" };
  }

  if (outcome === "PAYMENT_SUCCESS") {
    const result = await prisma.$transaction((tx) =>
      applyPaymentSuccess(tx, orderNumber, "SYSTEM"),
    );
    return result.kind === "CONFLICT_STOCK_UNAVAILABLE"
      ? { action: "rescued-conflict" }
      : { action: "rescued" };
  }

  await prisma.$transaction(async (tx) => {
    const port = createOrderTransactionPort(tx);
    await port.applyStatus({
      orderNumber,
      expectedStatus: "PENDING_PAYMENT",
      nextStatus: "EXPIRED",
      actor: "SYSTEM",
    });
  });
  return { action: "expired" };
}
