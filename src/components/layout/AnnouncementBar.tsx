import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";

export type UtilityLink = { href: string; label: string };

const LINK =
  "text-ink-2 hover:text-primary inline-flex min-h-10 items-center px-3 text-sm transition-colors duration-150 ease-out";

/**
 * The utility band above the header (007 FR-001, research R-707): one static
 * fact on the left and, from lg, the help links on the right — the
 * marketplace "top bar", in the quiet surface-muted tone so the white sticky
 * bar below carries the weight. It scrolls away with the page and is real
 * content, so it is not aria-hidden. Below lg the links live in the drawer.
 */
export function AnnouncementBar({
  message,
  links = [],
  label,
}: {
  message: string;
  links?: UtilityLink[];
  /** The accessible name of the link list. */
  label?: string;
}) {
  return (
    <div className="bg-surface-muted">
      <Container className="flex items-center justify-center lg:justify-between">
        <p className="text-ink flex items-center gap-2 py-2 text-center text-sm font-medium">
          <Icon name="sparkle" className="text-accent-strong h-4 w-4 shrink-0" />
          {message}
        </p>
        {links.length > 0 && (
          <nav aria-label={label} className="-mr-3 hidden lg:block">
            <ul className="flex items-center">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </Container>
    </div>
  );
}
