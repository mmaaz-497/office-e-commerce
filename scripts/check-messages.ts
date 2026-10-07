/**
 * Fails the build when the id and en message catalogues drift out of key-for-key
 * parity. next-intl's runtime fallback would otherwise render English on an
 * Indonesian page — a Constitution Principle I violation no test would catch,
 * because the page still renders (FR-066, research.md R-003).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

type MessageTree = { [key: string]: string | MessageTree };

const MESSAGES_DIR = join(process.cwd(), "src", "messages");
const LOCALES = ["id", "en"] as const;

function flatten(tree: MessageTree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else {
      for (const [k, v] of flatten(value, path)) {
        out.set(k, v);
      }
    }
  }
  return out;
}

function loadFlattened(locale: string): Map<string, string> {
  const raw = readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf-8");
  return flatten(JSON.parse(raw) as MessageTree);
}

function main() {
  const [idFlat, enFlat] = LOCALES.map(loadFlattened);
  const [idKeys, enKeys] = [idFlat, enFlat].map((m) => new Set(m.keys()));

  const missingInEn = [...idKeys].filter((k) => !enKeys.has(k));
  const missingInId = [...enKeys].filter((k) => !idKeys.has(k));
  const emptyValues = [...idFlat, ...enFlat]
    .filter(([, value]) => value.trim() === "")
    .map(([key]) => key);

  const problems: string[] = [];

  if (missingInEn.length > 0) {
    problems.push(
      `Keys present in id.json but missing from en.json:\n  ${missingInEn.join("\n  ")}`,
    );
  }
  if (missingInId.length > 0) {
    problems.push(
      `Keys present in en.json but missing from id.json:\n  ${missingInId.join("\n  ")}`,
    );
  }
  if (emptyValues.length > 0) {
    problems.push(`Keys with an empty string value:\n  ${[...new Set(emptyValues)].join("\n  ")}`);
  }

  if (problems.length > 0) {
    console.error("Message catalogue parity check failed:\n");
    console.error(problems.join("\n\n"));
    process.exit(1);
  }

  console.log(`Message catalogues in parity: ${idKeys.size} keys, both languages.`);
}

main();
