import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import type { QuickAccessItem } from "./quick-access-items";

/**
 * The marketplace-style shortcut row under the hero (007 FR-012, R-709). A
 * horizontal scroll row on phones, one row of tiles from md. Tiles are at
 * least 72px square; everything is resolved on the server.
 */
export function QuickAccess({ title, items }: { title: string; items: QuickAccessItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-quick-access" className="py-4 lg:py-6">
      <Container>
        <h2 id="home-quick-access" className="sr-only">
          {title}
        </h2>
        <ul className="bg-surface border-border -mx-1 flex snap-x [scrollbar-width:none] gap-1 overflow-x-auto rounded-lg border p-2 md:mx-0 md:grid md:auto-cols-fr md:grid-flow-col md:overflow-visible [&::-webkit-scrollbar]:hidden">
          {items.map((item) => (
            <li key={item.href} className="w-[84px] flex-none snap-start md:w-auto">
              <Link
                href={item.href}
                className="hover:bg-surface-muted flex min-h-[88px] flex-col items-center justify-start gap-2 rounded-md px-1 py-2 text-center transition-colors duration-150 ease-out"
              >
                <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-md">
                  <Icon name={item.icon} className="h-5 w-5" />
                </span>
                <span className="text-ink text-xs leading-4 font-medium sm:text-sm sm:leading-5">
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
