import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import {
  CatalogueEmptyError,
  getFeaturedProduct,
  getFeaturedProductOrNull,
} from "@/infrastructure/db/catalogue";
import { routing } from "@/i18n/routing";
import { resetDb, seedCatalogue, seedProduct } from "./helpers/db";

/**
 * T029 (005 US6, R-407). The featured product — header, footer, homepage
 * CTAs, order confirmation link — is the first product on sale, so a Coming
 * Soon product placed first never takes the buy links. Only when nothing is on
 * sale does it fall back to the first listed product; a DRAFT one is never
 * featured.
 */
const EXISTING = "slippers-gemoy";

describe("getFeaturedProductOrNull (integration)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(async () => {
    await resetDb();
  });

  it.each(routing.locales)(
    "(a) skips a COMING_SOON product placed first and returns the existing product in %s",
    async (locale) => {
      await seedCatalogue();
      const comingSoon = await seedProduct({
        slug: "segera-pertama",
        status: "COMING_SOON",
        priceIDR: 120000,
      });
      await prisma.product.update({ where: { id: comingSoon.id }, data: { position: -1 } });

      const featured = await getFeaturedProductOrNull(locale);
      expect(featured?.slug).toBe(EXISTING);
    },
  );

  it("(b) with two ACTIVE products returns the first in position order", async () => {
    await seedCatalogue();
    const first = await seedProduct({ slug: "aktif-pertama", status: "ACTIVE", priceIDR: 99000 });
    await prisma.product.update({ where: { id: first.id }, data: { position: -1 } });

    expect((await getFeaturedProductOrNull("id"))?.slug).toBe("aktif-pertama");
    expect((await getFeaturedProductOrNull("en"))?.slug).toBe("aktif-pertama");
  });

  it("(c) with nothing on sale returns the first COMING_SOON product", async () => {
    await seedCatalogue();
    await prisma.product.update({ where: { slug: EXISTING }, data: { status: "DRAFT" } });
    const a = await seedProduct({ slug: "segera-a", status: "COMING_SOON", priceIDR: null });
    const b = await seedProduct({ slug: "segera-b", status: "COMING_SOON", priceIDR: null });
    await prisma.product.update({ where: { id: a.id }, data: { position: 2 } });
    await prisma.product.update({ where: { id: b.id }, data: { position: 1 } });

    expect((await getFeaturedProductOrNull("id"))?.slug).toBe("segera-b");
    expect((await getFeaturedProductOrNull("en"))?.slug).toBe("segera-b");
  });

  it("(d) with only DRAFT products returns null, and getFeaturedProduct throws", async () => {
    await seedCatalogue();
    await prisma.product.update({ where: { slug: EXISTING }, data: { status: "DRAFT" } });
    await seedProduct({ slug: "draf-saja", status: "DRAFT", priceIDR: null });

    expect(await getFeaturedProductOrNull("id")).toBeNull();
    await expect(getFeaturedProduct("id")).rejects.toBeInstanceOf(CatalogueEmptyError);
  });

  it("(e) never returns a DRAFT product, even when it is first and priced", async () => {
    await seedCatalogue();
    const draft = await seedProduct({ slug: "draf-pertama", status: "DRAFT", priceIDR: 99000 });
    await prisma.product.update({ where: { id: draft.id }, data: { position: -1 } });

    for (const locale of routing.locales) {
      const featured = await getFeaturedProductOrNull(locale);
      expect(featured?.slug).not.toBe("draf-pertama");
      expect(featured?.slug).toBe(EXISTING);
    }
  });
});
