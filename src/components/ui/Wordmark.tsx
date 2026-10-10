import { cx } from "./cx";

/**
 * Text wordmark logo — no raster asset, no Shopee typography, colours or marks.
 *
 * `tone` exists because the wordmark appears on both the surface header and
 * the ink footer. Overriding the colour through `className` would depend on
 * which of two conflicting utilities Tailwind happened to order last; an
 * explicit two-value prop cannot lose that race.
 *
 * `mark` adds the "T" monogram tile before the text. It is decorative: the
 * link around the wordmark carries the accessible name.
 */
export function Wordmark({
  className,
  tone = "dark",
  mark = false,
}: {
  className?: string;
  tone?: "dark" | "light";
  mark?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 text-2xl font-bold tracking-tight",
        tone === "light" ? "text-footer-fg" : "text-primary",
        className,
      )}
    >
      {mark && (
        <span
          aria-hidden
          className={cx(
            "inline-flex h-[1.4em] w-[1.4em] shrink-0 items-center justify-center rounded-md text-[0.8em] leading-none",
            tone === "light" ? "bg-accent text-ink" : "bg-primary text-white",
          )}
        >
          T
        </span>
      )}
      <span>
        Toko
        <span className={tone === "light" ? "text-accent" : "text-accent-strong"}>shopee</span>
      </span>
    </span>
  );
}
