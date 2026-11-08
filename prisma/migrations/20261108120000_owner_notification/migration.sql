-- Owner email on every placed order: one reminder row per order, written in
-- the same transaction that places it. A new table, so no existing order ever
-- gets a row and deploying sends nothing for past orders.
-- Rollback: DROP TABLE "OwnerNotification"; DROP TYPE "OwnerNotificationStatus";
CREATE TYPE "OwnerNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "OwnerNotification" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OwnerNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnerNotification_orderId_key" ON "OwnerNotification"("orderId");
CREATE INDEX "OwnerNotification_status_createdAt_idx" ON "OwnerNotification"("status", "createdAt");

ALTER TABLE "OwnerNotification" ADD CONSTRAINT "OwnerNotification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
