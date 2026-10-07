import { cx } from "./cx";
import { Icon } from "./Icon";
import { controlClasses, type ControlSize } from "./Input";

/** Native select styled as a control, with a decorative chevron. */
export function Select({
  invalid = false,
  size,
  className,
  children,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  invalid?: boolean;
  size?: ControlSize;
  ref?: React.Ref<HTMLSelectElement>;
}) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cx(controlClasses({ invalid, size }), "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <span className="text-ink-3 pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <Icon name="chevronDown" className="h-5 w-5" />
      </span>
    </div>
  );
}
