import { cardListChildren, cardListItemKey } from "./ProductCard";

const COLUMNS = {
  /** CLAUDE.md §Layout: 2 columns, 3 at md, 4 at lg. */
  default: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  /** The marketplace-density grid for upcoming products (007 R-708): 6 at xl. */
  dense: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
} as const;

/**
 * The product grid (CLAUDE.md §Layout): gap 12 → 16 (sm) → 24 (lg). One list
 * item per card; nothing when empty.
 */
export function ProductGrid({
  children,
  variant = "default",
}: {
  children?: React.ReactNode;
  variant?: keyof typeof COLUMNS;
}) {
  const items = cardListChildren(children);
  if (items.length === 0) return null;
  return (
    <ul className={`grid gap-3 sm:gap-4 lg:gap-6 ${COLUMNS[variant]}`}>
      {items.map((child, index) => (
        <li key={cardListItemKey(child, index)}>{child}</li>
      ))}
    </ul>
  );
}
