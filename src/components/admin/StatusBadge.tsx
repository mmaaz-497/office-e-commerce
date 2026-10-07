import type { OrderStatus } from "@/domain/order/status";
import { STATUS_TONE } from "./status-tone";

/** The translated status, in the one colour tokens.ts assigns it. */
export function StatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-5 font-medium whitespace-nowrap ${STATUS_TONE[status].badge}`}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: STATUS_TONE[status].chart }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
