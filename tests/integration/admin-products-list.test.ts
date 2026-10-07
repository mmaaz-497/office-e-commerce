import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { AdminSessionError } from "@/domain/errors";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";

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

async function list(
  filters: Parameters<
    (typeof import("@/infrastructure/db/admin-catalogue"))["listAdminProducts"]
  >[0],
) {
  const { listAdminProducts } = await import("@/infrastructure/db/admin-catalogue");
  return (await listAdminProducts(filters)).map((row) => row.slug);
}

/** R-314, spec FR-003/FR-004: the admin products list filters and search. */
describe("listAdminProducts (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedStockLevel(10); // imported slippers-gemoy, ACTIVE, category `sandal`
    await seedProduct({ slug: "kedua", status: "DRAFT", priceIDR: null, stock: 5 });
    const other = await prisma.category.create({
      data: { slug: "tas", nameId: "Tas", nameEn: "Bags" },
    });
    const bag = await seedProduct({ slug: "tas-kecil", status: "COMING_SOON", priceIDR: null });
    await prisma.product.update({
      where: { id: bag.id },
      data: { categoryId: other.id, sku: "TAS-001" },
    });
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("returns every status, DRAFT included, ordered by position", async () => {
    expect(await list({})).toEqual(["slippers-gemoy", "kedua", "tas-kecil"]);
  });

  it("filters by status", async () => {
    expect(await list({ status: "DRAFT" })).toEqual(["kedua"]);
    expect(await list({ status: "ACTIVE" })).toEqual(["slippers-gemoy"]);
    expect(await list({ status: "COMING_SOON" })).toEqual(["tas-kecil"]);
  });

  it("filters by category", async () => {
    const bags = await prisma.category.findUniqueOrThrow({ where: { slug: "tas" } });
    const sandals = await prisma.category.findUniqueOrThrow({ where: { slug: "sandal" } });
    expect(await list({ categoryId: bags.id })).toEqual(["tas-kecil"]);
    expect(await list({ categoryId: sandals.id })).toEqual(["slippers-gemoy", "kedua"]);
  });

  it("q matches the id name, the en name, the slug and the sku, case-insensitively", async () => {
    expect(await list({ q: "produk KEDUA" })).toEqual(["kedua"]); // id name
    expect(await list({ q: "PRODUCT kedua" })).toEqual(["kedua"]); // en name
    expect(await list({ q: "Slippers-GEM" })).toEqual(["slippers-gemoy"]); // slug
    expect(await list({ q: "tas-001" })).toEqual(["tas-kecil"]); // sku
    expect(await list({ q: "   " })).toHaveLength(3); // blank → no search
  });

  it("matches %, _ and quotes literally, without error", async () => {
    expect(await list({ q: "%" })).toEqual([]);
    expect(await list({ q: "_" })).toEqual([]);
    expect(await list({ q: "'\"" })).toEqual([]);
  });

  it("throws AdminSessionError with no session", async () => {
    cookieStore.clear();
    const { listAdminProducts } = await import("@/infrastructure/db/admin-catalogue");
    await expect(listAdminProducts({})).rejects.toThrow(AdminSessionError);
  });
});
