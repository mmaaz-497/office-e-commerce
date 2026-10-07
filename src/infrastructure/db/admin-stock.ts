import { prisma } from "./prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";

// The legacy product's row (R-203) until the 2b per-product stock admin.
const STOCK_LEVEL_ID = "default";

/** FR-062: current stock plus the full change log, newest first, with
 * reason and order reference. */
export async function getStockPageData() {
  await requireAdminSession();

  const [stockLevel, changes] = await Promise.all([
    prisma.stockLevel.findUnique({ where: { id: STOCK_LEVEL_ID } }),
    prisma.stockChange.findMany({
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNumber: true } } },
    }),
  ]);

  return { quantity: stockLevel?.quantity ?? 0, changes };
}
