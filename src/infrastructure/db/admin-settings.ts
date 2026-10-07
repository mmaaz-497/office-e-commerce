import { prisma } from "./prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { getLegacyProductId } from "./catalogue";

/** The legacy product's own baseline (003 spec Assumptions); 0 before the import. */
export async function getSoldCountBaseline(): Promise<number> {
  await requireAdminSession();
  const legacyProductId = await getLegacyProductId();
  if (!legacyProductId) return 0;
  const product = await prisma.product.findUnique({
    where: { id: legacyProductId },
    select: { soldCountBaseline: true },
  });
  return product?.soldCountBaseline ?? 0;
}
