import { Prisma, type Order, type PrismaClient } from "@prisma/client";
import { generateOrderNumber } from "@/domain/order/order-number";
import { prisma } from "./prisma";

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";
const DEFAULT_MAX_ATTEMPTS = 3;

function isOrderNumberCollision(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION &&
    Array.isArray(error.meta?.target) &&
    (error.meta.target as unknown[]).includes("orderNumber")
  );
}

export interface CreateOrderWithRetryOptions {
  /** Defaults to 3 — the generator's collision rate makes uniqueness a
   * database guarantee, not a probability (research R-013), so this exists
   * only to absorb the vanishingly rare real collision, never to paper over
   * a systemic one. */
  maxAttempts?: number;
  /** Injectable for tests that need to force a specific collision sequence
   * deterministically — a CSPRNG-based generator cannot be made to collide
   * on demand. */
  generateOrderNumber?: () => string;
}

type PrismaOrDelegate = PrismaClient | Prisma.TransactionClient;

/**
 * Creates an order, retrying order-number generation on a unique-constraint
 * violation rather than surfacing an error to the customer. A P2002 on
 * `orderNumber` is the ONLY error retried — any other failure (a different
 * unique constraint, a validation error, a connection failure) propagates
 * immediately, since retrying those would silently mask a real defect.
 */
export async function createOrderWithRetry(
  data: Omit<Prisma.OrderCreateInput, "orderNumber">,
  options: CreateOrderWithRetryOptions = {},
  client: PrismaOrDelegate = prisma,
): Promise<Order> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const generate = options.generateOrderNumber ?? generateOrderNumber;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const orderNumber = generate();
    try {
      return await client.order.create({ data: { ...data, orderNumber } });
    } catch (error) {
      if (!isOrderNumberCollision(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new Error(
    `Failed to create order after ${maxAttempts} attempts: order number generation kept colliding`,
    { cause: lastError },
  );
}
