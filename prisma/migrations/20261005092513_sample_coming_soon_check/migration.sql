-- Raw-SQL guard (Constitution VII, research R-402). A sample product exists
-- only as COMING_SOON: it has no price, stock or reviews to sell, so it must
-- never be on sale (ACTIVE) or silently hidden as a DRAFT the cleanup would
-- treat differently. Prisma's schema language cannot express CHECK — same
-- pattern as Product_active_requires_price in 20261003103900_add_catalogue.
-- The admin's sample status rule is the first line of defence; this one
-- cannot be bypassed.
ALTER TABLE "Product" ADD CONSTRAINT "Product_sample_coming_soon" CHECK (NOT "isSample" OR "status" = 'COMING_SOON');
