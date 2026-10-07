import { afterEach, beforeEach, describe, expect, it } from "vitest";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import { hasPublishedReviews } from "@/domain/catalogue/home-sections";
import { FAQ_ITEM_KEYS, faqItems, faqPageJsonLd } from "@/components/home/faq-items";
import { quickAccessItems } from "@/components/home/quick-access-items";
import { readFileSync } from "node:fs";
import path from "node:path";
import { localeHref } from "@/i18n/pathnames";
import { routing } from "@/i18n/routing";
import { prisma } from "@/infrastructure/db/prisma";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

/**
 * FR-014, FR-019 to FR-021, FR-023 to FR-026.
 *
 * Follows this suite's existing convention (tests/unit/gallery-order.test.ts,
 * tests/integration/homepage-hero.test.ts): the homepage sections are server
 * components with no DOM to mount here, so what is asserted is the part that
 * is pure and silently breakable — the lists the sections map over, the copy
 * those lists resolve to in both languages, the hrefs they build, and the
 * data-layer contract the hidden-when-empty sections key off. If any of those
 * drift the page still renders, which is exactly why a test has to notice.
 */

const PRODUCTS = catalogue as Product[];
const featured = PRODUCTS[0];
const MESSAGES = { id, en } as const;

/** Resolves "a.b.c" against a message tree, or throws the way a missing key should. */
function message(locale: keyof typeof MESSAGES, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (node, segment) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[segment] : undefined,
      MESSAGES[locale],
    );
  if (typeof value !== "string") {
    throw new Error(`Missing message "${path}" in ${locale}.json`);
  }
  return value;
}

function leafOf(key: string): string {
  return key.slice(key.lastIndexOf(".") + 1);
}

