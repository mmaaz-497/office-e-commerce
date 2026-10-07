import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import type { ProductInput } from "@/domain/catalogue/product-schema";
import { resetDb, seedStockLevel, testOrderData } from "./helpers/db";
import { png } from "../helpers/image-bytes";

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

type SaveInput = {
  productId?: string;
  expectedUpdatedAt?: string;
  categoryId: string;
  position: number;
  product: ProductInput;
};

/** The edit form's initial values for a stored product, as ProductForm builds them. */
async function editInputFor(slug: string): Promise<SaveInput> {
  const p = await prisma.product.findUniqueOrThrow({
    where: { slug },
    include: { translations: true, images: { orderBy: { position: "asc" } } },
  });
  const translation = (locale: "id" | "en") => {
    const t = p.translations.find((row) => row.locale === locale)!;
    return {
      name: t.name,
      shortDescription: t.shortDescription,
      longDescription: t.longDescription,
      highlights: t.highlights,
      specs: t.specs as Array<{ label: string; value: string }>,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
      videoAlt: t.videoAlt,
    };
  };
  return {
    productId: p.id,
    expectedUpdatedAt: p.updatedAt.toISOString(),
    categoryId: p.categoryId,
    position: p.position,
    product: {
      slug: p.slug,
      sku: p.sku,
      status: p.status,
      priceIDR: p.priceIDR,
      compareAtPriceIDR: p.compareAtPriceIDR,
      images: p.images.map((image) => ({
        url: image.url,
        width: image.width,
        height: image.height,
        orientation: image.orientation as "landscape" | "portrait" | "square",
        altId: image.altId,
        altEn: image.altEn,
      })),
      video:
        p.videoUrl && p.videoPosterUrl ? { url: p.videoUrl, posterUrl: p.videoPosterUrl } : null,
      translations: { id: translation("id"), en: translation("en") },
    },
  };
}

async function snapshot(slug: string) {
  return prisma.product.findUniqueOrThrow({
    where: { slug },
    include: {
      translations: { orderBy: { locale: "asc" } },
      images: { orderBy: { position: "asc" } },
    },
  });
}

async function save(input: unknown) {
  const { saveProduct } = await import("@/app/actions/admin/products");
  return saveProduct(input);
}

