import { cardListChildren, cardListItemKey } from "./ProductCard";

/**
 * A horizontally scrolling row of cards (contracts/ui-components.md
 * §ProductRail). It scrolls inside itself, so the page never gets wider than
 * the viewport; the parent Container bounds it. Cards are links, so Tab
 * reaches each one and focus scrolls it into view natively.
 */
export function ProductRail({ label, children }: { label: string; children?: React.ReactNode }) {
  const items = cardListChildren(children);
  if (items.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain pb-2 sm:gap-4 lg:gap-6"
    >
      {items.map((child, index) => (
        <li
          key={cardListItemKey(child, index)}
          className="w-40 shrink-0 snap-start md:w-50 lg:w-60"
        >
          {child}
        </li>
      ))}
    </ul>
  );
}
