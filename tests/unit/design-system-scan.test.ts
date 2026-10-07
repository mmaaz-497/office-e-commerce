import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 006 T018, research R-519 — source scans for the regressions a
 * rendering-free suite would otherwise miss: removed decorative effects coming
 * back, the token table and globals.css drifting apart, legacy colours or
 * arbitrary colour/shadow values in redesigned code, and preview pages.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf-8");

function walk(dir: string): string[] {
  const absolute = join(ROOT, dir);
  return readdirSync(absolute).flatMap((name) => {
    const path = join(absolute, name);
    return statSync(path).isDirectory()
      ? walk(relative(ROOT, path))
      : [relative(ROOT, path).replaceAll("\\", "/")];
  });
}

describe("design system scan", () => {
  it("(1) globals.css has no removed decorative effect", () => {
    const css = read("src/app/globals.css");
    for (const effect of ["aurora", "sheen", "float-soft", "marquee", "reveal-", "tilt-"]) {
      expect(css, effect).not.toContain(effect);
    }
  });

  it("(2) every hex in the CLAUDE.md colour table is declared as a --color-* token", () => {
    const claude = read("CLAUDE.md");
    const table = claude.slice(
      claude.indexOf("### Colour tokens"),
      claude.indexOf("### Typography"),
    );
    const tableHexes = [...new Set([...table.matchAll(/#[0-9A-F]{6}/gi)].map((m) => m[0]))];
    expect(tableHexes.length).toBeGreaterThan(20);

    const css = read("src/app/globals.css");
    const declared = new Set(
      [...css.matchAll(/--color-[\w-]+:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1].toLowerCase()),
    );
    const missing = tableHexes.filter((hex) => !declared.has(hex.toLowerCase()));
    expect(missing).toEqual([]);
  });

  // T055 extended the scope from src/components/ui to the redesigned layout,
  // home and category code.
  const TOKEN_ONLY_DIRS = [
    "src/components/ui",
    "src/components/layout",
    "src/components/home",
    "src/app/[locale]/(home)",
    "src/app/[locale]/kategori",
    // 007 T052: the shared product block and the pages that render it.
    "src/components/product",
    "src/app/[locale]/produk",
    "src/app/[locale]/cari",
  ];
  const LEGACY_COLOUR = /\b(bg|text|border|ring|from|to|via)-(cream|brown|shell|sand|gold|line)/;
  // Files not yet migrated, each with the task that clears it. Remove the entry
  // in that task.
  const NOT_YET_MIGRATED = new Set<string>([]);

  it("(3) token-only code has no legacy colour class, arbitrary colour or arbitrary shadow", () => {
    const files = TOKEN_ONLY_DIRS.flatMap(walk).filter((file) => !NOT_YET_MIGRATED.has(file));
    expect(files.length).toBeGreaterThan(0);
    const offences = files.flatMap((file) => {
      const source = read(file);
      return [
        LEGACY_COLOUR.test(source) && `${file}: legacy colour class`,
        source.includes("[#") && `${file}: arbitrary hex`,
        source.includes("rgba(") && `${file}: rgba(`,
        source.includes("shadow-[") && `${file}: arbitrary shadow`,
      ].filter(Boolean);
    });
    expect(offences).toEqual([]);
  });

  // 007 T052: the Design System has no pill buttons; the old product page had them.
  it("(3b) the product block has no pill-shaped control", () => {
    const offences = walk("src/components/product").filter((file) =>
      read(file).includes("rounded-full"),
    );
    expect(offences).toEqual([]);
  });

  it("(4) no fixture, preview or playground route exists under src/app", () => {
    const offending = walk("src/app").filter((file) => /fixture|preview|playground/i.test(file));
    expect(offending).toEqual([]);
  });

  // T068: the decorative effects removed in 3c stay removed.
  it("(5) nothing under src/ imports Reveal or TiltCard or references a removed effect", () => {
    const IMPORT = /import\s[^;]*\b(Reveal|TiltCard)\b[^;]*from/;
    const EFFECTS = ["animate-aurora", "marquee-track", "sheen", "data-reveal"];
    const offences = walk("src").flatMap((file) => {
      const source = read(file);
      return [
        IMPORT.test(source) && `${file}: imports Reveal or TiltCard`,
        ...EFFECTS.map((effect) => source.includes(effect) && `${file}: ${effect}`),
      ].filter(Boolean);
    });
    expect(offences).toEqual([]);
  });
});
