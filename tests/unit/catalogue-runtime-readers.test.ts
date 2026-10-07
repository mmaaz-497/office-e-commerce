import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

/**
 * T021 — Constitution v2.0.0 Principle III: the repository catalogue is an
 * import source, read only by the import routine, never by the running
 * storefront. A static scan, so it needs no database.
 */
const SRC = join(process.cwd(), "src");

/** The import routine is the one file allowed to read the import source. */
const IMPORT_SOURCE_READERS = ["src/infrastructure/db/catalogue-import.ts"];

/** product.* message keys that hold catalogue data, now import-source only. */
const IMPORT_SOURCE_MESSAGE_KEYS = [
  '"product.name"',
  '"product.alt.',
  '"product.benefit.',
  '"product.metadata',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function repoPath(path: string): string {
  return relative(process.cwd(), path).split(sep).join("/");
}

describe("runtime readers of the import source (Principle III)", () => {
  const files = sourceFiles(SRC);

  it("only the import routine imports src/data/product.json", () => {
    const readers = files
      .filter((file) => /from\s+["'][^"']*data\/product\.json["']/.test(readFileSync(file, "utf8")))
      .map(repoPath)
      .sort();

    expect(readers).toEqual([...IMPORT_SOURCE_READERS].sort());
  });

  it("no page or component references a catalogue message key", () => {
    const offenders = files
      .filter((file) => {
        const path = repoPath(file);
        return path.startsWith("src/app/") || path.startsWith("src/components/");
      })
      .flatMap((file) => {
        const text = readFileSync(file, "utf8");
        return IMPORT_SOURCE_MESSAGE_KEYS.filter((key) => text.includes(key)).map(
          (key) => `${repoPath(file)} → ${key}`,
        );
      });

    expect(offenders).toEqual([]);
  });
});

/** 005 T030 (FR-031, FR-034, R-410, R-411): further runtime-reader guards. */
describe("storefront product data comes from the catalogue (005 US6)", () => {
  const files = sourceFiles(SRC);
  const pagesAndComponents = files.filter((file) => {
    const path = repoPath(file);
    return path.startsWith("src/app/") || path.startsWith("src/components/");
  });

  it("(a) no page or component reads product.metadata.* or product.name", () => {
    const patterns = [
      /["']product\.(name|metadata)["'.]/,
      /(get|use)Translations\(\s*["']product\.metadata/,
    ];
    const offenders = pagesAndComponents
      .filter((file) => patterns.some((pattern) => pattern.test(readFileSync(file, "utf8"))))
      .map(repoPath);

    expect(offenders).toEqual([]);
  });

  it("(b) the order confirmation page imports no order reader", () => {
    const text = readFileSync(
      join(SRC, "app", "[locale]", "pesanan", "[orderNumber]", "page.tsx"),
      "utf8",
    );
    for (const reader of ["findOrder", "prisma", "productNameSnapshot"]) {
      expect(text).not.toContain(reader);
    }
  });

  it.each([
    ["id", id],
    ["en", en],
  ] as const)(
    "(d) home.hero.viewProduct names the catalogue product in %s",
    (_locale, messages) => {
      const label = messages.home.hero.viewProduct;
      expect(label).toContain("{name}");
      expect(label).not.toContain("Gemoy");
    },
  );

  it("(c) src/ never imports prisma/samples/definitions", () => {
    const offenders = files
      .filter((file) => /samples\/definitions["']/.test(readFileSync(file, "utf8")))
      .map(repoPath);

    expect(offenders).toEqual([]);
  });
});
