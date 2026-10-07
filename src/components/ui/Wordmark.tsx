import { cx } from "./cx";

/**
 * Text wordmark logo — no raster asset, no Shopee typography, colours or marks.
 *
 * `tone` exists because the wordmark appears on both the surface header and
 * the ink footer. Overriding the colour through `className` would depend on
 * which of two conflicting utilities Tailwind happened to order last; an
 * explicit two-value prop cannot lose that race.
 */
export function Wordmark({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <span
      className={cx(
        "text-2xl font-bold tracking-tight",
        tone === "light" ? "text-footer-fg" : "text-primary",
        className,
      )}
    >
      Toko
      <span className={tone === "light" ? "text-accent" : "text-accent-strong"}>shopee</span>
    </span>
  );
}
