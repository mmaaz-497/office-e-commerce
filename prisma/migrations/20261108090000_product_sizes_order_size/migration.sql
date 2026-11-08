-- Size selection: a product lists the sizes it offers, and an order freezes
-- the size the customer chose. Both are additive; existing products offer no
-- sizes (empty array) and existing orders have no size (NULL), so nothing
-- that ran before this migration behaves differently.
-- Rollback: ALTER TABLE "Order" DROP COLUMN "size";
--           ALTER TABLE "Product" DROP COLUMN "sizes";
ALTER TABLE "Product" ADD COLUMN "sizes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Order" ADD COLUMN "size" TEXT;
