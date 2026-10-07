/**
 * Demo reviews and demo orders ONLY — never run against production
 * (Constitution Principle VII, FR-052, SC-012). Guarded by two independent
 * conditions, so a single mistake (an unset NODE_ENV, for instance) cannot
 * seed fabricated content into the real database.
 */
import "dotenv/config";
import { prisma } from "../src/infrastructure/db/prisma";
import { assertSeedAllowed } from "../src/infrastructure/db/seed-guard";

async function main() {
  assertSeedAllowed(process.env);

  await prisma.stockLevel.upsert({
    where: { id: "default" },
    create: { id: "default", quantity: 50 },
    update: { quantity: 50 },
  });

  // 003: demo rows belong to the legacy product — the one the 'default' stock
  // row is linked to by `npm run catalogue:import` (ADR-0004, R-203).
  const legacy = await prisma.stockLevel.findUniqueOrThrow({
    where: { id: "default" },
    select: { product: { select: { id: true, translations: { where: { locale: "id" } } } } },
  });
  if (!legacy.product) {
    throw new Error("Run npm run catalogue:import first: the catalogue has no legacy product.");
  }
  const productId = legacy.product.id;
  const productNameSnapshot = legacy.product.translations[0]?.name ?? null;

  const demoOrders = [
    {
      orderNumber: "TKS-DEMO01-ABCDE",
      status: "COMPLETED" as const,
      paymentMethod: "ONLINE" as const,
      customerName: "Sari Wulandari",
      trackingNumber: "JNE1234567890",
    },
    {
      orderNumber: "TKS-DEMO02-FGHJK",
      status: "SHIPPED" as const,
      paymentMethod: "COD" as const,
      customerName: "Budi Santoso",
      trackingNumber: "JNT9876543210",
    },
    {
      orderNumber: "TKS-DEMO03-MNPQR",
      status: "PENDING_PAYMENT" as const,
      paymentMethod: "ONLINE" as const,
      customerName: "Dewi Anggraini",
      trackingNumber: null,
    },
  ];

  const createdOrders = [];
  for (const demo of demoOrders) {
    const order = await prisma.order.upsert({
      where: { orderNumber: demo.orderNumber },
      create: {
        orderNumber: demo.orderNumber,
        status: demo.status,
        paymentMethod: demo.paymentMethod,
        customerName: demo.customerName,
        phone: "081200000000",
        phoneNormalized: "+6281200000000",
        provinceCode: "31",
        provinceName: "Daerah Khusus Ibukota Jakarta",
        cityCode: "3171",
        cityName: "Kota Jakarta Selatan",
        district: "Kebayoran Baru",
        postalCode: "12110",
        streetAddress: "Jl. Contoh No. 1 (demo data)",
        quantity: 1,
        unitPriceIDR: 169999,
        shippingCostIDR: 15000,
        codFeeIDR: demo.paymentMethod === "COD" ? 5000 : 0,
        totalIDR: 169999 + 15000 + (demo.paymentMethod === "COD" ? 5000 : 0),
        billableWeightKg: 1,
        trackingNumber: demo.trackingNumber,
        stockDecremented: demo.status !== "PENDING_PAYMENT",
        productId,
        productNameSnapshot,
      },
      update: {},
    });
    createdOrders.push(order);
  }

  const completedOrder = createdOrders.find((o) => o.status === "COMPLETED");

  await prisma.review.upsert({
    where: { orderId: completedOrder?.id ?? "__none__" },
    create: {
      orderId: completedOrder?.id,
      origin: "VERIFIED_PURCHASE",
      rating: 5,
      comment: "Empuk banget dan gemoy, anak saya suka! (demo data)",
      reviewerName: completedOrder?.customerName ?? "Demo Customer",
      productId,
      published: true,
      reviewedAt: new Date(),
    },
    update: {},
  });

  const ownerEnteredReviews = [
    { rating: 5, comment: "Kualitasnya bagus, cepat sampai. (demo data)", reviewerName: "Rina K." },
    { rating: 4, comment: "Nyaman dipakai, ukurannya pas. (demo data)", reviewerName: "Agus P." },
    // Layout cases: a mid rating with a long comment, and a rating with no comment.
    {
      rating: 3,
      comment:
        "Modelnya lucu dan solnya empuk, tapi bagian depan agak sempit untuk kaki saya yang lebar. Kalau mau beli lagi saya ambil satu ukuran lebih besar. (demo data)",
      reviewerName: "Maya L.",
    },
    { rating: 5, comment: null, reviewerName: "Hendra W." },
  ];

  for (const [i, r] of ownerEnteredReviews.entries()) {
    const id = `demo-owner-review-${i}`;
    await prisma.review.upsert({
      where: { id },
      create: {
        id,
        orderId: null,
        origin: "OWNER_ENTERED",
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewerName,
        productId,
        published: true,
        reviewedAt: new Date(),
      },
      update: {},
    });
  }

  console.log(
    `Dev seed complete: ${createdOrders.length} demo orders, ${ownerEnteredReviews.length + 1} demo reviews.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
