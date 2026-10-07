import { cx } from "./cx";

/**
 * Text input (CLAUDE.md §Components, Input / Select / Textarea). `Select` and
 * `Textarea` share these classes, so the three controls cannot drift apart.
 */

export type ControlSize = "md" | "lg";

const CONTROL_BASE =
  "w-full rounded-md border border-border-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-primary transition-colors duration-150 disabled:bg-disabled-bg disabled:text-disabled-fg";

/**
 * 44 px high, or 48 px with `size: "lg"` (mobile checkout). `multiline` swaps
 * the fixed height for a 96 px minimum, for Textarea.
 */
export function controlClasses({
  invalid = false,
  size = "md",
  multiline = false,
}: {
  invalid?: boolean;
  size?: ControlSize;
  multiline?: boolean;
}): string {
  return cx(
    CONTROL_BASE,
    multiline ? "min-h-24 py-2" : size === "lg" ? "h-12" : "h-11",
    invalid && "border-danger",
  );
}

export function Input({
  invalid = false,
  size,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
  invalid?: boolean;
  size?: ControlSize;
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(controlClasses({ invalid, size }), className)}
      {...props}
    />
  );
}
