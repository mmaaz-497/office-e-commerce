import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { Delta } from "./tokens";

const DELTA_TONE: Record<Delta["direction"], string> = {
  up: "text-green-700",
  down: "text-red-700",
  flat: "text-brown/60",
  none: "text-brown/60",
};

/**
 * One headline figure. `value` arrives already formatted — the card decides
 * nothing about money or grouping, it only has to keep a long figure from
 * pushing its own card wider than the grid column (hence truncate plus a title
 * attribute, so "Rp 1.234.567.890" stays readable on a phone).
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  change,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: IconName;
  change?: { direction: Delta["direction"]; label: string };
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-brown/80 text-xs font-medium tracking-wide uppercase">{label}</span>
        <span className="bg-cream-dark text-brown flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      </div>
      <p
        title={value}
        className="text-brown-dark mt-3 truncate text-2xl font-bold tabular-nums sm:text-[1.75rem]"
      >
        {value}
      </p>
      <div className="mt-1 flex min-h-8 flex-col gap-0.5">
        {change && (
          <span className={`text-xs font-semibold ${DELTA_TONE[change.direction]}`}>
            {change.label}
          </span>
        )}
        {hint && <span className="text-brown/60 text-xs leading-snug">{hint}</span>}
      </div>
    </>
  );

  const shell =
    "border-line bg-shell shadow-soft flex flex-col rounded-xl border p-4 transition-colors";

  return href ? (
    <Link href={href} className={`${shell} hover:border-brown-light/60 hover:bg-cream-dark/40`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
