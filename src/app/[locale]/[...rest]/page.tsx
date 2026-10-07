import { notFound } from "next/navigation";

/**
 * Catches every URL under a locale prefix that matches no real page, so the
 * bilingual not-found.tsx renders inside the [locale] layout with the active
 * language, instead of Next.js falling back to its untranslated global 404
 * (FR-070).
 */
export default function CatchAllNotFound(): never {
  notFound();
}
