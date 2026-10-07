import { formatIDR } from "@/domain/money";
import { cx } from "./cx";

/**
 * A price in integer IDR, formatted only by formatIDR. The compare-at price is
 * struck through, with a screen-reader prefix from messages so it is not read
 * as a second current price.
 */
export function Price({
  amountIDR,
  compareAtIDR,
  compareAtSrLabel,
  size = "md",
}: {
  amountIDR: number;
  compareAtIDR?: number | null;
  compareAtSrLabel?: string;
  size?: "md" | "lg";
}) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      <span
        className={cx(
          "text-ink font-bold tabular-nums",
          size === "lg" ? "text-[28px] leading-9" : "text-base md:text-lg",
        )}
      >
        {formatIDR(amountIDR)}
      </span>
      {compareAtIDR != null && (
        <s className="text-ink-3 text-sm tabular-nums">
          {compareAtSrLabel && <span className="sr-only">{compareAtSrLabel} </span>}
          {formatIDR(compareAtIDR)}
        </s>
      )}
    </p>
  );
}