/** Spec US1, contracts/admin-catalogue-actions.md saveProduct (edit path). */
describe("saveProduct — edit (integration)", () => {
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

  it("stores a valid price and translation edit, and advances updatedAt", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.priceIDR = 159000;
    input.product.translations.id.shortDescription = "Sandal empuk untuk dipakai seharian penuh.";

    const result = await save(input);
    expect(result).toMatchObject({ ok: true, productId: before.id });

    const after = await snapshot(IMPORTED_SLUG);
    expect(after.priceIDR).toBe(159000);
    const id = after.translations.find((t) => t.locale === "id")!;
    const en = after.translations.find((t) => t.locale === "en")!;
    expect(id.shortDescription).toBe("Sandal empuk untuk dipakai seharian penuh.");
    expect(en.shortDescription).toBe(
      before.translations.find((t) => t.locale === "en")!.shortDescription,
    );
    expect(after.translations).toHaveLength(2);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    if (result.ok) expect(result.updatedAt).toBe(after.updatedAt.toISOString());
  });

  it("refuses price 999 with a field error and stores nothing", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.priceIDR = 999;

    const result = await save(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorKey).toBe("errors.validation");
    expect(result.fieldErrors?.priceIDR?.[0]).toEqual({
      key: "numberMin",
      values: { minimum: 1000 },
    });
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("refuses a marketplace name with the marketplaceBrand key", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.translations.en.longDescription = "Better than anything on shopee.";

    const result = await save(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.["translations.en.longDescription"]).toEqual([
      { key: "marketplaceBrand" },
    ]);
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("refuses a stale expectedUpdatedAt with errors.productChanged and stores nothing", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.expectedUpdatedAt = new Date(before.updatedAt.getTime() - 60_000).toISOString();
    input.product.priceIDR = 150000;

    const result = await save(input);
    expect(result).toEqual({ ok: false, errorKey: "errors.productChanged" });
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("stores a new image order; legacy images keep their stored dimensions (R-312)", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    const reversed = [...input.product.images].reverse().map((image) => ({
      ...image,
      // A forged client claim; the server must ignore it for an existing image.
      width: 1200,
      height: 1200,
      orientation: "square" as const,
    }));
    input.product.images = reversed;

    const result = await save(input);
    expect(result.ok).toBe(true);

    const after = await snapshot(IMPORTED_SLUG);
    expect(after.images.map((i) => i.url)).toEqual([...before.images].reverse().map((i) => i.url));
    expect(after.images.map((i) => i.position)).toEqual(before.images.map((_, i) => i));
    for (const image of after.images) {
      const original = before.images.find((i) => i.url === image.url)!;
      expect([image.width, image.height, image.orientation]).toEqual([
        original.width,
        original.height,
        original.orientation,
      ]);
    }
    expect(after.images.some((i) => i.orientation === "landscape")).toBe(true);
  });

  it("refuses an image URL that is neither on the product nor an upload", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.images[0] = { ...input.product.images[0], url: "/images/elsewhere/foreign.png" };

    const result = await save(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.["images.0"]).toEqual([{ key: "imageUnknown" }]);
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("removing an image deletes only its row; the file stays (FR-018)", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    const removed = input.product.images.shift()!;

    const result = await save(input);
    expect(result.ok).toBe(true);

    const after = await snapshot(IMPORTED_SLUG);
    expect(after.images).toHaveLength(before.images.length - 1);
    expect(after.images.map((i) => i.url)).not.toContain(removed.url);
    expect(existsSync(path.join(process.cwd(), "public", removed.url))).toBe(true);
  });

  it("refuses a changed slug once published (slugLocked)", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    expect(before.publishedAt).not.toBeNull();
    input.product.slug = "slippers-gemoy-baru";

    const result = await save(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.slug).toEqual([{ key: "slugLocked" }]);
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  // 2c (005 R-404): the gate is open, so DRAFT is no longer locked — but taking
  // the ACTIVE product off sale needs confirmUnpublish. Full cases in
  // admin-unpublish.test.ts.
  it("refuses DRAFT on the ACTIVE product without confirmation (errors.unpublishNeedsConfirmation)", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.status = "DRAFT";

    const result = await save(input);
    expect(result).toMatchObject({
      ok: false,
      errorKey: "errors.unpublishNeedsConfirmation",
      confirm: { lastActive: true },
    });
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });

  it("ignores video fields sent by the client", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.video = { url: "/videos/forged.mp4", posterUrl: "/videos/forged.jpg" };
    input.product.translations.id.videoAlt = "Video palsu";
    input.product.translations.en.videoAlt = "Forged video";

    const result = await save(input);
    expect(result.ok).toBe(true);

    const after = await snapshot(IMPORTED_SLUG);
    expect([after.videoUrl, after.videoPosterUrl]).toEqual([
      before.videoUrl,
      before.videoPosterUrl,
    ]);
    expect(after.translations.map((t) => t.videoAlt)).toEqual(
      before.translations.map((t) => t.videoAlt),
    );
  });

  it("with no session returns errors.unauthorized and changes nothing", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.priceIDR = 150000;
    cookieStore.clear();

    const result = await save(input);
    expect(result).toEqual({ ok: false, errorKey: "errors.unauthorized" });
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });
});

/** T037: uploaded images (research R-312 step 2; FR-018). */
describe("saveProduct — uploaded images (integration)", () => {
  // Set by tests/integration/setup.ts to a temp directory, never the operator's.
  const UPLOAD_DIR = process.env.UPLOAD_DIR!;
  const UPLOAD_NAME = "0123456789abcdef.png";
  const UPLOAD_URL = `/uploads/${UPLOAD_NAME}`;

  beforeEach(async () => {
    await resetDb();
    cookieStore.clear();
    for (const entry of readdirSync(UPLOAD_DIR)) {
      rmSync(path.join(UPLOAD_DIR, entry), { recursive: true, force: true });
    }
    writeFileSync(path.join(UPLOAD_DIR, UPLOAD_NAME), png(1000, 1015));
    await seedStockLevel(10);
    const { issueAdminSession } = await import("@/infrastructure/auth/session");
    await issueAdminSession();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("stores an attached upload with the file's dimensions, not the client's", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.images.push({
      url: UPLOAD_URL,
      width: 4000,
      height: 3000,
      orientation: "landscape",
      altId: "Sandal tampak atas",
      altEn: "Slippers seen from above",
    });

    const result = await save(input);
    expect(result.ok).toBe(true);

    const after = await snapshot(IMPORTED_SLUG);
    const stored = after.images.find((i) => i.url === UPLOAD_URL)!;
    expect(stored).toMatchObject({
      width: 1000,
      height: 1015,
      orientation: "square",
      altId: "Sandal tampak atas",
      altEn: "Slippers seen from above",
      position: after.images.length - 1,
    });
  });

  it("removing an attached upload leaves its file in UPLOAD_DIR (FR-018)", async () => {
    const input = await editInputFor(IMPORTED_SLUG);
    input.product.images.push({
      url: UPLOAD_URL,
      width: 1000,
      height: 1015,
      orientation: "square",
      altId: "Sandal tampak atas",
      altEn: "Slippers seen from above",
    });
    expect((await save(input)).ok).toBe(true);

    const again = await editInputFor(IMPORTED_SLUG);
    again.product.images = again.product.images.filter((i) => i.url !== UPLOAD_URL);
    expect((await save(again)).ok).toBe(true);

    const after = await snapshot(IMPORTED_SLUG);
    expect(after.images.map((i) => i.url)).not.toContain(UPLOAD_URL);
    expect(existsSync(path.join(UPLOAD_DIR, UPLOAD_NAME))).toBe(true);
  });

  it.each([
    ["a missing upload", "/uploads/fedcba9876543210.webp"],
    ["a malformed upload URL", "/uploads/../0123456789abcdef.png"],
    ["an uppercase upload name", "/uploads/0123456789ABCDEF.png"],
  ])("refuses %s with imageUnknown and stores nothing", async (_name, url) => {
    const input = await editInputFor(IMPORTED_SLUG);
    const before = await snapshot(IMPORTED_SLUG);
    input.product.images.push({
      url,
      width: 1200,
      height: 1200,
      orientation: "square",
      altId: "Gambar",
      altEn: "Image",
    });
    const index = input.product.images.length - 1;

    const result = await save(input);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.[`images.${index}`]).toEqual([{ key: "imageUnknown" }]);
    expect(await snapshot(IMPORTED_SLUG)).toEqual(before);
  });
});

