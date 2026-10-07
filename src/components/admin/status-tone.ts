import type { OrderStatus } from "@/domain/order/status";

/**
 * One colour per order status, defined once and read by every surface that
 * shows a status — badge, donut segment, pipeline bar. Two places each picking
 * their own colour for PAID is how a dashboard starts lying about what it shows.
 *
 * The hues stay inside the brand's cream/brown family wherever the status is
 * merely informational, and borrow the semantic colours the rest of the admin
 * area already uses (amber for waiting, green for done, red for undone, stone
 * for abandoned) only where the status carries a judgement.
 */
export type StatusTone = {
  /** A CSS colour, for SVG fills and strokes. */
  chart: string;
  /** Tailwind classes for a small pill badge. */
  badge: string;
};

export const STATUS_TONE: Readonly<Record<OrderStatus, StatusTone>> = {
  PENDING_PAYMENT: {
    chart: "#b45309",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
  },
  COD_PENDING: {
    chart: "var(--color-gold)",
    badge: "border-line bg-sand text-brown-dark",
  },
  PAID: {
    chart: "var(--color-brown)",
    badge: "border-brown-light/40 bg-cream-dark text-brown-dark",
  },
  CONFIRMED: {
    chart: "var(--color-brown-light)",
    badge: "border-brown-light/40 bg-cream-dark text-brown-dark",
  },
  SHIPPED: {
    chart: "var(--color-accent)",
    badge: "border-accent/30 bg-accent/10 text-brown-dark",
  },
  COMPLETED: {
    chart: "#15803d",
    badge: "border-green-200 bg-green-50 text-green-900",
  },
  CANCELLED: {
    chart: "#a8a29e",
    badge: "border-stone-200 bg-stone-100 text-stone-700",
  },
  EXPIRED: {
    chart: "#d6d3d1",
    badge: "border-stone-200 bg-stone-50 text-stone-600",
  },
  RETURNED: {
    chart: "#b91c1c",
    badge: "border-red-200 bg-red-50 text-red-900",
  },
};

/**
 * Counts use Indonesian grouping (`1.240`) so a four-figure order count reads
 * the same way as the Rupiah beside it. Money never comes through here — that
 * is formatIDR's job and nothing else's (Principle IV).
 */
const countFormatter = new Intl.NumberFormat("id-ID");

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

/** Whole percent of `part` in `total`; 0 when there is no total to divide by. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
