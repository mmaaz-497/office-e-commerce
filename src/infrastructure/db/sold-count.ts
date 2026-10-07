import { prisma } from "./prisma";
import { getLegacyProductId, productScope } from "./catalogue";

/**
 * A product's own sold-count baseline plus the summed quantity of its orders
 * currently COMPLETED (spec A-004, FR-019). An order that reached COMPLETED and
 * was later returned no longer has status COMPLETED — its current status is
 * RETURNED — so filtering on the current status alone already excludes it
 * without extra bookkeeping.
 *
 * The baseline lives on the product (003 spec Assumptions); the store-wide
 * SOLD_COUNT_BASELINE setting is no longer read. Omitting the product means the
 * legacy product, and unattributed orders count for it (R-202).
 *
 * Returns null when the total is zero so the UI hides the figure entirely
 * (FR-053).
 */
export async function getSoldCount(productId?: string): Promise<number | null> {
  const legacyProductId = await getLegacyProductId();
  const id = productId ?? legacyProductId;
  if (!id) return null;

  const [product, completed] = await Promise.all([
    prisma.product.findUnique({ where: { id }, select: { soldCountBaseline: true } }),
    prisma.order.aggregate({
      where: { status: "COMPLETED", ...productScope(id, legacyProductId) },
      _sum: { quantity: true },
    }),
  ]);

  const total = (product?.soldCountBaseline ?? 0) + (completed._sum.quantity ?? 0);
  return total > 0 ? total : null;
}