/** A valid create input: the imported product's content under a new slug, as a bare DRAFT. */
async function createInput(slug = "sandal-baru"): Promise<SaveInput> {
  const edit = await editInputFor(IMPORTED_SLUG);
  const rest = { categoryId: edit.categoryId, position: edit.position, product: edit.product };
  return {
    ...rest,
    product: {
      ...rest.product,
      slug,
      sku: null,
      status: "DRAFT",
      priceIDR: null,
      compareAtPriceIDR: null,
      images: [],
      video: null,
      translations: {
        id: { ...rest.product.translations.id, videoAlt: null },
        en: { ...rest.product.translations.en, videoAlt: null },
      },
    },
  };
}

/** Spec US4, contracts/admin-catalogue-actions.md saveProduct (create path). */
describe("saveProduct — create (integration)", () => {
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

  it("creates a DRAFT with two translations and its own stock row at 0", async () => {
    const result = await save(await createInput());
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;

    const created = await prisma.product.findUniqueOrThrow({
      where: { id: result.productId },
      include: { translations: true, images: true, stockLevel: true },
    });
    expect(created).toMatchObject({ slug: "sandal-baru", status: "DRAFT", publishedAt: null });
    expect(created.translations).toHaveLength(2);
    expect(created.images).toHaveLength(0);
    expect(created.stockLevel).toMatchObject({
      id: result.productId,
      productId: result.productId,
      quantity: 0,
    });
    expect(await prisma.stockChange.count()).toBe(0);
    expect(result.updatedAt).toBe(created.updatedAt.toISOString());
  });

  it("refuses the imported product's slug with slugTaken", async () => {
    const before = await prisma.product.count();
    const result = await save(await createInput(IMPORTED_SLUG));
    expect(result).toMatchObject({
      ok: false,
      errorKey: "errors.validation",
      fieldErrors: { slug: [{ key: "slugTaken" }] },
    });
    expect(await prisma.product.count()).toBe(before);
  });

  it("refuses a duplicate sku with skuTaken", async () => {
    // The imported product has no sku, so the first create supplies the taken one.
    const first = await createInput("sandal-pertama");
    first.product.sku = "SDL-001";
    expect((await save(first)).ok).toBe(true);
    const input = await createInput();
    input.product.sku = "SDL-001";

    const before = await prisma.product.count();
    const result = await save(input);
    expect(result).toMatchObject({ ok: false, fieldErrors: { sku: [{ key: "skuTaken" }] } });
    expect(await prisma.product.count()).toBe(before);
  });

  // 2c (005 R-401): the gate is open, so a new product may start in any status
  // its content satisfies; ACTIVE gets its own stock row and publishedAt (R-405).
  it.each(["ACTIVE", "COMING_SOON"] as const)(
    "creates as %s when the content satisfies the status",
    async (status) => {
      const input = await createInput();
      input.product.status = status;
      input.product.priceIDR = status === "ACTIVE" ? 99000 : null;
      // A new product takes only stored uploads (R-312), as the create form does.
      const uploadName = "fedcba9876543210.png";
      writeFileSync(path.join(process.env.UPLOAD_DIR!, uploadName), png(1200, 1200));
      input.product.images = [
        {
          url: `/uploads/${uploadName}`,
          width: 1200,
          height: 1200,
          orientation: "square",
          altId: "Sandal tampak atas",
          altEn: "Slippers seen from above",
        },
      ];

      const before = await prisma.product.count();
      const result = await save(input);
      expect(result).toMatchObject({ ok: true });
      if (!result.ok) return;
      expect(await prisma.product.count()).toBe(before + 1);
      expect(await prisma.stockLevel.count()).toBe(2);

      const created = await prisma.product.findUniqueOrThrow({
        where: { id: result.productId },
        include: { stockLevel: true },
      });
      expect(created).toMatchObject({ slug: "sandal-baru", status, isSample: false });
      expect(created.stockLevel).toMatchObject({ id: result.productId, quantity: 0 });
      if (status === "ACTIVE") expect(created.publishedAt).not.toBeNull();
      else expect(created.publishedAt).toBeNull();
    },
  );

  it("refuses an unknown category with categoryUnknown", async () => {
    const input = await createInput();
    input.categoryId = "no-such-category";

    const before = await prisma.product.count();
    const result = await save(input);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: [{ key: "categoryUnknown" }] },
    });
    expect(await prisma.product.count()).toBe(before);
  });

  it("refuses 9 images with tooManyImages", async () => {
    const input = await createInput();
    const [image] = (await editInputFor(IMPORTED_SLUG)).product.images;
    input.product.images = Array.from({ length: 9 }, () => image);

    const before = await prisma.product.count();
    const result = await save(input);
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { images: [{ key: "tooManyImages" }] },
    });
    expect(await prisma.product.count()).toBe(before);
  });

  it("the created DRAFT is invisible to the storefront, sitemap and checkout readers", async () => {
    const result = await save(await createInput());
    expect(result.ok).toBe(true);

    const { getListedProductBySlug, listIndexableProducts, resolveCheckoutProduct } =
      await import("@/infrastructure/db/catalogue");
    expect(await getListedProductBySlug("sandal-baru", "id")).toBeNull();
    expect((await listIndexableProducts()).map((p) => p.slug)).not.toContain("sandal-baru");
    expect(await resolveCheckoutProduct("sandal-baru", "id")).toEqual({ kind: "notFound" });
  });
});

