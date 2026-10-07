/**
 * `npm run cleanup:samples [-- --apply]` — removes the sample products that
 * carry nothing worth keeping (005 US5, research R-414,
 * contracts/operator-commands.md). Run by the operator by hand, never by
 * deploy.sh. Dry-run by default; it reports every kept sample with its reason.
 *
 * Apply takes the same `LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE` as
 * seed:samples first, so a concurrent "mark as real" or save cannot change a
 * sample between its classification and its delete. Only `isSample = true`
 * products are ever selected, and no file is ever deleted.
 *
 * Exit codes:
 *   0  ok, including "nothing to do"
 *   1  bad arguments or unexpected failure — nothing written
 *   (2 is reserved; the cleanup has no precondition to refuse on)
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/infrastructure/db/prisma";
import {
  cleanupSamples,
  type SampleCleanupResult,
} from "../src/infrastructure/db/sample-catalogue";

const USAGE = "usage: npm run cleanup:samples [-- --apply]";

function line(label: string, value: string): void {
  console.log(`${label.padEnd(14)}${value}`);
}

function report(mode: "dry-run" | "apply", result: SampleCleanupResult): void {
  const { deleted, kept } = result;
  line("mode", mode);
  line("delete", `${deleted.length}${deleted.length > 0 ? `  ${deleted.join(", ")}` : ""}`);
  for (const { slug, reason } of kept) line("keep", `${slug}  ${reason}`);
  line(
    "result",
    deleted.length === 0
      ? "nothing to do"
      : mode === "apply"
        ? `deleted ${deleted.length}`
        : `would delete ${deleted.length}`,
  );
}

export async function run(argv: string[]): Promise<number> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--apply")) {
    console.error(USAGE);
    return 1;
  }
  const apply = argv[0] === "--apply";

  try {
    if (!apply) {
      // Read-only: plain queries, no transaction or locks on a preview.
      report("dry-run", await cleanupSamples(prisma, { apply: false }));
      return 0;
    }
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE`;
        return cleanupSamples(tx, { apply: true });
      },
      { timeout: 30_000 },
    );
    report("apply", result);
    return 0;
  } catch (error) {
    console.error("cleanup:samples failed; nothing was written.", error);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