describe("homepage sections (integration)", () => {
  describe("benefits strip (FR-014)", () => {
    it("shows the same four benefits the product page does, from the catalogue", () => {
      expect(featured.benefitKeys).toHaveLength(4);
      expect(featured.benefitKeys.map(leafOf)).toEqual([
        "empukNyaman",
        "antiSlip",
        "designLucu",
        "allSize",
      ]);
    });

    it.each(routing.locales)("has a benefit label and a description in %s", (locale) => {
      for (const key of featured.benefitKeys) {
        expect(message(locale, key)).not.toBe("");
        // The strip pairs each catalogue benefit with a sentence of its own,
        // looked up by the key's last segment.
        expect(message(locale, `home.benefits.${leafOf(key)}`)).not.toBe("");
      }
    });
  });

  describe("ordering steps (FR-022)", () => {
    it.each(routing.locales)("has four steps and a link to the full guide in %s", (locale) => {
      for (const step of ["s1", "s2", "s3", "s4"]) {
        expect(message(locale, `home.steps.${step}.title`)).not.toBe("");
        expect(message(locale, `home.steps.${step}.body`)).not.toBe("");
      }
      expect(message(locale, "home.steps.link")).not.toBe("");
      expect(localeHref("/cara-pemesanan", locale)).toBe(
        locale === "id" ? "/id/cara-pemesanan" : "/en/how-to-order",
      );
    });
  });

  describe("FAQ and its structured data (FR-023, FR-025)", () => {
    it("covers the four topics FR-023 names as the minimum", () => {
      expect(FAQ_ITEM_KEYS).toEqual(
        expect.arrayContaining(["cod", "ongkir", "ukuran", "pengembalian"]),
      );
    });

    it.each(routing.locales)("emits one Question per rendered item in %s", (locale) => {
      const t = (key: string) => message(locale, `faq.${key}`);
      const items = faqItems(t);
      const jsonLd = faqPageJsonLd(items);

      expect(jsonLd["@type"]).toBe("FAQPage");
      expect(jsonLd.mainEntity).toHaveLength(FAQ_ITEM_KEYS.length);

      // FR-025: every entry matches the copy actually displayed, in this language.
      for (const [index, item] of items.entries()) {
        const entry = jsonLd.mainEntity[index];
        expect(entry["@type"]).toBe("Question");
        expect(entry.name).toBe(item.question);
        expect(entry.acceptedAnswer.text).toBe(item.answer);
        expect(item.question).not.toBe("");
        expect(item.answer).not.toBe("");
      }
    });

    it("asks a different question in each language, not the same string twice", () => {
      const idItems = faqItems((key) => message("id", `faq.${key}`));
      const enItems = faqItems((key) => message("en", `faq.${key}`));

      for (const [index, item] of idItems.entries()) {
        expect(enItems[index].question).not.toBe(item.question);
      }
    });
  });

  /**
   * 007 T026, FR-012 and SC-003: every quick-access tile leads somewhere real —
   * a storefront category, an anchor on this page, or a routed page.
   */
  describe("quick-access row (007 FR-012)", () => {
    const labels = {
      featured: "Produk unggulan",
      checkOrder: "Cek pesanan",
      howToOrder: "Cara pesan",
      cod: "Bayar di tempat",
      writeReview: "Tulis ulasan",
    };

    it.each(routing.locales)("builds real hrefs in %s", (locale) => {
      const items = quickAccessItems({
        locale,
        categories: [{ slug: "sandal", name: "Sandal" }],
        labels,
      });
      const hrefs = items.map((item) => item.href);
      expect(hrefs).toEqual([
        localeHref("/kategori/[slug]", locale, { slug: "sandal" }),
        "#produk",
        localeHref("/cek-pesanan", locale),
        localeHref("/cara-pemesanan", locale),
        "#pembayaran",
        localeHref("/ulasan", locale),
      ]);
      for (const item of items) expect(item.label).not.toBe("");
    });

    it("declares every in-page anchor it links to", () => {
      const read = (...segments: string[]) =>
        readFileSync(path.join(process.cwd(), "src", ...segments), "utf8");
      expect(read("components", "product", "ProductDetail.tsx")).toMatch(/id="produk"/);
      expect(read("components", "home", "PaymentDeliveryInfo.tsx")).toMatch(/id="pembayaran"/);
    });

    it.each(routing.locales)("has every label in %s", (locale) => {
      for (const key of ["title", ...Object.keys(labels)]) {
        expect(message(locale, `home.quickAccess.${key}`)).not.toBe("");
      }
    });
  });

  describe("Segera hadir grid (007 FR-022)", () => {
    it("links 'see all' to the category page and uses the dense grid", () => {
      const page = readFileSync(
        path.join(process.cwd(), "src", "app", "[locale]", "(home)", "page.tsx"),
        "utf8",
      );
      expect(page).toMatch(/variant="dense"/);
      expect(page).toMatch(/localeHref\("\/kategori\/\[slug\]"/);
      expect(page).not.toMatch(/FinalCta|CategoryTiles|<SocialProof/);
    });

    it.each(routing.locales)("has the see-all label in %s", (locale) => {
      expect(message(locale, "home.comingSoon.viewAll")).not.toBe("");
    });
  });

  /**
   * 006 R-513: the reviews section appears only with published reviews. A sold
   * count on its own no longer brings it up.
   */
  describe("reviews section needs published reviews (006 R-513)", () => {
    beforeEach(async () => {
      await resetDb();
    });

    afterEach(async () => {
      await resetDb();
    });

    it("is hidden with a non-null sold count and 0 reviews", async () => {
      const product = await seedProduct({
        slug: "terjual-tanpa-ulasan",
        status: "ACTIVE",
        priceIDR: 100000,
        stock: 5,
      });
      await prisma.product.update({
        where: { id: product.id },
        data: { soldCountBaseline: 12 },
      });

      const { getReviewStats } = await import("@/infrastructure/db/review-stats");
      const { getSoldCount } = await import("@/infrastructure/db/sold-count");
      const [stats, soldCount] = await Promise.all([
        getReviewStats(product.id),
        getSoldCount(product.id),
      ]);

      expect(soldCount).not.toBeNull();
      expect(stats.count).toBe(0);
      expect(hasPublishedReviews(stats)).toBe(false);
    });

    it("is visible once a published review exists", async () => {
      const product = await seedProduct({
        slug: "dengan-ulasan",
        status: "ACTIVE",
        priceIDR: 100000,
        stock: 5,
      });
      await prisma.review.create({
        data: {
          origin: "OWNER_ENTERED",
          rating: 4,
          reviewerName: "Pembeli",
          published: true,
          reviewedAt: new Date(),
          productId: product.id,
        },
      });

      const { getReviewStats } = await import("@/infrastructure/db/review-stats");
      const stats = await getReviewStats(product.id);

      expect(stats.count).toBe(1);
      expect(hasPublishedReviews(stats)).toBe(true);
    });
  });

  /**
   * FR-021 and SC-005. The section's only condition is
   * `stats.average === null && soldCount === null` — it does not re-derive
   * `count > 0`. These assert the readers really do produce that null at zero
   * and real figures once there is data, which is what makes the condition
   * correct (research.md R-010).
   */
  describe("social proof reflects real data only (FR-021, SC-005)", () => {
    beforeEach(async () => {
      await resetDb();
      await seedStockLevel(10);
    });

    afterEach(async () => {
      await resetDb();
    });

    it("has nothing to render with zero reviews and a zero sold count", async () => {
      const { getReviewStats } = await import("@/infrastructure/db/review-stats");
      const { getSoldCount } = await import("@/infrastructure/db/sold-count");

      const [stats, soldCount] = await Promise.all([getReviewStats(), getSoldCount()]);

      expect(stats.average).toBeNull();
      expect(soldCount).toBeNull();
      // Both null is the whole condition the section is hidden by.
      expect(stats.average === null && soldCount === null).toBe(true);
    });

    it("shows the same figures the product page reads once data exists", async () => {
      await prisma.review.create({
        data: {
          origin: "OWNER_ENTERED",
          rating: 5,
          reviewerName: "Pembeli Tokoshopee",
          comment: "Empuk sekali.",
          published: true,
          reviewedAt: new Date(),
        },
      });
      // 003: the baseline lives on the product (spec Assumptions)
      await prisma.product.update({
        where: { slug: "slippers-gemoy" },
        data: { soldCountBaseline: 12 },
      });

      const { getReviewStats, getPublishedReviews } =
        await import("@/infrastructure/db/review-stats");
      const { getSoldCount } = await import("@/infrastructure/db/sold-count");

      const [stats, page, soldCount] = await Promise.all([
        getReviewStats(),
        getPublishedReviews(1),
        getSoldCount(),
      ]);

      expect(stats.average).toBe(5);
      expect(stats.count).toBe(1);
      expect(soldCount).toBe(12);
      // The section quotes at most the first three of this same page.
      expect(page.reviews.slice(0, 3)).toHaveLength(1);
      expect(page.reviews[0].reviewerName).toBe("Pembeli Tokoshopee");
    });

    it("never treats an unpublished review as social proof", async () => {
      await prisma.review.create({
        data: {
          origin: "OWNER_ENTERED",
          rating: 1,
          reviewerName: "Belum Disetujui",
          published: false,
          reviewedAt: new Date(),
        },
      });

      const { getReviewStats, getPublishedReviews } =
        await import("@/infrastructure/db/review-stats");

      const [stats, page] = await Promise.all([getReviewStats(), getPublishedReviews(1)]);

      expect(stats.average).toBeNull();
      expect(page.reviews).toHaveLength(0);
    });
  });
});