/**
 * Spec US5: hiding is the only way out. In 2b the gate kept the ACTIVE product
 * ACTIVE; from 2c it leaves ACTIVE only with confirmUnpublish (005 R-404), and
 * its orders, reviews and ledger are never touched either way.
 */
describe("saveProduct — hide instead of delete (integration)", () => {
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

  async function counts() {
    const [orders, reviews, stockChanges] = await Promise.all([
      prisma.order.count(),
      prisma.review.count(),
      prisma.stockChange.count(),
    ]);
    return { orders, reviews, stockChanges };
  }

  it("ACTIVE leaves ACTIVE only with confirmation, and its orders, reviews and ledger stay", async () => {
    const imported = await prisma.product.findUniqueOrThrow({ where: { slug: IMPORTED_SLUG } });
    const order = await prisma.order.create({
      data: testOrderData({ status: "COMPLETED", product: { connect: { id: imported.id } } }),
    });
    await prisma.review.create({
      data: {
        orderId: order.id,
        origin: "VERIFIED_PURCHASE",
        rating: 5,
        reviewerName: "Pembeli",
        published: true,
        reviewedAt: new Date(),
        productId: imported.id,
      },
    });
    await prisma.stockChange.create({
      data: {
        delta: -1,
        resultingQuantity: 9,
        reason: "ORDER_PAID",
        orderId: order.id,
        productId: imported.id,
      },
    });
    const before = await counts();

    const input = await editInputFor(IMPORTED_SLUG);
    input.product.status = "DRAFT";
    const result = await save(input);

    expect(result).toEqual({
      ok: false,
      errorKey: "errors.unpublishNeedsConfirmation",
      confirm: { lastActive: true },
    });
    expect((await snapshot(IMPORTED_SLUG)).status).toBe("ACTIVE");
    expect(await counts()).toEqual(before);

    const confirmed = await save({ ...input, confirmUnpublish: true });
    expect(confirmed).toMatchObject({ ok: true });
    expect((await snapshot(IMPORTED_SLUG)).status).toBe("DRAFT");
    expect(await counts()).toEqual(before);
  });

  it("a DRAFT product saved again stays DRAFT", async () => {
    const created = await save(await createInput("draf-tetap"));
    expect(created.ok).toBe(true);

    const input = await editInputFor("draf-tetap");
    input.product.translations.en.shortDescription = "Still a draft after a second save.";
    const result = await save(input);

    expect(result).toMatchObject({ ok: true });
    expect((await snapshot("draf-tetap")).status).toBe("DRAFT");
  });
});
