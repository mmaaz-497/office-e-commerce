/**
 * The original stock row's id. It keeps this id after the catalogue moved into
 * the database (research R-201, ADR-0004) so the pre-catalogue release still
 * finds it; the product linked to it is the legacy product (R-203).
 *
 * A module of its own so the storefront can name it without importing the
 * catalogue import, which reads the repository catalogue (Principle III).
 */
export const LEGACY_STOCK_LEVEL_ID = "default";
