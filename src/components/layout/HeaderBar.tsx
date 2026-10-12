"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Wordmark } from "@/components/ui/Wordmark";

/**
 * The interactive half of the header (contracts/storefront.md §Header): the
 * sticky block with its scroll shadow, the lg+ category row, and the mobile
 * drawer. Everything it displays — hrefs and labels — is resolved on the
 * server and handed down as props, because the [locale] layout deliberately
 * ships only a whitelist of message namespaces to the browser and "home" is not
 * one of them (see PUBLIC_CLIENT_NAMESPACES in src/app/[locale]/layout.tsx).
 *
 * The scroll listener is passive and only ever flips one boolean, so it cannot
 * become a per-frame render: `setScrolled` with the same value is a no-op in
 * React.
 */

export type NavLink = { href: string; label: string };

// The underline is a pseudo-element, so marking the current page cannot
// shift the row: border-strong on hover, primary on the current page.
const ROW_LINK =
  "relative inline-flex h-11 items-center px-3 text-sm font-medium text-ink-2 transition-colors duration-150 ease-out after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-sm after:bg-transparent after:transition-colors after:duration-150 hover:text-ink hover:after:bg-border-strong aria-[current=page]:text-primary aria-[current=page]:after:bg-primary";

const DRAWER_LINK =
  "group flex h-12 items-center justify-between gap-3 px-4 text-base text-ink transition-colors duration-150 ease-out hover:bg-surface-muted aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary";

const ICON_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-md text-ink-2 transition-colors duration-150 ease-out hover:bg-surface-muted hover:text-ink";

