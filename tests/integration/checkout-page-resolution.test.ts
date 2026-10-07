import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveCheckoutProduct } from "@/infrastructure/db/catalogue";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";

/**
 * T034 — the checkout page's product resolution (contracts/checkout.md
 * "Checkout page"): an ACTIVE slug renders, COMING_SOON goes to its product
 * page, DRAFT and unknown are not found, and no slug renders only when
 * exactly one product is on sale.
 */
describe("resolveCheckoutProduct (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it("an ACTIVE slug resolves to that product", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 3 });

    const result = await resolveCheckoutProduct("sandal-b", "id");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.product.slug).toBe("sandal-b");
    expect(result.product.priceIDR).toBe(99000);
    expect(result.product.name).toBe("Produk sandal-b");
  });

  it("a COMING_SOON slug redirects to its product page", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "segera-hadir", status: "COMING_SOON", priceIDR: null });

    expect(await resolveCheckoutProduct("segera-hadir", "id")).toEqual({
      kind: "redirectToProduct",
      slug: "segera-hadir",
    });
  });

  it("a DRAFT or unknown slug is not found", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "draf-produk", status: "DRAFT", priceIDR: null });

    expect(await resolveCheckoutProduct("draf-produk", "id")).toEqual({ kind: "notFound" });
    expect(await resolveCheckoutProduct("tidak-ada", "id")).toEqual({ kind: "notFound" });
  });

  it("no slug with exactly one ACTIVE product resolves to it", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "segera-hadir", status: "COMING_SOON", priceIDR: null });

    const result = await resolveCheckoutProduct(undefined, "en");

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.product.slug).toBe("slippers-gemoy");
    expect(result.product.priceIDR).toBe(169999);
  });

  it("no slug with zero ACTIVE products redirects home", async () => {
    expect(await resolveCheckoutProduct(undefined, "id")).toEqual({ kind: "redirectHome" });
  });

  it("no slug with two ACTIVE products redirects home", async () => {
    await seedStockLevel(5);
    await seedProduct({ slug: "sandal-b", status: "ACTIVE", priceIDR: 99000, stock: 3 });

    expect(await resolveCheckoutProduct(undefined, "id")).toEqual({ kind: "redirectHome" });
  });
});
