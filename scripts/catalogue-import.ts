/**
 * `npm run catalogue:import` — moves the repository catalogue into the database
 * (FR-008…FR-011, ADR-0004). Run by deploy/deploy.sh after `prisma migrate
 * deploy` and before the PM2 reload, on every deploy: after the first run it
 * prints "nothing to do".
 *
 * Exit codes (contracts/catalogue.md):
 *   0  ok, including "nothing to do"
 *   1  unexpected or validation error — nothing was written
 *   2  conflict: the 'default' stock row belongs to another product — nothing was written
 */
import "dotenv/config";
import { prisma } from "../src/infrastructure/db/prisma";
import {
  buildImportSource,
  CatalogueImportConflictError,
  importCatalogue,
  isNothingToDo,
} from "../src/infrastructure/db/catalogue-import";

async function main(): Promise<number> {
  const source = buildImportSource();
  const summary = await prisma.$transaction((tx) => importCatalogue(tx, source));

  console.log(`category      created=${summary.category.created}`);
  console.log(
    `product       created=${summary.product.created} skipped=${summary.product.skipped}`,
  );
  console.log(
    `stock link    created=${summary.stockLink.created} linked=${summary.stockLink.linked}`,
  );
  console.log(
    `backfill      orders=${summary.backfill.orders} stockChanges=${summary.backfill.stockChanges} reviews=${summary.backfill.reviews}`,
  );
  console.log(`image size    corrected=${summary.imageSize.corrected}`);
  console.log(`baseline      copied=${summary.baselineCopied}`);
  console.log(isNothingToDo(summary) ? "nothing to do" : "catalogue import complete");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CatalogueImportConflictError) {
      console.error(`Catalogue import conflict: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    console.error("Catalogue import failed; nothing was written.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
