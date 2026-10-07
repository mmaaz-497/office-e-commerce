import { cx } from "./cx";

/** The page container widths (CLAUDE.md §Layout). */

const SIZES = {
  default: "max-w-7xl",
  prose: "max-w-3xl",
  checkout: "max-w-5xl",
} as const;

export function Container({
  size = "default",
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  size?: keyof typeof SIZES;
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag className={cx("mx-auto w-full px-4 sm:px-6 lg:px-8", SIZES[size], className)} {...props}>
      {children}
    </Tag>
  );
}
