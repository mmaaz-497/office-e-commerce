import { Icon } from "./Icon";

/**
 * A form field's label, optional marker, help text and error
 * (contracts/ui-components.md). The caller passes
 * `aria-describedby={describedBy(id, { help, error })}` to the control, so the
 * help and error ids below are announced with it.
 */

/** The control's aria-describedby: only the parts that exist, or undefined. */
export function describedBy(
  id: string,
  { help, error }: { help?: string; error?: string },
): string | undefined {
  const ids = [help && `${id}-help`, error && `${id}-error`].filter(Boolean);
  return ids.length > 0 ? ids.join(" ") : undefined;
}

export function Field({
  id,
  label,
  optionalLabel,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  /** "(opsional)" from messages; marks the field optional. */
  optionalLabel?: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink text-sm font-semibold">
        {label}
        {optionalLabel && <span className="text-ink-3 font-normal"> {optionalLabel}</span>}
      </label>
      {children}
      {help && (
        <p id={`${id}-help`} className="text-ink-3 text-sm">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-danger flex gap-1 text-sm">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
