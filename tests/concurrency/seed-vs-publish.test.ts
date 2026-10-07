import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "../integration/helpers/db";
import { editInputFor, saveProduct } from "../integration/helpers/admin-product-input";

const { cookieStore } = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    cookieStore: {
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string) => {
        store.set(name, value);
      },
      delete: (name: string) => {
        store.delete(name);
      },
      clear: () => store.clear(),
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const RUNS = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * T039 (005 R-412, analysis H1). `seed:samples --apply` and an admin save
 * that publishes a second real product race. The seed's
 * `LOCK TABLE "Product" IN SHARE ROW EXCLUSIVE MODE` serialises them, so every
 * run ends in exactly one of two states:
 *   A — the seed committed first (10 samples), then the publish (2 ACTIVE);
 *   B — the publish committed first, the seed refused (exit 2, 0 samples).
 * Never a seed that succeeded beside two ACTIVE real products, and never a
 * failed seed that left rows behind.
 *
 * Two things make the race real rather than one-sided: odd runs start the
 * seed a little late, so the publish can commit first (B); and the seed holds
 * its lock for 100ms before its post-check. Without the lock a publish would
 * commit inside that window, the post-check would see a second ACTIVE product
 * and the seed would exit 1 — which this test forbids.
 */
describe("seed:samples concurrent with publishing a product", () => {
  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
  });

  it("always ends in state A or B", async () => {
    const { run } = await import("../../prisma/seed.samples");
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    const outcomes = { A: 0, B: 0 };

    for (let i = 0; i < RUNS; i += 1) {
      await resetDb();
      cookieStore.clear();
      await seedStockLevel(5);
      await seedProduct({ slug: "draf-kedua", status: "DRAFT", priceIDR: 150000, stock: 3 });
      await issueAdminSession();
      const input = await editInputFor("draf-kedua");
      input.product.status = "ACTIVE";

      const seedDelay = i % 2 === 0 ? 0 : 20 + Math.floor(Math.random() * 120);
      const [seedCode, published] = await Promise.all([
        sleep(seedDelay).then(() => run(["--apply"], { beforePostCheck: () => sleep(100) })),
        saveProduct(input),
      ]);

      const samples = await prisma.product.count({ where: { isSample: true } });
      const activeReal = await prisma.product.count({
        where: { status: "ACTIVE", isSample: false },
      });
      expect(published).toMatchObject({ ok: true });
      expect(activeReal).toBe(2);

      if (seedCode === 0) {
        expect(samples).toBe(10);
        outcomes.A += 1;
      } else {
        expect(seedCode).toBe(2);
        expect(samples).toBe(0);
        outcomes.B += 1;
      }
    }

    // Which interleaving wins is up to the scheduler; both are correct.
    console.info(`seed vs publish: A=${outcomes.A} B=${outcomes.B}`);
    expect(outcomes.A + outcomes.B).toBe(RUNS);
    expect(outcomes.A).toBeGreaterThan(0);
    expect(outcomes.B).toBeGreaterThan(0);
  }, 120_000);
});