const MENU_LINK =
  "flex h-11 items-center gap-3 rounded-md px-3 text-base text-ink transition-colors duration-150 ease-out hover:bg-surface-muted aria-[current=page]:bg-primary-soft aria-[current=page]:font-semibold aria-[current=page]:text-primary";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function HeaderBar({
  homeHref,
  checkOrder,
  buy,
  categories,
  helpLinks,
  localeSwitcher,
  search,
  labels,
}: {
  homeHref: string;
  checkOrder: NavLink;
  /** The "Beli" shortcut to the homepage product block; null when nothing is on sale. */
  buy: NavLink | null;
  categories: NavLink[];
  /** Cara Pemesanan, then Tulis Ulasan. */
  helpLinks: NavLink[];
  /** Rendered by the server so the switcher keeps its own Suspense boundary. */
  localeSwitcher: ReactNode;
  /** The search forms (desktop and mobile), rendered by the server inside their own Suspense. */
  search?: { desktop: ReactNode; mobile: ReactNode };
  labels: {
    nav: string;
    categories: string;
    help: string;
    openMenu: string;
    closeMenu: string;
    menuTitle: string;
    /** "Dikirim ke" / "Ships to", followed by the bold area. */
    shipsTo: string;
    shipsToArea: string;
  };
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const catalogRoot = useRef<HTMLDivElement>(null);
  const catalogButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A route change must close the drawer: its links navigate within the same
  // layout, so without this it would still cover the page just asked for.
  useEffect(() => {
    setOpen(false);
    setCatalogOpen(false);
  }, [pathname]);

  // The Kategori panel is a disclosure, not a modal: a press outside it or
  // focus leaving it closes it, and Escape closes it and returns focus to its
  // button.
  useEffect(() => {
    if (!catalogOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!catalogRoot.current?.contains(event.target as Node)) setCatalogOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!catalogRoot.current?.contains(event.target as Node)) setCatalogOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCatalogOpen(false);
      catalogButton.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("keydown", onKey);
    };
  }, [catalogOpen]);

  // Opening moves focus into the drawer; closing, however it happens, returns
  // it to the menu button — but not on first render, when nothing was open.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeButton.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      menuButton.current?.focus();
    }
  }, [open]);

  // While the drawer is open the page behind it must not scroll away underneath.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** Tab and Shift+Tab cycle within the drawer (aria-modal). */
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const current = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;

  // The drawer's help list adds Cek Pesanan, which the main row carries on
  // wider screens, between the two help links.
  const chevron = (
    <Icon
      name="arrowRight"
      className="text-ink-3 group-hover:text-ink-2 h-4 w-4 shrink-0 transition-colors duration-150 ease-out"
    />
  );

  const drawerHelp = [...helpLinks.slice(0, 1), checkOrder, ...helpLinks.slice(1)];

  return (
    <>
      <header
        data-scrolled={scrolled}
        className="border-border bg-surface sticky top-0 z-50 border-b transition-shadow duration-150 ease-out data-[scrolled=true]:shadow-sm"
      >
        <Container className="flex h-14 items-center gap-2 sm:gap-4 md:h-16 lg:h-20 lg:gap-6">
          <Link
            href={homeHref}
            aria-label="Tokoshopee"
            className="inline-flex h-11 shrink-0 items-center"
          >
            <Wordmark mark className="text-xl md:text-2xl lg:text-[1.75rem]" />
          </Link>

          {categories.length > 0 && (
            <div ref={catalogRoot} className="relative hidden shrink-0 lg:block">
              <button
                ref={catalogButton}
                type="button"
                onClick={() => setCatalogOpen((value) => !value)}
                aria-expanded={catalogOpen}
                aria-controls="site-categories"
                className={`${ICON_BUTTON} text-ink aria-expanded:bg-surface-muted px-3 text-base font-medium`}
              >
                {labels.categories}
                <Icon
                  name="chevronDown"
                  className={`h-4 w-4 transition-transform duration-150 ease-out ${catalogOpen ? "rotate-180" : ""}`}
                />
              </button>
              {catalogOpen && (
                <div
                  id="site-categories"
                  className="border-border bg-surface absolute top-full left-0 z-10 mt-2 w-72 rounded-lg border p-2 shadow-md transition-opacity duration-200 ease-out starting:opacity-0"
                >
                  <p className="text-ink-3 px-3 pt-1 pb-2 text-sm font-semibold">
                    {labels.categories}
                  </p>
                  <ul>
                    {categories.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          aria-current={current(link.href)}
                          onClick={() => setCatalogOpen(false)}
                          className={MENU_LINK}
                        >
                          <span className="bg-primary-soft text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                            <Icon name="grid" className="h-4 w-4" />
                          </span>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div data-slot="search" className="hidden h-11 min-w-0 flex-1 md:block">
            {search?.desktop}
          </div>

          <div className="ml-auto flex items-center gap-2 md:ml-0 lg:gap-3">
            {localeSwitcher}

            <span aria-hidden className="bg-border mx-1 hidden h-8 w-px shrink-0 md:block" />

            <ButtonLink
              href={checkOrder.href}
              variant="secondary"
              aria-current={current(checkOrder.href)}
              className="max-md:hidden max-xl:w-11 max-xl:px-0"
            >
              <Icon name="receipt" className="h-5 w-5 shrink-0" />
              <span className="max-xl:sr-only">{checkOrder.label}</span>
            </ButtonLink>

            {buy && (
              <ButtonLink href={buy.href} className="max-md:hidden lg:px-6">
                {buy.label}
              </ButtonLink>
            )}

            <button
              ref={menuButton}
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="site-drawer"
              aria-label={open ? labels.closeMenu : labels.openMenu}
              className={`${ICON_BUTTON} text-ink w-11 lg:hidden`}
            >
              <Icon name="menu" className="h-6 w-6" />
            </button>
          </div>
        </Container>

        <Container className="-mt-2 hidden items-center justify-between gap-6 lg:flex">
          <nav aria-label={labels.nav} className="-ml-3 min-w-0">
            <ul className="flex flex-wrap items-center">
              {categories.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} aria-current={current(link.href)} className={ROW_LINK}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-ink-2 flex h-11 shrink-0 items-center gap-2 text-sm">
            <Icon name="truck" className="text-primary h-5 w-5 shrink-0" />
            <span>
              {labels.shipsTo} <span className="text-ink font-semibold">{labels.shipsToArea}</span>
            </span>
          </p>
        </Container>

        <Container className="pb-2 md:hidden">
          <div data-slot="search" className="h-11">
            {search?.mobile}
          </div>
        </Container>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 transition-opacity duration-200 ease-out lg:hidden starting:opacity-0">
          <div aria-hidden className="bg-ink/40 absolute inset-0" onClick={() => setOpen(false)} />
          <div
            ref={panel}
            id="site-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="site-drawer-title"
            onKeyDown={trapFocus}
            className="bg-surface fixed inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col overflow-y-auto shadow-md"
          >
            <div className="border-border flex h-16 shrink-0 items-center justify-between border-b pr-2 pl-4">
              <h2 id="site-drawer-title" className="text-ink flex items-center gap-2 text-lg font-semibold">
                <span aria-hidden>
                  <Wordmark mark className="text-lg" />
                </span>
                <span className="sr-only">{labels.menuTitle}</span>
              </h2>
              <button
                ref={closeButton}
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.closeMenu}
                className="text-ink hover:bg-surface-muted inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 ease-out"
              >
                <Icon name="close" className="h-6 w-6" />
              </button>
            </div>

            <nav aria-label={labels.nav} className="divide-border flex flex-col divide-y">
              {categories.length > 0 && (
                <section aria-labelledby="site-drawer-categories" className="py-4">
                  <h3
                    id="site-drawer-categories"
                    className="text-ink-3 px-4 pb-2 text-sm font-semibold"
                  >
                    {labels.categories}
                  </h3>
                  <ul>
                    {categories.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          aria-current={current(link.href)}
                          className={DRAWER_LINK}
                        >
                          {link.label}
                          {chevron}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section aria-labelledby="site-drawer-help" className="py-4">
                <h3 id="site-drawer-help" className="text-ink-3 px-4 pb-2 text-sm font-semibold">
                  {labels.help}
                </h3>
                <ul>
                  {drawerHelp.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={current(link.href)}
                        className={DRAWER_LINK}
                      >
                        {link.label}
                        {chevron}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
