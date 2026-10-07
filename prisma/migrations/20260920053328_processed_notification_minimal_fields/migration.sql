/*
  Warnings:

  - You are about to drop the column `rawPayload` on the `ProcessedNotification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ProcessedNotification" DROP COLUMN "rawPayload",
ADD COLUMN     "grossAmount" INTEGER,
ADD COLUMN     "paymentType" TEXT,
ADD COLUMN     "signatureKey" TEXT,
ADD COLUMN     "transactionTime" TIMESTAMP(3);
