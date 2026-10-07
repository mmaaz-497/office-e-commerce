/**
 * Class lists for the 2b admin catalogue screens, built only from the
 * design-system token names (CLAUDE.md Design System; research R-315). Shared
 * so every control on these screens has the same 44px height, 16px text,
 * border, focus ring and disabled state.
 */

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export const inputClass =
  "h-11 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base text-ink " +
  "transition-colors duration-150 ease-out placeholder:text-ink-3 hover:border-ink-3 " +
  "focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary " +
  "aria-[invalid=true]:border-danger " +
  "disabled:cursor-not-allowed disabled:bg-disabled-bg disabled:text-disabled-fg";

/** A locked value (published slug, fixed status). Not `read-only:`, which also matches selects. */
export const readOnlyInputClass = inputClass.replace("bg-surface ", "bg-surface-muted ");

export const textareaClass = inputClass.replace("h-11", "min-h-32 py-2");

export const labelClass = "text-sm font-semibold text-ink";
export const helpClass = "text-sm text-ink-3";
export const errorClass = "flex items-start gap-1 text-sm text-danger";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 text-base font-semibold " +
  "transition-colors duration-150 ease-out disabled:cursor-not-allowed " +
  "disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-transparent " +
  focusRing;

export const buttonClass = {
  primary: `${buttonBase} h-11 bg-primary text-white hover:bg-primary-hover active:bg-primary-active`,
  primaryLg: `${buttonBase} h-12 bg-primary text-white hover:bg-primary-hover active:bg-primary-active`,
  secondary: `${buttonBase} h-11 border border-primary bg-surface text-primary hover:bg-primary-soft`,
  ghost: `${buttonBase} h-11 text-ink-2 hover:bg-surface-muted`,
  /** Admin only (CLAUDE.md Button): a confirmed, consequential action. */
  danger: `${buttonBase} h-11 bg-danger text-white hover:bg-danger/90 active:bg-danger/80`,
  link: `rounded-md text-primary underline underline-offset-2 ${focusRing}`,
};

const badgeBase = "inline-flex h-[22px] items-center rounded-sm px-2 text-xs font-semibold";

export const badgeClass = {
  success: `${badgeBase} bg-success-soft text-success`,
  neutral: `${badgeBase} bg-neutral-badge-bg text-neutral-badge`,
  warning: `${badgeBase} bg-warning-soft text-warning`,
  info: `${badgeBase} bg-info-soft text-info`,
  sale: `${badgeBase} bg-sale text-white`,
};

export const alertClass =
  "rounded-md border-l-4 border-danger bg-danger-soft p-3 text-base text-ink";

export const pageClass =
  "mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8";
