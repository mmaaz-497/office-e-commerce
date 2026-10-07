-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'COD_PENDING', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'COD');

-- CreateEnum
CREATE TYPE "Actor" AS ENUM ('CUSTOMER', 'OWNER', 'PAYMENT_PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConflictFlag" AS ENUM ('NONE', 'PAID_STOCK_UNAVAILABLE', 'PAID_AFTER_EXPIRY');

-- CreateEnum
CREATE TYPE "StockChangeReason" AS ENUM ('ORDER_PAID', 'ORDER_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_RETURNED', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ReviewOrigin" AS ENUM ('VERIFIED_PURCHASE', 'OWNER_ENTERED');

-- CreateEnum
CREATE TYPE "CancellationResolution" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "provinceCode" TEXT NOT NULL,
    "provinceName" TEXT NOT NULL,
    "cityCode" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "streetAddress" TEXT NOT NULL,
    "note" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceIDR" INTEGER NOT NULL,
    "shippingCostIDR" INTEGER NOT NULL,
    "codFeeIDR" INTEGER NOT NULL,
    "totalIDR" INTEGER NOT NULL,
    "billableWeightKg" INTEGER NOT NULL,
    "stockDecremented" BOOLEAN NOT NULL DEFAULT false,
    "conflictFlag" "ConflictFlag" NOT NULL DEFAULT 'NONE',
    "conflictDetectedAt" TIMESTAMP(3),
    "trackingNumber" TEXT,
    "refundReference" TEXT,
    "midtransOrderId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actor" "Actor" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockChange" (
    "id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "resultingQuantity" INTEGER NOT NULL,
    "reason" "StockChangeReason" NOT NULL,
    "note" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "origin" "ReviewOrigin" NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewerName" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "reason" TEXT,
    "resolution" "CancellationResolution" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedNotification" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionStatus" TEXT NOT NULL,
    "statusCode" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "applied" BOOLEAN NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "bucket" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_midtransOrderId_key" ON "Order"("midtransOrderId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_phoneNormalized_idx" ON "Order"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_conflictFlag_idx" ON "Order"("conflictFlag");

-- CreateIndex
CREATE INDEX "OrderStatusEvent_orderId_idx" ON "OrderStatusEvent"("orderId");

-- CreateIndex
CREATE INDEX "StockChange_createdAt_idx" ON "StockChange"("createdAt");

-- CreateIndex
CREATE INDEX "StockChange_orderId_idx" ON "StockChange"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderId_key" ON "Review"("orderId");

-- CreateIndex
CREATE INDEX "Review_published_reviewedAt_idx" ON "Review"("published", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CancellationRequest_orderId_key" ON "CancellationRequest"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedNotification_transactionId_transactionStatus_statu_key" ON "ProcessedNotification"("transactionId", "transactionStatus", "statusCode");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_bucket_identifier_windowStart_key" ON "RateLimit"("bucket", "identifier", "windowStart");

-- AddForeignKey
ALTER TABLE "OrderStatusEvent" ADD CONSTRAINT "OrderStatusEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockChange" ADD CONSTRAINT "StockChange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Second line of defence behind the conditional UPDATE ... WHERE quantity >= n
-- (ADR-0001, Constitution Principle VI). If a code path ever forgets that
-- guard, the database refuses the write rather than going negative.
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_quantity_nonnegative" CHECK ("quantity" >= 0);

-- Ratings are 1-5; data-model.md's Review entity.
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
