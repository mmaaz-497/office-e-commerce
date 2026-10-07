import type { OrderStatus } from "@/domain/order/status";
import { STATUS_TONE, formatCount } from "@/components/admin/status-tone";
import { percentOf } from "./tokens";
import { EmptyState } from "@/components/admin/EmptyState";

export type DonutSlice = { status: OrderStatus; label: string; count: number };

/* r is chosen so the circumference is exactly 100 (2πr = 100), which turns
   every dash length into a percentage and every offset into "start at this
   percent" — no arc trigonometry, and nothing to get wrong when a slice is
   rounded. The SVG is square and scaled uniformly, so unlike the trend plot it
   can hold circles safely. */
const RADIUS = 100 / (2 * Math.PI);
const STROKE = 9;

export function StatusDonut({
  slices,
  total,
  labels,
}: {
  slices: DonutSlice[];
  total: number;
  labels: { total: string; empty: string };
}) {
  if (total === 0 || slices.length === 0) {
    return <EmptyState message={labels.empty} />;
  }

  let offset = 0;
  const segments = slices.map((slice) => {
    const share = (slice.count / total) * 100;
    const segment = { ...slice, share, offset };
    offset += share;
    return segment;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
          <circle
            cx="21"
            cy="21"
            r={RADIUS}
            fill="none"
            stroke="var(--color-cream-dark)"
            strokeWidth={STROKE}
          />
          {segments.map((segment) => (
            <circle
              key={segment.status}
              cx="21"
              cy="21"
              r={RADIUS}
              fill="none"
              stroke={STATUS_TONE[segment.status].chart}
              strokeWidth={STROKE}
              strokeDasharray={`${segment.share} ${100 - segment.share}`}
              strokeDashoffset={-segment.offset}
            >
              <title>{`${segment.label}: ${formatCount(segment.count)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-brown-dark text-xl leading-none font-bold tabular-nums">
            {formatCount(total)}
          </span>
          <span className="text-brown/60 mt-0.5 text-[10px] uppercase">{labels.total}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs">
        {segments.map((segment) => (
          <li key={segment.status} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_TONE[segment.status].chart }}
            />
            <span className="text-brown-dark min-w-0 flex-1 truncate" title={segment.label}>
              {segment.label}
            </span>
            <span className="text-brown-dark shrink-0 font-semibold tabular-nums">
              {formatCount(segment.count)}
            </span>
            <span className="text-brown/50 w-9 shrink-0 text-right tabular-nums">
              {percentOf(segment.count, total)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
