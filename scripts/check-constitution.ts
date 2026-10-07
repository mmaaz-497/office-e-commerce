/**
 * Fails the build when the constitution has been emptied or reverted to the
 * SpecKit template.
 *
 * This is not hypothetical. The ratified v1.0.0 was truncated to a single byte
 * in the working tree and was never committed, so git history held only the
 * placeholder template — the document was unrecoverable and had to be restored
 * from an external copy. Nothing in the toolchain noticed: `/sp.plan`'s
 * Constitution Check reads this file and would have evaluated its gate against
 * an empty document, reporting PASS.
 *
 * Template tokens are searched for only OUTSIDE HTML comments. The Sync Impact
 * Report at the top of a correctly ratified constitution legitimately cites
 * tokens like [PRINCIPLE_5_NAME] when recording the placeholder → principle
 * mapping, and must not be mistaken for an unfilled template.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONSTITUTION_PATH = join(process.cwd(), ".specify", "memory", "constitution.md");

/** Below this, the file cannot hold a real constitution. The template is ~2.4 KB. */
const MIN_BYTES = 1024;

const REQUIRED_PRINCIPLES = 11;
const NON_NEGOTIABLE = ["V", "VI"] as const;

/** Strips HTML comments so the Sync Impact Report's mapping table is not scanned. */
function stripHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, "");
}

function main() {
  let raw: string;
  try {
    raw = readFileSync(CONSTITUTION_PATH, "utf-8");
  } catch {
    console.error(`Constitution check failed:\n\n  ${CONSTITUTION_PATH} could not be read.`);
    process.exit(1);
  }

  const problems: string[] = [];
  const bytes = Buffer.byteLength(raw, "utf-8");
  const body = stripHtmlComments(raw);

  if (bytes < MIN_BYTES) {
    problems.push(
      `File is ${bytes} bytes, below the ${MIN_BYTES}-byte floor.\n` +
        `  An emptied constitution silently disables the Constitution Check gate.`,
    );
  }

  const templateTokens = [...new Set(body.match(/\[[A-Z][A-Z0-9_]{2,}\]/g) ?? [])];
  if (templateTokens.length > 0) {
    problems.push(
      `Unfilled template tokens outside HTML comments:\n  ${templateTokens.join(", ")}\n` +
        `  The file still holds SpecKit placeholders instead of ratified principles.`,
    );
  }

  const principles = body.match(/^###\s+([IVX]+)\.\s+\S/gm) ?? [];
  if (principles.length !== REQUIRED_PRINCIPLES) {
    problems.push(
      `Found ${principles.length} principle headings, expected ${REQUIRED_PRINCIPLES} (I–XI).`,
    );
  }

  for (const numeral of NON_NEGOTIABLE) {
    const heading = new RegExp(`^###\\s+${numeral}\\..*NON-NEGOTIABLE`, "m");
    if (!heading.test(body)) {
      problems.push(
        `Principle ${numeral} is no longer marked NON-NEGOTIABLE.\n` +
          `  Payment and stock integrity may only be downgraded by a documented amendment.`,
      );
    }
  }

  if (!/\*\*Version\*\*:\s*\d+\.\d+\.\d+/.test(body)) {
    problems.push("No `**Version**: X.Y.Z` line found — the constitution must carry a version.");
  }

  if (problems.length > 0) {
    console.error("Constitution check failed:\n");
    console.error(problems.map((p) => `- ${p}`).join("\n\n"));
    console.error(
      "\nThe ratified text is not recoverable from git history if it is lost again.\n" +
        "Restore it rather than re-ratifying, unless an amendment is genuinely intended.",
    );
    process.exit(1);
  }

  const version = body.match(/\*\*Version\*\*:\s*(\d+\.\d+\.\d+)/)?.[1] ?? "unknown";
  console.log(
    `Constitution intact: v${version}, ${principles.length} principles, ${bytes} bytes, ` +
      `${NON_NEGOTIABLE.join(" and ")} NON-NEGOTIABLE.`,
  );
}

main();
