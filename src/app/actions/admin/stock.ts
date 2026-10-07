"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/db/prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { applyManualAdjustment } from "@/infrastructure/db/stock-adjustment";
import { SampleStockLockedError, StockChangedError } from "@/domain/errors";
import { adjustStockInputSchema, setProductStockInputSchema } from "./schemas";
import { toErrorResult } from "./result";

const STOCK_LEVEL_ID = "default";

export type AdjustStockResult = { ok: true; quantity: number } | { ok: false; errorKey: string };

export type SetProductStockResult =
  { ok: true; quantity: number } | { ok: false; errorKey: string; currentQuantity?: number };

/**
 * The one stock mutation not tied to an order (FR-062) — StockChange.orderId
 * is nullable for exactly this case. A negative delta that would take the
 * level below zero is refused by the same conditional-update shape used
 * everywhere else stock is touched (R-005), not a separate read-then-check.
 */
export async function adjustStock(rawInput: unknown): Promise<AdjustStockResult> {
  await requireAdminSession();
  const parsed = adjustStockInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { delta, note } = parsed.data;

  try {
    // productId null: a 'default' row opened here belongs to no product yet;
    // the ledger row takes the row's own productId once the import linked it.
    const quantity = await prisma.$transaction((tx) =>
      applyManualAdjustment(tx, { stockLevelId: STOCK_LEVEL_ID, productId: null, delta, note }),
    );
    return { ok: true, quantity };
  } catch (err) {
    return toErrorResult(err);
  }
}

/**
 * The inline per-product editor (spec US3, research R-313). The owner types
 * the quantity they counted; this only turns it into a delta against the
 * value the editor rendered with and hands it to the same manual adjustment,
 * guarded so a concurrent order is never silently overwritten.
 *
 * A sample never gets stock or ledger history (005 R-406, FR-017a). isSample
 * is read inside the adjustment's transaction, so a concurrent
 * markProductReal cannot leave a sample with a ledger row.
 */
export async function setProductStock(rawInput: unknown): Promise<SetProductStockResult> {
  try {
    await requireAdminSession();
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = setProductStockInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };
  const { productId, expectedQuantity, targetQuantity, note } = parsed.data;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stockLevel: { select: { id: true } } },
  });
  if (!product) return { ok: false, errorKey: "errors.validation" };
  // The imported product keeps its 'default' row (003); any other product's
  // row is keyed by its own id, opened here if it has none.
  const stockLevelId = product.stockLevel?.id ?? productId;

  const delta = targetQuantity - expectedQuantity;
  if (delta === 0) return { ok: true, quantity: expectedQuantity };

  try {
    const quantity = await prisma.$transaction(async (tx) => {
      const { isSample } = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { isSample: true },
      });
      if (isSample) throw new SampleStockLockedError();
      return applyManualAdjustment(tx, { stockLevelId, productId, delta, note, expectedQuantity });
    });
    revalidatePath("/admin/products");
    return { ok: true, quantity };
  } catch (err) {
    if (err instanceof StockChangedError) {
      return { ok: false, errorKey: err.messageKey, currentQuantity: err.currentQuantity };
    }
    return toErrorResult(err);
  }
}
