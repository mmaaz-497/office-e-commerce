import { Prisma } from "@prisma/client";
import { InsufficientStockError, StockChangedError } from "@/domain/errors";

/**
 * The one manual stock mutation (FR-062, research R-313), shared by the
 * /admin/stock form (`adjustStock`, the 'default' row) and the inline
 * per-product editor (`setProductStock`). Runs inside the caller's
 * transaction so a refusal rolls back the row it may have opened.
 *
 * With `expectedQuantity`, the conditional update also requires the row to
 * still hold that value; a mismatch surfaces as StockChangedError carrying
 * the value it moved to, never as a silent overwrite.
 */
export async function applyManualAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    stockLevelId: string;
    productId: string | null;
    delta: number;
    note: string;
    expectedQuantity?: number;
  },
): Promise<number> {
  const { stockLevelId, productId, delta, note, expectedQuantity } = input;

  // A level row missing (an unseeded database, or a product created without
  // one) opens at zero here, which keeps the conditional update below the
  // only place the quantity ever changes: a negative delta against a missing
  // row is still refused rather than opening at a negative level.
  await tx.$executeRaw`
    INSERT INTO "StockLevel" (id, "productId", quantity, "updatedAt")
    VALUES (${stockLevelId}, ${productId}, 0, now())
    ON CONFLICT (id) DO NOTHING
  `;

  const expectedClause =
    expectedQuantity === undefined ? Prisma.empty : Prisma.sql`AND quantity = ${expectedQuantity}`;
  const rows = await tx.$queryRaw<Array<{ quantity: number; productId: string | null }>>`
    UPDATE "StockLevel"
    SET quantity = quantity + ${delta}, "updatedAt" = now()
    WHERE id = ${stockLevelId} AND quantity + ${delta} >= 0 ${expectedClause}
    RETURNING quantity, "productId"
  `;
  if (rows.length === 0) {
    const current = await tx.stockLevel.findUniqueOrThrow({ where: { id: stockLevelId } });
    if (expectedQuantity !== undefined && current.quantity !== expectedQuantity) {
      throw new StockChangedError(current.quantity);
    }
    throw new InsufficientStockError(current.quantity, -delta);
  }

  await tx.stockChange.create({
    data: {
      delta,
      resultingQuantity: rows[0].quantity,
      reason: "MANUAL_ADJUSTMENT",
      note,
      // The row's own product; null on a 'default' row the catalogue import
      // has not linked yet.
      productId: rows[0].productId,
    },
  });
  return rows[0].quantity;
}
