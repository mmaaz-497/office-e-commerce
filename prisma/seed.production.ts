/**
 * Safe and idempotent in any environment (research R-018). Running this
 * twice changes nothing: every write is an upsert whose `update` clause is a
 * no-op, so a value the owner has since changed through the admin panel is
 * never clobbered by re-running this script.
 */
import "dotenv/config";
import { prisma } from "../src/infrastructure/db/prisma";
import regions from "../src/data/regions.id.json";
import { shippingConfig } from "../src/config";
import { SOLD_COUNT_BASELINE_KEY } from "../src/domain/settings";

const STOCK_LEVEL_ID = "default";
const OPENING_STOCK = 0; // Conservative default — the owner sets the real count via /admin/stock before launch.

function validateRegionsLoadable(): void {
  if (regions.provinces.length === 0 || regions.cities.length === 0) {
    throw new Error("regions.id.json failed to load — provinces or cities is empty");
  }
  // shippingConfig's own import already zod-validates the zone table and its
  // cross-reference against codDisabledProvinces (src/config/index.ts); just
  // reaching this line proves that validation already passed.
  if (Object.keys(shippingConfig.zones).length === 0) {
    throw new Error("shipping.config.ts failed to load — zones is empty");
  }
}

async function main() {
  validateRegionsLoadable();

  await prisma.stockLevel.upsert({
    where: { id: STOCK_LEVEL_ID },
    create: { id: STOCK_LEVEL_ID, quantity: OPENING_STOCK },
    update: {},
  });

  await prisma.setting.upsert({
    where: { key: SOLD_COUNT_BASELINE_KEY },
    create: { key: SOLD_COUNT_BASELINE_KEY, value: "0" },
    update: {},
  });

  console.log(
    `Production seed complete: ${regions.provinces.length} provinces, ` +
      `${regions.cities.length} cities validated; StockLevel and Setting ensured.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
