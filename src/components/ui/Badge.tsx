import { cx } from "./cx";

/** Badge (CLAUDE.md §Components): 22 px high, radius sm, sentence case. */

export type BadgeVariant = "sale" | "neutral" | "success" | "warning" | "info";

const VARIANTS: Record<BadgeVariant, string> = {
  sale: "bg-sale text-white",
  neutral: "bg-neutral-badge-bg text-neutral-badge",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
};

// h-[22px] is the one allowed arbitrary value: a size, not a colour.
const BASE = "inline-flex h-[22px] items-center rounded-sm px-2 text-xs font-semibold";

export function badgeClasses(variant: BadgeVariant): string {
  return cx(BASE, VARIANTS[variant]);
}

export function Badge({
  variant,
  className,
  children,
}: {
  variant: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}) {
  return <span className={cx(badgeClasses(variant), className)}>{children}</span>;
}
