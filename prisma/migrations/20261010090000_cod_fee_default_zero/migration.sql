-- COD is free: new orders no longer write codFeeIDR, so it defaults to 0.
-- The column stays so earlier orders still reconcile with totalIDR.
-- Rollback: ALTER TABLE "Order" ALTER COLUMN "codFeeIDR" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "codFeeIDR" SET DEFAULT 0;
