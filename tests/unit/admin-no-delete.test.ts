import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T050 — spec US5, FR-005: a product or category is hidden, never deleted.
 * A static scan of every catalogue admin action, page and component, so it
 * needs no database. A file that does not exist yet (the categories page
 * before US6) is skipped; the products action, which always exists, must be
 * among the files scanned.
 */
const ROOT = process.cwd();

const ACTION_FILES = [
  "src/app/actions/admin/products.ts",
  "src/app/actions/admin/categories.ts",
  "src/app/actions/admin/stock.ts",
];
const DIRECTORIES = [
  "src/app/admin/products",
  "src/app/admin/categories",
  "src/components/admin/catalogue",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

const files = [
  ...ACTION_FILES.map((file) => join(ROOT, file)).filter((path) => existsSync(path)),
  ...DIRECTORIES.map((dir) => join(ROOT, dir))
    .filter((path) => existsSync(path))
    .flatMap(sourceFiles),
].map((path) => ({
  name: relative(ROOT, path).split(sep).join("/"),
  source: readFileSync(path, "utf8"),
}));

/** Every name a module exports: declarations and `export { a, b as c }` lists. */
function exportedNames(source: string): string[] {
  const declared = [
    ...source.matchAll(
      /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g,
    ),
  ].map((m) => m[1]);
  const listed = [...source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((m) =>
    m[1]
      .split(",")
      .map((part) =>
        part
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      )
      .filter(Boolean),
  );
  return [...declared, ...listed];
}

/** Replacing a product's image set deletes its rows (the files stay, FR-018). */
const ALLOWED_DELETE_CALLS = ["productImage.deleteMany"];

describe("catalogue admin has no delete path (spec US5)", () => {
  it("scans the products action and the catalogue pages and components", () => {
    const names = files.map((f) => f.name);
    expect(names).toContain("src/app/actions/admin/products.ts");
    expect(names).toContain("src/app/actions/admin/stock.ts");
    expect(names.some((n) => n.startsWith("src/app/admin/products/"))).toBe(true);
    expect(names.some((n) => n.startsWith("src/components/admin/catalogue/"))).toBe(true);
  });

  it("scans the 2c sample panel (005 T020)", () => {
    expect(files.map((f) => f.name)).toContain("src/components/admin/catalogue/MarkRealPanel.tsx");
  });

  it.each(files.map((f) => [f.name, f.source] as const))(
    "%s exports nothing named delete, remove or destroy",
    (_name, source) => {
      expect(exportedNames(source).filter((n) => /delete|remove|destroy/i.test(n))).toEqual([]);
    },
  );

  it.each(files.map((f) => [f.name, f.source] as const))(
    "%s never deletes a product or a category",
    (_name, source) => {
      const calls = [
        ...source.matchAll(/\b(product|category|productImage)\s*\.\s*(delete|deleteMany)\b/g),
      ]
        .map((m) => `${m[1]}.${m[2]}`)
        .filter((call) => !ALLOWED_DELETE_CALLS.includes(call));
      expect(calls).toEqual([]);
    },
  );
});

/**
 * 005 T020: the only product delete in the codebase is the operator cleanup
 * (sample-catalogue, spec US5), run by hand from the command line. No route,
 * page or component may import it.
 */
describe("the sample cleanup is not reachable from the app (005 US5)", () => {
  const appFiles = ["src/app", "src/components"]
    .map((dir) => join(ROOT, dir))
    .flatMap(sourceFiles)
    .map((path) => ({
      name: relative(ROOT, path).split(sep).join("/"),
      source: readFileSync(path, "utf8"),
    }));

  it("scans src/app and src/components", () => {
    expect(appFiles.length).toBeGreaterThan(0);
    expect(appFiles.map((f) => f.name)).toContain("src/app/actions/admin/products.ts");
  });

  it.each(appFiles.map((f) => [f.name, f.source] as const))(
    "%s does not import @/infrastructure/db/sample-catalogue",
    (_name, source) => {
      // Any import or dynamic import whose specifier ends in sample-catalogue.
      expect(source).not.toMatch(/["'][^"'\n]*\/sample-catalogue["']/);
    },
  );
});
