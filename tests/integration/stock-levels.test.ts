import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resetDb, seedProduct } from "./helpers/db";

/**
 * 006 T033, research R-505. Product cards read stock in one batched query; a
 * product without a StockLevel row is out of stock, as checkout treats it.
 */
describe("getStockLevels (integration, 006 US2)", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDb();
    ids.withStock = (
      await seedProduct({ slug: "stok-ada", status: "ACTIVE", priceIDR: 100000, stock: 7 })
    ).id;
    ids.empty = (
      await seedProduct({ slug: "stok-nol", status: "ACTIVE", priceIDR: 100000, stock: 0 })
    ).id;
    ids.noRow = (await seedProduct({ slug: "stok-tanpa", status: "ACTIVE", priceIDR: 100000 })).id;
  });

  afterAll(async () => {
    await resetDb();
  });

  it("returns the quantity of every requested product in one map", async () => {
    const { getStockLevels } = await import("@/infrastructure/db/catalogue");

    const levels = await getStockLevels([ids.withStock, ids.empty]);

    expect(levels).toEqual(
      new Map([
        [ids.withStock, 7],
        [ids.empty, 0],
      ]),
    );
  });

  it("maps a product without a StockLevel row to 0, and logs it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getStockLevels } = await import("@/infrastructure/db/catalogue");

    const levels = await getStockLevels([ids.noRow, ids.withStock]);

    expect(levels.get(ids.noRow)).toBe(0);
    expect(levels.get(ids.withStock)).toBe(7);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining(ids.noRow));
    consoleError.mockRestore();
  });

  it("returns an empty map for an empty id list", async () => {
    const { getStockLevels } = await import("@/infrastructure/db/catalogue");

    expect(await getStockLevels([])).toEqual(new Map());
  });
});
