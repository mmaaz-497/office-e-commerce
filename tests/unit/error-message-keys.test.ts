import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FR-066, Constitution Principle I. Every server action and DomainError
 * reports failure as a *full* message path ("errors.insufficientStock"), so
 * the UI must resolve it against the root namespace. A component that owns a
 * scoped translator — useTranslations("checkout") — and passes errorKey to it
 * looks up "checkout.errors.insufficientStock" and throws MISSING_MESSAGE at
 * the moment the shopper hits an error, which is the one moment no happy-path
 * test exercises. Both halves are checked here: the keys exist in both
 * catalogues, and the translator that receives errorKey is unscoped.
 */

const ROOT = process.cwd();

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.add(path);
    else for (const k of flatten(value, path)) out.add(k);
  }
  return out;
}

function loadKeys(locale: string): Set<string> {
  const raw = readFileSync(join(ROOT, "src", "messages", `${locale}.json`), "utf-8");
  return flatten(JSON.parse(raw) as MessageTree);
}

function walk(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return ext.test(entry) ? [full] : [];
  });
}

/** "errors.someKey" wherever it appears as a string literal in source. */
const ERROR_KEY_LITERAL = /["'`](errors\.[A-Za-z0-9_]+)["'`]/g;

/** A call that hands errorKey to a translator, e.g. tError(result.errorKey, …). */
const ERROR_KEY_CALL = /\b([A-Za-z_$][\w$]*)\(\s*[\w.]*\berrorKey\b/g;

/** const <name> = useTranslations(<arg?>) */
const TRANSLATOR_DECL = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*useTranslations\(\s*([^)]*)\)/g;

describe("error message keys resolve for the shopper", () => {
  const sourceFiles = [
    ...walk(join(ROOT, "src", "app", "actions"), /\.tsx?$/),
    join(ROOT, "src", "domain", "errors.ts"),
  ];

  const referencedKeys = new Set<string>();
  for (const file of sourceFiles) {
    const contents = readFileSync(file, "utf-8");
    for (const [, key] of contents.matchAll(ERROR_KEY_LITERAL)) referencedKeys.add(key);
  }

  it("finds error keys to check", () => {
    expect(referencedKeys.size).toBeGreaterThan(0);
  });

  it.each(["id", "en"])("every referenced error key exists in %s.json", (locale) => {
    const keys = loadKeys(locale);
    const missing = [...referencedKeys].filter((key) => !keys.has(key)).sort();
    expect(missing).toEqual([]);
  });

  it("components resolve errorKey with an unscoped translator", () => {
    const offenders: string[] = [];

    for (const file of walk(join(ROOT, "src", "components"), /\.tsx$/)) {
      const contents = readFileSync(file, "utf-8");

      const scopeOf = new Map<string, string>();
      for (const [, name, arg] of contents.matchAll(TRANSLATOR_DECL)) {
        scopeOf.set(name, arg.trim());
      }

      for (const [, callee] of contents.matchAll(ERROR_KEY_CALL)) {
        const scope = scopeOf.get(callee);
        // Not a translator (e.g. setError(...), a lookup map) — nothing to check.
        if (scope === undefined) continue;
        if (scope !== "") {
          offenders.push(`${relative(ROOT, file)}: ${callee} = useTranslations(${scope})`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
