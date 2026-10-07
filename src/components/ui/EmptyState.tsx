import { Icon, type IconName } from "./Icon";

/** Empty state (CLAUDE.md §States): icon, title, one line of body, one action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon name={icon} className="text-ink-3 h-10 w-10" />
      <h3 className="text-ink text-lg leading-[26px] font-semibold md:text-xl md:leading-7">
        {title}
      </h3>
      <p className="text-ink-2 text-base">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
