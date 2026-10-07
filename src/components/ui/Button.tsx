import Link from "next/link";
import { cx } from "./cx";

/**
 * The Design System button (CLAUDE.md §Components, contracts/ui-components.md).
 * `Button` renders a <button> and `ButtonLink` a next/link; both share
 * `buttonClasses`, so a link styled as a button cannot drift from the real one
 * (research R-503). Text arrives as props: no component here translates.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "relative inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors duration-150 ease-out disabled:bg-disabled-bg disabled:text-disabled-fg disabled:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-active",
  secondary: "bg-surface border border-primary text-primary hover:bg-primary-soft",
  ghost: "text-ink-2 hover:bg-surface-muted",
  danger: "bg-danger text-white",
  // min-h-11 keeps a standalone link at the 44 px target without a box.
  link: "text-primary underline underline-offset-4 inline-flex min-h-11 items-center px-0",
};

/** sm (36 px) is for desktop admin only. */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-12 px-6 text-base",
};

/** A link has no box, so it takes only the text size. */
const LINK_SIZES: Record<ButtonSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  { fullWidthMobile = false }: { fullWidthMobile?: boolean } = {},
): string {
  return cx(
    BASE,
    VARIANTS[variant],
    variant === "link" ? LINK_SIZES[size] : SIZES[size],
    fullWidthMobile && "w-full sm:w-auto",
  );
}

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width below `sm`, for primary calls to action. */
  fullWidthMobile?: boolean;
}

export function Button({
  variant,
  size,
  fullWidthMobile,
  loading = false,
  loadingLabel,
  type = "button",
  disabled,
  className,
  children,
  ...props
}: StyleProps &
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    loading?: boolean;
    /** Required whenever `loading` can be true; resolved from messages by the caller. */
    loadingLabel?: string;
  }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(buttonClasses(variant, size, { fullWidthMobile }), className)}
      {...props}
    >
      {loading ? (
        <>
          {/* The label keeps its space, so the button does not change width. */}
          <span className="invisible inline-flex items-center gap-2">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 16 16" className="h-4 w-4 animate-spin" aria-hidden fill="none">
              <circle
                cx="8"
                cy="8"
                r="6.5"
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="2"
              />
              <path
                d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">{loadingLabel}</span>
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** A link styled as a button. Links have no disabled or loading state. */
export function ButtonLink({
  variant,
  size,
  fullWidthMobile,
  className,
  ...props
}: StyleProps & React.ComponentProps<typeof Link>) {
  return (
    <Link className={cx(buttonClasses(variant, size, { fullWidthMobile }), className)} {...props} />
  );
}
