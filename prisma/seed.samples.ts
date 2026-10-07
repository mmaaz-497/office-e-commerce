/**
 * `npm run seed:samples [-- --apply]` — creates the 10 Coming Soon sample
 * products (005 US1, research R-412, contracts/operator-commands.md). Run by
 * the operator by hand, never by deploy.sh. Dry-run by default.
 *
 * Its safety comes from its preconditions and its transaction, not from the
 * dev seed guard, which it deliberately does not use: it is meant for
 * production. Apply takes `LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE`
 * first, so "exactly one ACTIVE real product" still holds at commit even
 * against a concurrent admin save at Read Committed.
 *
 * Exit codes:
 *   0  ok, including "nothing to do"
 *   1  bad arguments, unexpected, validation or post-check failure — nothing written
 *   2  refused by a precondition — nothing written
 */
import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/db/prisma";
import { planSampleSeed } from "../src/domain/catalogue/samples";
import {
  planOrRefuse,
  readSampleSeedState,
  SampleSeedRefusedError,
  seedBefore,
  seedSamples,
} from "../src/infrastructure/db/sample-catalogue";
import { SAMPLE_DEFINITIONS } from "./samples/definitions";

export interface SeedHooks {
  /** Test seam only: runs inside the transaction, after the writes, before the post-checks. */
  beforePostCheck?: (tx: Prisma.TransactionClient) => Promise<unknown>;
}

const USAGE = "usage: npm run seed:samples [-- --apply]";

function line(label: string, value: string): void {
  console.log(`${label.padEnd(14)}${value}`);
}

function list(slugs: string[]): string {
  return `${slugs.length}${slugs.length > 0 ? `  ${slugs.join(", ")}` : ""}`;
}

async function printCategory(categoryId: string): Promise<void> {
  const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
  line("category", `${category.slug} (${category.nameId})`);
}

export async function run(argv: string[], hooks?: SeedHooks): Promise<number> {
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--apply")) {
    console.error(USAGE);
    return 1;
  }
  const apply = argv[0] === "--apply";

  try {
    if (!apply) {
      // Read-only: plain queries, no transaction or locks on a preview (R-412).
      const plan = planSampleSeed(
        await readSampleSeedState(prisma, SAMPLE_DEFINITIONS),
        SAMPLE_DEFINITIONS,
      );
      if (plan.kind === "refuse") throw new SampleSeedRefusedError(plan);
      line("mode", "dry-run");
      await printCategory(plan.categoryId);
      line("create", list(plan.create.map((c) => c.definition.slug)));
      line("skip", list(plan.skip));
      line(
        "result",
        plan.create.length > 0 ? `would create ${plan.create.length}` : "nothing to do",
      );
      return 0;
    }

    const { plan, created } = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE`;
        const state = await readSampleSeedState(tx, SAMPLE_DEFINITIONS);
        const plan = planOrRefuse(state, SAMPLE_DEFINITIONS);
        const created = await seedSamples(
          tx,
          plan,
          SAMPLE_DEFINITIONS,
          seedBefore(state),
          hooks?.beforePostCheck,
        );
        return { plan, created };
      },
      { timeout: 30_000 },
    );
    line("mode", "apply");
    await printCategory(plan.categoryId);
    line("create", list(created));
    line("skip", list(plan.skip));
    line("result", created.length > 0 ? `created ${created.length}` : "nothing to do");
    return 0;
  } catch (error) {
    if (error instanceof SampleSeedRefusedError) {
      console.error(`refused: ${error.message}`);
      return 2;
    }
    console.error("seed:samples failed; nothing was written.", error);
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
