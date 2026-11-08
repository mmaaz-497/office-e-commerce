"use client";

import { forwardRef, useId } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";

/**
 * The size choice (Design System "Radio/checkbox choices"): native radios
 * inside bordered option cards at least 48px, the whole card clickable, the
 * selected one 2px primary on primary-soft. Nothing is preselected, so a
 * buyer always picks a size on purpose; `error` is shown when they tried to
 * continue without one. The ref is the group, so a caller can scroll to it
 * and focus its first option.
 */
export const SizeSelector = forwardRef<
  HTMLFieldSetElement,
  {
    sizes: readonly string[];
    value: string | null;
    onChange: (size: string) => void;
    label: string;
    error?: string | null;
    name?: string;
  }
>(function SizeSelector({ sizes, value, onChange, label, error, name }, ref) {
  const autoId = useId();
  const groupName = name ?? `size-${autoId}`;
  const errorId = `${groupName}-error`;

  return (
    <fieldset
      ref={ref}
      className="flex scroll-mt-32 flex-col gap-2"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="text-ink mb-2 text-sm leading-5 font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const selected = size === value;
          return (
            <label
              key={size}
              className={cx(
                "text-ink relative flex h-12 min-w-12 cursor-pointer items-center justify-center rounded-md px-3 text-base font-medium tabular-nums transition-colors duration-150 ease-out",
                "has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                selected
                  ? "border-primary bg-primary-soft border-2"
                  : cx(
                      "bg-surface hover:border-ink-3 border",
                      error ? "border-danger" : "border-border-strong",
                    ),
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={size}
                checked={selected}
                onChange={() => onChange(size)}
                className="sr-only"
              />
              {size}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-danger flex items-center gap-1 text-sm">
          <Icon name="alert" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
});

/** Brings the group into view and focuses its first option, for "choose a size first". */
export function focusSizeGroup(group: HTMLFieldSetElement | null): void {
  if (!group) return;
  // No explicit behavior: the html scroll-behavior applies, so the
  // prefers-reduced-motion backstop is respected.
  group.scrollIntoView({ block: "center" });
  group.querySelector<HTMLInputElement>("input[type=radio]")?.focus({ preventScroll: true });
}
