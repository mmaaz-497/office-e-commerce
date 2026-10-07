import { formatIDRCompact } from "@/domain/money";
import { EmptyState } from "@/components/admin/EmptyState";

export type TrendPoint = {
  /** WIB day key — the React key, and what the tooltip is about. */
  day: string;
  /** Short axis label, e.g. `27/09`. */
  label: string;
  /** Native tooltip for the day's column, already translated and formatted. */
  tooltip: string;
  revenueIDR: number;
  orders: number;
};

/** At most this many x-axis labels, whatever the range — 90 would be a smear. */
const MAX_X_LABELS = 6;

/* The plot is drawn in a 0–100 square and stretched to whatever width the
   column has (preserveAspectRatio="none"), which is what lets one SVG fit a
   phone and a 27-inch monitor with no breakpoint. Two consequences are handled
   deliberately: every stroke carries vector-effect="non-scaling-stroke" so
   lines stay 1–2px rather than being scaled into wedges, and nothing round or
   textual is drawn inside the SVG, because those are what a non-uniform scale
   distorts. Axis labels and tooltips are HTML around the plot instead. */
const TOP = 4;
const BOTTOM = 96;
const REVENUE_SPAN = BOTTOM - TOP;
/** Order bars stay shorter than the revenue area so the two series stay legible. */
const ORDER_SPAN = 52;

export function TrendChart({
  points,
  labels,
}: {
  points: TrendPoint[];
  labels: { revenue: string; orders: string; summary: string; empty: string; peak?: string };
}) {
  const maxRevenue = Math.max(...points.map((p) => p.revenueIDR), 0);
  const maxOrders = Math.max(...points.map((p) => p.orders), 0);

  if (points.length === 0 || (maxRevenue === 0 && maxOrders === 0)) {
    return <EmptyState message={labels.empty} />;
  }

  const n = points.length;
  const x = (index: number) => ((index + 0.5) / n) * 100;
  const y = (revenue: number) =>
    BOTTOM - (maxRevenue > 0 ? (revenue / maxRevenue) * REVENUE_SPAN : 0);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.revenueIDR)}`).join(" ");
  const area = `${line} L${x(n - 1)},${BOTTOM} L${x(0)},${BOTTOM} Z`;
  const barWidth = (100 / n) * 0.52;

  const stride = Math.ceil(n / MAX_X_LABELS);
  const axisLabels = points.filter((_, i) => i % stride === 0 || i === n - 1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <ul className="text-brown/80 flex flex-wrap items-center gap-x-4 gap-y-1">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="bg-brown h-0.5 w-4 rounded-full" />
            {labels.revenue}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="bg-sand h-3 w-2 rounded-sm" />
            {labels.orders}
          </li>
        </ul>
        {labels.peak && <span className="text-brown/60 shrink-0 tabular-nums">{labels.peak}</span>}
      </div>

      <div className="flex gap-2">
        {/* Axis labels are HTML, so they never scale with the plot. With no
            revenue in the period the plot is showing order counts alone, and a
            money axis reading Rp 0 three times would say nothing. */}
        <div className="text-brown/50 flex w-12 shrink-0 flex-col justify-between py-0.5 text-right text-[10px] tabular-nums sm:w-16">
          {maxRevenue > 0 && (
            <>
              <span>{formatIDRCompact(maxRevenue)}</span>
              <span>{formatIDRCompact(Math.round(maxRevenue / 2))}</span>
              <span>{formatIDRCompact(0)}</span>
            </>
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <div role="img" aria-label={labels.summary} className="h-40 w-full sm:h-52">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full overflow-visible"
              aria-hidden
            >
              {[TOP, (TOP + BOTTOM) / 2, BOTTOM].map((gridY) => (
                <line
                  key={gridY}
                  x1="0"
                  x2="100"
                  y1={gridY}
                  y2={gridY}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {maxOrders > 0 &&
                points.map((point, i) =>
                  point.orders === 0 ? null : (
                    <rect
                      key={point.day}
                      x={x(i) - barWidth / 2}
                      width={barWidth}
                      y={BOTTOM - (point.orders / maxOrders) * ORDER_SPAN}
                      height={(point.orders / maxOrders) * ORDER_SPAN}
                      fill="var(--color-sand)"
                    />
                  ),
                )}

              {maxRevenue > 0 && (
                <>
                  <path d={area} fill="var(--color-accent)" fillOpacity={0.16} />
                  <path
                    d={line}
                    fill="none"
                    stroke="var(--color-brown)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
          </div>

          {/* One hover target per day. Native title tooltips need no JavaScript,
              so the whole chart still ships as a server component. */}
          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          >
            {points.map((point) => (
              <div
                key={point.day}
                title={point.tooltip}
                className="hover:bg-brown/10 h-full rounded-sm transition-colors"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="w-12 shrink-0 sm:w-16" />
        <div className="text-brown/50 flex min-w-0 flex-1 justify-between text-[10px] tabular-nums">
          {axisLabels.map((point) => (
            <span key={point.day}>{point.label}</span>
          ))}
        </div>
      </div>

      {/* The same figures the tooltips carry, as text — a hover target is not
          reachable by a screen reader, and a chart nobody can read is decoration. */}
      <ul className="sr-only">
        {points.map((point) => (
          <li key={point.day}>{point.tooltip}</li>
        ))}
      </ul>
    </div>
  );
}
