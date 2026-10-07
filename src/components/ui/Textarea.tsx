import { cx } from "./cx";
import { controlClasses } from "./Input";

/** Multi-line control: the Input styles with a 96 px minimum height. */
export function Textarea({
  invalid = false,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx(controlClasses({ invalid, multiline: true }), className)}
      {...props}
    />
  );
}
