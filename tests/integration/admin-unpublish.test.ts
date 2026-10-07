import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedCatalogue, seedProduct, testOrderData } from "./helpers/db";
import { editInputFor, productSnapshot, saveProduct, signIn } from "./helpers/admin-product-input";

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

const IMPORTED_SLUG = "slippers-gemoy";

/**
 * Phase 2c spec US4, contracts/admin-publishing.md, research R-404: an ACTIVE
 * product leaves ACTIVE only with confirmUnpublish, the refusal says whether
 * it is the last product on sale, and taking it off sale (and back) never
 * touches its orders, stock history, reviews, slug or publishedAt.
 */
describe("saveProduct — unpublish (integration)", () => {
  let importedId: string;

  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    await seedCatalogue();
    importedId = (await prisma.product.findUniqueOrThrow({ where: { slug: IMPORTED_SLUG } })).id;
    await signIn();
  });

  afterEach(async () => {
    await resetDb();
  });

  /** An order, a published review and a ledger row on the imported product. */
  async function giveHistory() {
    const order = await prisma.order.create({
      data: testOrderData({ status: "COMPLETED", product: { connect: { id: importedId } } }),
    });
    await prisma.review.create({
      data: {
        orderId: order.id,
        origin: "VERIFIED_PURCHASE",
        rating: 5,
        reviewerName: "Pembeli",
        published: true,
        reviewedAt: new Date(),
        productId: importedId,
      },
    });
    await prisma.stockChange.create({
      data: {
        delta: 4,
        resultingQuantity: 4,
        reason: "MANUAL_ADJUSTMENT",
        note: "stock count",
        productId: importedId,
      },
    });
    await prisma.stockLevel.update({ where: { productId: importedId }, data: { quantity: 4 } });
  }

  async function history() {
    const [orders, stockChanges, stockLevel, reviews, product] = await Promise.all([
      prisma.order.findMany({ orderBy: { id: "asc" } }),
      prisma.stockChange.findMany({ orderBy: { id: "asc" } }),
      prisma.stockLevel.findUniqueOrThrow({ where: { productId: importedId } }),
      prisma.review.findMany({ orderBy: { id: "asc" } }),
      prisma.product.findUniqueOrThrow({ where: { id: importedId } }),
    ]);
    return {
      orderCount: orders.length,
      orderIds: orders.map((o) => o.id),
      orders,
      stockChanges,
      stockQuantity: stockLevel.quantity,
      reviews,
      slug: product.slug,
      publishedAt: product.publishedAt,
    };
  }

  it("(a) refuses ACTIVE → DRAFT without confirmation, as the last product on sale", async () => {
    const before = await productSnapshot(IMPORTED_SLUG);
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "DRAFT";

    const result = await saveProduct(input);
    expect(result).toEqual({
      ok: false,
      errorKey: "errors.unpublishNeedsConfirmation",
      confirm: { lastActive: true },
    });
    expect(await productSnapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("(b) lastActive is false while another product is on sale", async () => {
    await seedProduct({ slug: "aktif-lain", status: "ACTIVE", priceIDR: 150000, stock: 3 });
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "DRAFT";

    expect(await saveProduct(input)).toEqual({
      ok: false,
      errorKey: "errors.unpublishNeedsConfirmation",
      confirm: { lastActive: false },
    });
  });

  it("(c) ACTIVE → COMING_SOON also needs confirmation", async () => {
    const before = await productSnapshot(IMPORTED_SLUG);
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "COMING_SOON";

    expect(await saveProduct(input)).toMatchObject({
      ok: false,
      errorKey: "errors.unpublishNeedsConfirmation",
    });
    expect(await productSnapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("(d) DRAFT ⇄ COMING_SOON needs no confirmation", async () => {
    await seedProduct({ slug: "bolak-balik", status: "DRAFT", priceIDR: null });
    const toComingSoon = await editInputFor("bolak-balik");
    toComingSoon.product.status = "COMING_SOON";
    expect(await saveProduct(toComingSoon)).toMatchObject({ ok: true });
    expect((await productSnapshot("bolak-balik")).status).toBe("COMING_SOON");

    const toDraft = await editInputFor("bolak-balik");
    toDraft.product.status = "DRAFT";
    expect(await saveProduct(toDraft)).toMatchObject({ ok: true });
    expect((await productSnapshot("bolak-balik")).status).toBe("DRAFT");
  });

  it("(e, f) with confirmation saves DRAFT, hides it, and keeps its history unchanged", async () => {
    await giveHistory();
    const before = await history();

    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "DRAFT";
    expect(await saveProduct({ ...input, confirmUnpublish: true })).toMatchObject({ ok: true });
    expect((await productSnapshot(IMPORTED_SLUG)).status).toBe("DRAFT");

    const { getListedProductBySlug, listIndexableProducts } =
      await import("@/infrastructure/db/catalogue");
    expect(await getListedProductBySlug(IMPORTED_SLUG, "id")).toBeNull();
    expect(await getListedProductBySlug(IMPORTED_SLUG, "en")).toBeNull();
    expect((await listIndexableProducts()).map((p) => p.slug)).not.toContain(IMPORTED_SLUG);

    expect(await history()).toEqual(before);
  });

  it("(g) republishing restores the same slug, review stats, sold count and publishedAt", async () => {
    await giveHistory();
    const { getReviewStats } = await import("@/infrastructure/db/review-stats");
    const { getSoldCount } = await import("@/infrastructure/db/sold-count");
    const statsBefore = await getReviewStats(importedId);
    const soldBefore = await getSoldCount(importedId);
    const before = await history();

    const off = await editInputFor(IMPORTED_SLUG);
    off.product.status = "DRAFT";
    expect(await saveProduct({ ...off, confirmUnpublish: true })).toMatchObject({ ok: true });

    const on = await editInputFor(IMPORTED_SLUG);
    on.product.status = "ACTIVE";
    expect(await saveProduct(on)).toMatchObject({ ok: true });

    const { getListedProductBySlug } = await import("@/infrastructure/db/catalogue");
    expect(await getListedProductBySlug(IMPORTED_SLUG, "id")).not.toBeNull();
    expect(await getReviewStats(importedId)).toEqual(statsBefore);
    expect(await getSoldCount(importedId)).toEqual(soldBefore);
    expect(await history()).toEqual(before);
  });

  it("(h) a stale expectedUpdatedAt with confirmation gives errors.productChanged", async () => {
    const before = await productSnapshot(IMPORTED_SLUG);
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "DRAFT";
    input.expectedUpdatedAt = new Date(before.updatedAt.getTime() - 60_000).toISOString();

    expect(await saveProduct({ ...input, confirmUnpublish: true })).toEqual({
      ok: false,
      errorKey: "errors.productChanged",
    });
    expect(await productSnapshot(IMPORTED_SLUG)).toEqual(before);
  });
});
