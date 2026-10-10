import type { ReactNode } from "react";
import { STORE_CONTACT_EMAIL } from "@/config/store.config";

/**
 * Shared shell for the four content pages (FR-068). They carry no state and
 * no data — only translated prose — so the only thing worth sharing is the
 * typography, which keeps the pages from drifting apart visually.
 */
export function ContentPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-brown-dark text-3xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function ContentSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-brown-dark text-xl font-semibold">{heading}</h2>
      {children}
    </section>
  );
}

export function ContentParagraph({ children }: { children: ReactNode }) {
  return <p className="text-brown-dark leading-relaxed">{children}</p>;
}

// Items may be rich (a step containing the contact link), so they are keyed by
// position; the lists are static prose that never reorders.
export function ContentList({ items }: { items: readonly ReactNode[] }) {
  return (
    <ol className="text-brown-dark flex list-decimal flex-col gap-1 pl-6 leading-relaxed">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ol>
  );
}

/**
 * The store contact address as a mailto link. Messages mark where it goes with
 * an `<email>` tag, rendered through `t.rich(key, emailTag)`, so the address
 * itself lives only in store.config.ts and never in the translation files.
 */
export function ContactEmailLink() {
  return (
    <a
      href={`mailto:${STORE_CONTACT_EMAIL}`}
      className="text-primary underline underline-offset-4 break-all"
    >
      {STORE_CONTACT_EMAIL}
    </a>
  );
}

export const emailTag = { email: () => <ContactEmailLink /> };
