import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedStockLevel } from "./helpers/db";

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

// revalidatePath needs a Next request context that a test does not have.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const KIDS = { slug: "sandal-anak", nameId: "Sandal Anak", nameEn: "Kids' sandals", position: 1 };

async function save(input: unknown) {
  const { saveCategory } = await import("@/app/actions/admin/categories");
  return saveCategory(input);
}

/** T056: spec US6, contracts/admin-catalogue-actions.md saveCategory. */
describe("saveCategory (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedStockLevel(10);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("creates a category", async () => {
    const result = await save(KIDS);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const stored = await prisma.category.findUniqueOrThrow({ where: { id: result.categoryId } });
    expect(stored).toMatchObject(KIDS);
  });

  it("stores edited names and position", async () => {
    const created = await save(KIDS);
    if (!created.ok) throw new Error("create failed");

    const result = await save({
      categoryId: created.categoryId,
      slug: "sandal-anak",
      nameId: "Sandal Anak-Anak",
      nameEn: "Children's sandals",
      position: 5,
    });
    expect(result).toEqual({ ok: true, categoryId: created.categoryId });

    const stored = await prisma.category.findUniqueOrThrow({ where: { id: created.categoryId } });
    expect(stored).toMatchObject({
      nameId: "Sandal Anak-Anak",
      nameEn: "Children's sandals",
      position: 5,
    });
  });

  it("refuses the imported category's slug with slugTaken", async () => {
    const before = await prisma.category.count();
    const result = await save({ ...KIDS, slug: "sandal" });
    expect(result).toMatchObject({
      ok: false,
      errorKey: "errors.validation",
      fieldErrors: { slug: [{ key: "slugTaken" }] },
    });
    expect(await prisma.category.count()).toBe(before);
  });

  it("refuses a slug with spaces and capitals with slugFormat", async () => {
    const result = await save({ ...KIDS, slug: "Sandal Anak" });
    expect(result).toMatchObject({
      ok: false,
      errorKey: "errors.validation",
      fieldErrors: { slug: [{ key: "slugFormat" }] },
    });
    expect(await prisma.category.count({ where: { nameId: "Sandal Anak" } })).toBe(0);
  });

  it("refuses an empty English name with a nameEn field error", async () => {
    const result = await save({ ...KIDS, nameEn: "   " });
    expect(result).toMatchObject({ ok: false, errorKey: "errors.validation" });
    expect(result.ok ? undefined : result.fieldErrors?.nameEn?.length).toBeGreaterThan(0);
    expect(await prisma.category.count({ where: { slug: KIDS.slug } })).toBe(0);
  });

  it("listCategoriesWithCounts counts the imported category's product", async () => {
    const { listCategoriesWithCounts } = await import("@/infrastructure/db/admin-catalogue");
    const imported = await prisma.product.findUniqueOrThrow({
      where: { slug: "slippers-gemoy" },
      select: { categoryId: true },
    });

    const rows = await listCategoriesWithCounts();
    const row = rows.find((r) => r.id === imported.categoryId);
    expect(row?._count.products).toBe(1);
  });

  it("with no session returns errors.unauthorized and writes nothing", async () => {
    cookieStore.clear();
    const before = await prisma.category.count();
    const result = await save(KIDS);
    expect(result).toEqual({ ok: false, errorKey: "errors.unauthorized" });
    expect(await prisma.category.count()).toBe(before);
  });
});
