import Link from "next/link";
import { Container } from "@/components/ui/Container";

export type UtilityLink = { href: string; label: string };

const LINK =
  "text-footer-fg hover:text-accent inline-flex min-h-11 items-center px-3 text-sm transition-colors duration-150 ease-out";

/**
 * The ink utility band above the header (007 FR-001, research R-707): one
 * static fact on the left and, from lg, the help links on the right — the
 * marketplace "top bar". It scrolls away with the page and is real content,
 * so it is not aria-hidden. Below lg the links live in the drawer.
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
    <div className="bg-ink">
      <Container className="flex items-center justify-center lg:justify-between">
        <p className="text-footer-fg py-2 text-center text-sm">{message}</p>
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
