/**
 * The two shapes the dashboard uses for "how much of a whole": a labelled
 * percentage meter, and a horizontal comparison bar. Both are plain divs —
 * a two-value ratio does not need an SVG, and a progress element cannot be
 * styled consistently across browsers.
 */
export function Meter({
  label,
  percent,
  caption,
  color = "var(--color-brown)",
}: {
  label: string;
  /** Already clamped by the caller's own arithmetic; clamped again here anyway. */
  percent: number;
  caption: string;
  color?: string;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-brown-dark text-xs font-semibold">{label}</span>
        <span className="text-brown-dark text-sm font-bold tabular-nums">{safe}%</span>
      </div>
      <div
        className="bg-cream-dark h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label={label}
        aria-valuenow={safe}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${safe}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-brown/60 text-[11px] leading-snug">{caption}</p>
    </div>
  );
}

export function BarRow({
  label,
  count,
  value,
  share,
  color,
}: {
  label: React.ReactNode;
  count: string;
  value: string;
  /** 0–100, this row's length relative to the largest row. */
  share: number;
  color: string;
}) {
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">{label}</div>
        <div className="flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
          <span className="text-brown-dark font-semibold">{count}</span>
          <span className="text-brown/60">{value}</span>
        </div>
      </div>
      <div className="bg-cream-dark h-1.5 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            // A stage with orders in it always draws something, so "few" never
            // renders identically to "none".
            width: `${share === 0 ? 0 : Math.max(3, Math.round(share))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </li>
  );
}
