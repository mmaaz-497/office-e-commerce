import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * The one card shell every dashboard section sits in. Having exactly one means
 * border, radius, padding and heading scale are decided once — a second panel
 * that invents its own is what makes an admin screen look assembled rather
 * than designed.
 */
export function Panel({
  title,
  caption,
  icon,
  action,
  tone = "default",
  className = "",
  children,
}: {
  title: string;
  caption?: string;
  icon?: IconName;
  action?: { href: string; label: string };
  /** `alert` is for panels that only appear when something is wrong. */
  tone?: "default" | "alert";
  className?: string;
  children: React.ReactNode;
}) {
  const alert = tone === "alert";

  return (
    <section
      className={`flex flex-col rounded-xl border ${
        alert ? "border-red-200 bg-red-50/60" : "border-line bg-shell"
      } shadow-soft ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 pt-4 pb-3 sm:px-5">
        <div className="min-w-0">
          <h2
            className={`flex items-center gap-2 text-sm font-semibold tracking-tight ${
              alert ? "text-red-800" : "text-brown-dark"
            }`}
          >
            {icon && <Icon name={icon} className="h-4 w-4 shrink-0" />}
            <span className="truncate">{title}</span>
          </h2>
          {caption && <p className="text-brown/70 mt-1 text-xs leading-snug">{caption}</p>}
        </div>
        {action && (
          <Link
            href={action.href}
            className="text-brown hover:text-brown-dark flex shrink-0 items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
          >
            {action.label}
            <Icon name="arrowRight" className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  );
}
