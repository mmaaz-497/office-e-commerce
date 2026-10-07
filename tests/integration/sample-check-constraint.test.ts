import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb } from "./helpers/db";

/**
 * Constitution VII, research R-402: the Product_sample_coming_soon CHECK keeps
 * a sample at COMING_SOON whatever the application does. Raw SQL on purpose —
 * the point is that the database refuses, not that an action does.
 */

let categoryId: string;

beforeEach(async () => {
  await resetDb();
  const category = await prisma.category.create({
    data: { slug: "sandal", nameId: "Sandal", nameEn: "Sandals" },
  });
  categoryId = category.id;
});

afterEach(resetDb);
afterAll(() => prisma.$disconnect());

let counter = 0;

function insertProduct(isSample: boolean, status: "ACTIVE" | "COMING_SOON" | "DRAFT") {
  counter += 1;
  const id = `cksample${counter}`;
  return prisma.$executeRaw`
    INSERT INTO "Product" ("id", "slug", "status", "categoryId", "priceIDR", "isSample", "updatedAt")
    VALUES (${id}, ${`sampel-uji-${counter}`}, ${status}::"ProductStatus", ${categoryId}, 100000, ${isSample}, now())`;
}

describe("Product_sample_coming_soon CHECK (R-402)", () => {
  it.each(["ACTIVE", "DRAFT"] as const)("rejects inserting a sample as %s", async (status) => {
    await expect(insertProduct(true, status)).rejects.toThrow(/Product_sample_coming_soon/);
    expect(await prisma.product.count()).toBe(0);
  });

  it.each(["ACTIVE", "DRAFT"] as const)("rejects updating a sample to %s", async (status) => {
    await insertProduct(true, "COMING_SOON");
    await expect(
      prisma.$executeRaw`UPDATE "Product" SET "status" = ${status}::"ProductStatus" WHERE "isSample"`,
    ).rejects.toThrow(/Product_sample_coming_soon/);
    const row = await prisma.product.findFirstOrThrow();
    expect(row.status).toBe("COMING_SOON");
  });

  it("rejects turning an ACTIVE non-sample into a sample", async () => {
    await insertProduct(false, "ACTIVE");
    await expect(prisma.$executeRaw`UPDATE "Product" SET "isSample" = true`).rejects.toThrow(
      /Product_sample_coming_soon/,
    );
  });

  it("accepts a sample as COMING_SOON", async () => {
    await expect(insertProduct(true, "COMING_SOON")).resolves.toBe(1);
  });

  it.each(["ACTIVE", "COMING_SOON", "DRAFT"] as const)(
    "accepts a non-sample as %s",
    async (status) => {
      await expect(insertProduct(false, status)).resolves.toBe(1);
    },
  );
});
