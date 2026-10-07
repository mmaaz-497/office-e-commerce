import type { Prisma } from "@prisma/client";
import type { ProductStatus } from "@/domain/catalogue/status";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { prisma } from "./prisma";

/**
 * Admin catalogue reads (research R-314, contracts/admin-catalogue-actions.md
 * Pages). Unlike the storefront readers in catalogue.ts these see every
 * status, DRAFT included. Every export checks the session first, as
 * admin-stock.ts does: a page that forgets its own check still cannot leak.
 */

/** Covers tens of products for years; pagination is Phase 6. */
const LIST_LIMIT = 200;

export interface AdminProductFilters {
  status?: ProductStatus;
  categoryId?: string;
  q?: string;
}

export async function listAdminProducts(filters: AdminProductFilters = {}) {
  await requireAdminSession();

  const where: Prisma.ProductWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.categoryId) where.categoryId = filters.categoryId;

  // Prisma parameterises the value but passes it to ILIKE unescaped, so `%`
  // and `_` would act as wildcards (a search for "%" matched every product).
  // Escaping them with PostgreSQL's default LIKE escape character makes them
  // literal; admin-products-list.test.ts pins it.
  const trimmed = filters.q?.trim();
  if (trimmed) {
    const q = escapeLike(trimmed);
    where.OR = [
      { translations: { some: { name: { contains: q, mode: "insensitive" } } } },
      { slug: { contains: q, mode: "insensitive" } },
      { sku: { contains: q, mode: "insensitive" } },
    ];
  }

  return prisma.product.findMany({
    where,
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: LIST_LIMIT,
    select: {
      id: true,
      slug: true,
      sku: true,
      status: true,
      priceIDR: true,
      isSample: true,
      updatedAt: true,
      category: { select: { nameEn: true } },
      translations: { where: { locale: "en" }, select: { name: true } },
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true, altEn: true } },
      stockLevel: { select: { quantity: true } },
    },
  });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export type AdminProductRow = Awaited<ReturnType<typeof listAdminProducts>>[number];

export async function getAdminProduct(id: string) {
  await requireAdminSession();

  return prisma.product.findUnique({
    where: { id },
    include: {
      translations: true,
      images: { orderBy: { position: "asc" } },
      stockLevel: { select: { id: true, quantity: true } },
    },
  });
}

export type AdminProduct = NonNullable<Awaited<ReturnType<typeof getAdminProduct>>>;

export async function listCategories() {
  await requireAdminSession();

  return prisma.category.findMany({
    orderBy: [{ position: "asc" }, { nameEn: "asc" }],
    select: { id: true, slug: true, nameId: true, nameEn: true, position: true },
  });
}

export async function listCategoriesWithCounts() {
  await requireAdminSession();

  return prisma.category.findMany({
    orderBy: [{ position: "asc" }, { nameEn: "asc" }],
    select: {
      id: true,
      slug: true,
      nameId: true,
      nameEn: true,
      position: true,
      _count: { select: { products: true } },
    },
  });
}
