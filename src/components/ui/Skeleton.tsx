import { cx } from "./cx";

/** A loading placeholder; the caller sets its size. No shimmer animation. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("bg-surface-muted rounded-md", className)} />;
}
