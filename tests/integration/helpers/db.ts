import { prisma } from "@/infrastructure/db/prisma";
import type { Category, Prisma, Product, ProductStatus } from "@prisma/client";
import { buildImportSource, importCatalogue } from "@/infrastructure/db/catalogue-import";

/** Each integration/concurrency test file gets a truncated schema (research R-015). */
export async function resetDb(): Promise<void> {
  await prisma.orderStatusEvent.deleteMany();
  await prisma.stockChange.deleteMany();
  await prisma.review.deleteMany();
  await prisma.cancellationRequest.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockLevel.deleteMany();
  // 003 catalogue — after everything that references a product (ON DELETE RESTRICT).
  await prisma.productImage.deleteMany();
  await prisma.productTranslation.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.processedNotification.deleteMany();
  await prisma.rateLimit.deleteMany();
  await prisma.setting.deleteMany();
}

/**
 * Opens the 'default' stock row at `quantity`, then runs the real catalogue
 * import (003, R-213) — so every test that seeds stock also gets the imported
 * slippers-gemoy product, linked to that row, exactly as production has it.
 */
export async function seedStockLevel(quantity: number): Promise<void> {
  await prisma.stockLevel.create({ data: { id: "default", quantity } });
  await seedCatalogue();
}

/** Runs the real catalogue import. Without a prior stock row it opens one at 0. */
export async function seedCatalogue(): Promise<void> {
  await prisma.$transaction((tx) => importCatalogue(tx, buildImportSource()));
}

/**
 * A second product for multi-product tests: category `sandal`, minimal valid
 * id/en content and one image. `stock` opens its own StockLevel (id =
 * productId); omit it to model a product with no stock row.
 */
export async function seedProduct(options: {
  slug: string;
  status: ProductStatus;
  priceIDR: number | null;
  stock?: number;
}): Promise<Product> {
  const category = await prisma.category.upsert({
    where: { slug: "sandal" },
    create: { slug: "sandal", nameId: "Sandal", nameEn: "Sandals" },
    update: {},
  });
  const product = await prisma.product.create({
    data: {
      slug: options.slug,
      status: options.status,
      priceIDR: options.priceIDR,
      categoryId: category.id,
      position: 10,
      translations: {
        create: [
          {
            locale: "id",
            name: `Produk ${options.slug}`,
            shortDescription: "Deskripsi singkat produk uji coba.",
            longDescription: "",
            highlights: ["Uji"],
            specs: [],
          },
          {
            locale: "en",
            name: `Product ${options.slug}`,
            shortDescription: "Short description of a test product.",
            longDescription: "",
            highlights: ["Test"],
            specs: [],
          },
        ],
      },
      images: {
        create: [
          {
            url: "/images/product/banner-new-arrival-square.png",
            width: 1254,
            height: 1254,
            orientation: "square",
            altId: "Foto produk uji",
            altEn: "Test product photo",
            position: 0,
          },
        ],
      },
    },
  });
  if (options.stock !== undefined) {
    await prisma.stockLevel.create({
      data: { id: product.id, productId: product.id, quantity: options.stock },
    });
  }
  return product;
}

/** A category for storefront-category tests (006 T032). */
export async function seedCategory(options: {
  slug: string;
  nameId: string;
  nameEn: string;
  position?: number;
  createdAt?: Date;
}): Promise<Category> {
  return prisma.category.create({ data: { position: 0, ...options } });
}

let orderCounter = 0;

/** A minimally-valid Order row with sensible test defaults, overridable per field. */
export function testOrderData(
  overrides: Partial<Prisma.OrderCreateInput> = {},
): Prisma.OrderCreateInput {
  orderCounter += 1;
  return {
    orderNumber: `TKS-TEST00-${String(orderCounter).padStart(5, "0")}`,
    status: "PENDING_PAYMENT",
    paymentMethod: "ONLINE",
    customerName: "Test Customer",
    phone: "081234567890",
    phoneNormalized: "+6281234567890",
    provinceCode: "31",
    provinceName: "Daerah Khusus Ibukota Jakarta",
    cityCode: "3171",
    cityName: "Kota Jakarta Selatan",
    district: "Kebayoran Baru",
    postalCode: "12110",
    streetAddress: "Jl. Test No. 1",
    quantity: 1,
    unitPriceIDR: 169999,
    shippingCostIDR: 15000,
    codFeeIDR: 0,
    totalIDR: 184999,
    billableWeightKg: 1,
    ...overrides,
  };
}
