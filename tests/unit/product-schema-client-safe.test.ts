import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T047 — the shared product rules are safe to import into a client component
 * (003 US5, for the 2b admin form). A static walk of their import graph
 * within src/: no file it reaches may import a server-only module. The ESLint
 * domain rule covers next and @prisma/client for src/domain; this also covers
 * server-only, node: built-ins and the infrastructure layer, across every
 * file the graph reaches.
 */
const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ENTRY_POINTS = ["src/domain/catalogue/product-schema.ts", "src/domain/catalogue/status.ts"];

const FORBIDDEN: Array<{ name: string; test: (specifier: string) => boolean }> = [
  { name: "@prisma/client", test: (s) => s === "@prisma/client" || s.startsWith("@prisma/") },
  { name: "next", test: (s) => s === "next" || s.startsWith("next/") },
  { name: "server-only", test: (s) => s === "server-only" },
  { name: "node: built-in", test: (s) => s.startsWith("node:") },
  { name: "@/infrastructure", test: (s) => s.startsWith("@/infrastructure") },
];

const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g;

function specifiersOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(IMPORT_PATTERN)].map((m) => m[1] ?? m[2] ?? m[3]);
}

/** A specifier inside src/, resolved to a file; null for packages. */
function resolveLocal(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (/\.(ts|tsx|json)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

function repoPath(path: string): string {
  return relative(ROOT, path).split(sep).join("/");
}

function walk(): { visited: string[]; offenders: string[] } {
  const queue = ENTRY_POINTS.map((p) => join(ROOT, p));
  const seen = new Set<string>();
  const offenders: string[] = [];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith(".json")) continue;

    for (const specifier of specifiersOf(file)) {
      for (const rule of FORBIDDEN) {
        if (rule.test(specifier)) offenders.push(`${repoPath(file)} → ${specifier} (${rule.name})`);
      }
      const local = resolveLocal(file, specifier);
      if (local) queue.push(local);
    }
  }
  return { visited: [...seen].map(repoPath).sort(), offenders };
}

describe("shared product rules are client-safe (US5)", () => {
  it("walks both entry points", () => {
    const { visited } = walk();
    for (const entry of ENTRY_POINTS) expect(visited).toContain(entry);
  });

  it("no file in their import graph imports a server-only module", () => {
    expect(walk().offenders).toEqual([]);
  });

  it("the scan itself catches a forbidden import", () => {
    // Guards the regex: a scan that matches nothing would pass vacuously.
    const sample = 'import { prisma } from "@/infrastructure/db/prisma";\nimport "server-only";';
    const found = [...sample.matchAll(IMPORT_PATTERN)].map((m) => m[1] ?? m[2] ?? m[3]);
    expect(found).toEqual(["@/infrastructure/db/prisma", "server-only"]);
    expect(found.every((s) => FORBIDDEN.some((rule) => rule.test(s)))).toBe(true);
  });
});
