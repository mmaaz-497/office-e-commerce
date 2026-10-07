-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'COMING_SOON', 'DRAFT');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "productNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "StockChange" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "StockLevel" ADD COLUMN     "productId" TEXT;

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "categoryId" TEXT NOT NULL,
    "priceIDR" INTEGER,
    "compareAtPriceIDR" INTEGER,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "videoUrl" TEXT,
    "videoPosterUrl" TEXT,
    "soldCountBaseline" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTranslation" (
    "productId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "highlights" TEXT[],
    "specs" JSONB NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "videoAlt" TEXT,

    CONSTRAINT "ProductTranslation_pkey" PRIMARY KEY ("productId","locale")
);

-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "orientation" TEXT NOT NULL,
    "altId" TEXT NOT NULL,
    "altEn" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_status_categoryId_idx" ON "Product"("status", "categoryId");

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "Order_productId_idx" ON "Order"("productId");

-- CreateIndex
CREATE INDEX "Review_productId_idx" ON "Review"("productId");

-- CreateIndex
CREATE INDEX "StockChange_productId_idx" ON "StockChange"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_productId_key" ON "StockLevel"("productId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockChange" ADD CONSTRAINT "StockChange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Raw-SQL guards (research R-205). Prisma's schema language cannot express
-- CHECK constraints — same pattern as StockLevel_quantity_nonnegative and
-- Review_rating_range in the init migration. They are the money path's second
-- line of defence (Principles IV and V): application validation can regress,
-- these cannot be bypassed.
ALTER TABLE "ProductTranslation" ADD CONSTRAINT "ProductTranslation_locale_valid" CHECK ("locale" IN ('id', 'en'));
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_positive" CHECK ("priceIDR" IS NULL OR "priceIDR" > 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_compare_at_above_price" CHECK ("compareAtPriceIDR" IS NULL OR ("priceIDR" IS NOT NULL AND "compareAtPriceIDR" > "priceIDR"));
ALTER TABLE "Product" ADD CONSTRAINT "Product_active_requires_price" CHECK ("status" <> 'ACTIVE' OR "priceIDR" IS NOT NULL);
ALTER TABLE "Product" ADD CONSTRAINT "Product_sold_baseline_nonnegative" CHECK ("soldCountBaseline" >= 0);
