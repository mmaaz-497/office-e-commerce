import { cx } from "./cx";

/**
 * A form-level message (CLAUDE.md §States). Danger is announced as an alert;
 * info is a polite status.
 */
const TONES = {
  danger: { classes: "border-danger bg-danger-soft", role: "alert" },
  info: { classes: "border-info bg-info-soft", role: "status" },
} as const;

export function Alert({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={TONES[tone].role}
      className={cx("text-ink rounded-md border-l-4 p-4", TONES[tone].classes)}
    >
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}
