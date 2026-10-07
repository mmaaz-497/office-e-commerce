import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { run as seed } from "../../prisma/seed.samples";
import { run as cleanup } from "../../prisma/cleanup.samples";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";

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

/**
 * T047 (005 US5, R-414, contracts/operator-commands.md): `cleanup:samples`
 * after a real `seed:samples --apply`. Dry-run writes nothing; apply deletes
 * only samples carrying nothing, never a promoted sample or the existing
 * product, and never a file.
 */
const EXISTING = "slippers-gemoy";
const SLUGS = SAMPLE_DEFINITIONS.map((d) => d.slug);

let output: string[];

async function snapshot() {
  const [products, translations, images, stockLevels, stockChanges, orders, reviews] =
    await Promise.all([
      prisma.product.findMany({ orderBy: { slug: "asc" } }),
      prisma.productTranslation.count(),
      prisma.productImage.count(),
      prisma.stockLevel.findMany({ orderBy: { id: "asc" } }),
      prisma.stockChange.findMany({ orderBy: { id: "asc" } }),
      prisma.order.findMany({ orderBy: { id: "asc" } }),
      prisma.review.findMany({ orderBy: { id: "asc" } }),
    ]);
  return { products, translations, images, stockLevels, stockChanges, orders, reviews };
}

async function existingState() {
  const product = await prisma.product.findUniqueOrThrow({ where: { slug: EXISTING } });
  const [orders, ledger, level] = await Promise.all([
    prisma.order.findMany({ where: { productId: product.id }, orderBy: { id: "asc" } }),
    prisma.stockChange.findMany({ orderBy: { id: "asc" } }),
    prisma.stockLevel.findUnique({ where: { productId: product.id } }),
  ]);
  return { product, orders, ledger, level };
}

describe("cleanup:samples (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedStockLevel(5);
    const existing = await prisma.product.findUniqueOrThrow({ where: { slug: EXISTING } });
    await prisma.order.create({
      data: testOrderData({ product: { connect: { id: existing.id } } }),
    });
    output = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    expect(await seed(["--apply"])).toBe(0);
    output = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetDb();
  });

  it("(a) dry-run writes nothing and lists all 10 as would delete", async () => {
    const before = await snapshot();

    expect(await cleanup([])).toBe(0);

    expect(await snapshot()).toEqual(before);
    const text = output.join("\n");
    expect(text).toContain("would delete 10");
    for (const slug of SLUGS) expect(text).toContain(slug);
  });

  it("(b) never selects a promoted sample, even with stock and history", async () => {
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    const { markProductReal } = await import("@/app/actions/admin/products");
    const { setProductStock } = await import("@/app/actions/admin/stock");
    await issueAdminSession();
    const promoted = await prisma.product.findUniqueOrThrow({ where: { slug: SLUGS[0] } });

    expect(
      await markProductReal({
        productId: promoted.id,
        expectedUpdatedAt: promoted.updatedAt.toISOString(),
      }),
    ).toMatchObject({ ok: true });
    expect(
      await setProductStock({
        productId: promoted.id,
        expectedQuantity: 0,
        targetQuantity: 3,
        note: "Stok awal dari pemilik",
      }),
    ).toMatchObject({ ok: true });
    output = [];

    expect(await cleanup(["--apply"])).toBe(0);

    expect(output.join("\n")).toContain("deleted 9");
    expect(output.join("\n")).not.toContain(SLUGS[0]);
    const remaining = await prisma.product.findMany({ select: { slug: true, isSample: true } });
    expect(remaining.map((p) => p.slug).sort()).toEqual([EXISTING, SLUGS[0]].sort());
    expect(
      (await prisma.stockLevel.findUniqueOrThrow({ where: { productId: promoted.id } })).quantity,
    ).toBe(3);
  });

  it("(b2) keeps a sample with stock history written outside the admin", async () => {
    const kept = await prisma.product.findUniqueOrThrow({ where: { slug: SLUGS[4] } });
    await prisma.stockChange.create({
      data: {
        productId: kept.id,
        delta: 0,
        resultingQuantity: 0,
        reason: "MANUAL_ADJUSTMENT",
        note: "written directly",
      },
    });

    expect(await cleanup(["--apply"])).toBe(0);

    const text = output.join("\n");
    expect(text).toContain(`${SLUGS[4]}  hasStockHistory`);
    expect(text).toContain("deleted 9");
    const samples = await prisma.product.findMany({ where: { isSample: true } });
    expect(samples.map((p) => p.slug)).toEqual([SLUGS[4]]);
  });

  it("(c) the deleted samples' translations, images and stock rows go with them", async () => {
    const ids = (await prisma.product.findMany({ where: { isSample: true } })).map((p) => p.id);
    // A zero stock row on one sample: deletable, and removed before the product.
    await prisma.stockLevel.create({
      data: { id: ids[2], productId: ids[2], quantity: 0 },
    });

    expect(await cleanup(["--apply"])).toBe(0);

    expect(await prisma.productTranslation.count({ where: { productId: { in: ids } } })).toBe(0);
    expect(await prisma.productImage.count({ where: { productId: { in: ids } } })).toBe(0);
    expect(await prisma.stockLevel.count({ where: { productId: { in: ids } } })).toBe(0);
  });

  it("(d) leaves the existing product, its orders and its ledger unchanged", async () => {
    const before = await existingState();

    expect(await cleanup(["--apply"])).toBe(0);

    expect(await existingState()).toEqual(before);
    expect(before.orders).toHaveLength(1);
  });

  it("(e) never deletes the placeholder files", async () => {
    expect(await cleanup(["--apply"])).toBe(0);

    for (const { image } of SAMPLE_DEFINITIONS) {
      expect(existsSync(join(process.cwd(), "public", image.slice(1)))).toBe(true);
    }
  });

  it("(f) a second apply has nothing to delete and reports the same keeps", async () => {
    const kept = await prisma.product.findUniqueOrThrow({ where: { slug: SLUGS[7] } });
    await prisma.stockChange.create({
      data: { productId: kept.id, delta: 0, resultingQuantity: 0, reason: "MANUAL_ADJUSTMENT" },
    });
    expect(await cleanup(["--apply"])).toBe(0);
    const firstKeeps = output.filter((l) => l.startsWith("keep"));
    output = [];
    const before = await snapshot();

    expect(await cleanup(["--apply"])).toBe(0);

    expect(output.join("\n")).toContain("nothing to do");
    expect(output.filter((l) => l.startsWith("keep"))).toEqual(firstKeeps);
    expect(firstKeeps).toHaveLength(1);
    expect(await snapshot()).toEqual(before);
  });

  // The cleanup's only non-zero exits are bad arguments and an unexpected
  // failure inside its one transaction, which rolls back (Restrict FKs are
  // the database backstop for a mistaken delete).
  it("(g) a non-zero exit writes nothing", async () => {
    const before = await snapshot();

    expect(await cleanup(["--yes"])).toBe(1);
    expect(await cleanup(["--apply", "extra"])).toBe(1);

    expect(await snapshot()).toEqual(before);
  });
});
