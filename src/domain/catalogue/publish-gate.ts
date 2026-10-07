import type { ProductStatus } from "./status";

/**
 * The publishing gate — 2b spec FR-024, research R-309; opened in Phase 2c
 * (research R-401). While closed, a new product could only be DRAFT and an
 * existing product kept its status; open, every status is allowed and the
 * shared product schema, the stock rule and the sample rule decide instead.
 * The closed state stays reachable through allowedStatusesWhen(false, …), so
 * closing the gate again is still a one-constant change (errors.statusLocked).
 *
 * A rollout rule, not a product rule, so it lives outside product-schema.ts.
 *
 * Pure: no Next.js, no Prisma (ESLint domain rule).
 */
export const PUBLISHING_OPEN = true;

const ALL_STATUSES: readonly ProductStatus[] = ["ACTIVE", "COMING_SOON", "DRAFT"];
const NEW_PRODUCT_STATUSES: readonly ProductStatus[] = ["DRAFT"];

/** The statuses a product may be saved with; `current` is null for a new product. */
export function allowedStatusesWhen(
  open: boolean,
  current: ProductStatus | null,
): readonly ProductStatus[] {
  if (open) return ALL_STATUSES;
  return current === null ? NEW_PRODUCT_STATUSES : [current];
}

export function allowedStatuses(current: ProductStatus | null): readonly ProductStatus[] {
  return allowedStatusesWhen(PUBLISHING_OPEN, current);
}

const SAMPLE_STATUSES: readonly ProductStatus[] = ["COMING_SOON"];

/**
 * The statuses the admin may offer and save for a product; null for a new
 * product. A sample is fixed at COMING_SOON until it is marked real
 * (Constitution VII, R-402) — the Product_sample_coming_soon CHECK is the
 * database's copy of the same rule.
 */
export function allowedStatusesFor(
  product: { status: ProductStatus; isSample: boolean } | null,
): readonly ProductStatus[] {
  if (product?.isSample) return SAMPLE_STATUSES;
  return allowedStatuses(product?.status ?? null);
}

export function isStatusAllowed(current: ProductStatus | null, next: ProductStatus): boolean {
  return allowedStatuses(current).includes(next);
}
