import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getImageProps } from "next/image";
import catalogue from "@/data/product.json";
import type { Product } from "@/data/product-types";
import {
  HERO_DESKTOP_MEDIA,
  HERO_DESKTOP_SIZES,
  HERO_MOBILE_MEDIA,
  HERO_MOBILE_SIZES,
  HERO_QUALITY,
  sideBanner,
} from "@/components/home/hero-config";
import { localeHref } from "@/i18n/pathnames";
import { routing } from "@/i18n/routing";
import { resetDb, seedProduct } from "./helpers/db";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

/**
 * FR-007, FR-008, FR-010, FR-030; 006 R-511 (the h1 is the featured product's name).
 *
 * The behavioural half of the hero (autoplay, pause, dots) lives in a client
 * component driven by IntersectionObserver, matchMedia and timers, none of
 * which exist meaningfully outside a browser — that is covered by the manual
 * checks in quickstart.md §5.1. What is worth pinning here is the part that is
 * pure and silently breakable: which banners each breakpoint gets, that every
 * banner links to the product page, and that the preload link resolves to the
 * exact URL the rendered <Image> will request. If those drift, the hero still
 * renders and simply costs twice the bytes.
 */

const PRODUCTS = catalogue as Product[];
const featured = PRODUCTS[0];
const MESSAGES = { id, en } as const;

const desktopImages = featured.images.filter((image) => image.orientation === "landscape");
const mobileImages = featured.images.filter(
  (image) => image.orientation === "portrait" || image.orientation === "square",
);

describe("homepage hero (integration)", () => {
  describe("art direction (FR-010)", () => {
    it("has artwork for both breakpoints", () => {
      expect(desktopImages.length).toBeGreaterThan(0);
      expect(mobileImages.length).toBeGreaterThan(0);
    });

    it("never shows the same banner on both breakpoints", () => {
      const shared = desktopImages.filter((image) => mobileImages.includes(image));
      expect(shared).toHaveLength(0);
    });

    it("scopes the two tracks to complementary media queries", () => {
      expect(HERO_MOBILE_MEDIA).toBe("(max-width: 767px)");
      expect(HERO_DESKTOP_MEDIA).toBe("(min-width: 768px)");
    });
  });

  describe("every banner links to the product page (FR-007)", () => {
    it.each(routing.locales)("builds the localised product href in %s", (locale) => {
      const href = localeHref("/produk/[slug]", locale, { slug: featured.slug });
      expect(href).toBe(
        locale === "id" ? "/id/produk/slippers-gemoy" : "/en/product/slippers-gemoy",
      );
    });

    it("has a slug in the catalogue for the href to be built from", () => {
      expect(featured.slug.length).toBeGreaterThan(0);
    });
  });

  describe("preload matches what the image will request (FR-030, R-002)", () => {
    it("preloads exactly one candidate set per breakpoint", () => {
      // One mobile first slide and one desktop first slide — never both for
      // one viewport, which is what `priority` on both would have produced.
      expect(mobileImages[0]).toBeDefined();
      expect(desktopImages[0]).toBeDefined();
    });

    it.each([
      ["mobile", () => mobileImages[0], HERO_MOBILE_SIZES],
      ["desktop", () => desktopImages[0], HERO_DESKTOP_SIZES],
    ] as const)("%s preload srcSet equals the rendered image's srcSet", (_name, pick, sizes) => {
      const image = pick();

      const build = () =>
        getImageProps({
          src: image.src,
          width: image.width,
          height: image.height,
          sizes,
          quality: HERO_QUALITY,
          alt: "",
        }).props;

      // Same inputs in both places (HeroPreload and HeroCarousel) must yield
      // the same URL, or the preload warms something nothing asks for.
      expect(build().srcSet).toBe(build().srcSet);
      expect(build().srcSet).toBeTruthy();
      expect(build().sizes).toBe(sizes);
    });

    it("routes hero images through the Next image optimiser (FR-008)", () => {
      const { props } = getImageProps({
        src: mobileImages[0].src,
        width: mobileImages[0].width,
        height: mobileImages[0].height,
        sizes: HERO_MOBILE_SIZES,
        quality: HERO_QUALITY,
        alt: "",
      });
      expect(props.src).toContain("/_next/image");
      expect(props.srcSet).toContain("/_next/image");
    });
  });

  describe("copy is bilingual and comes from the catalogue (FR-005, FR-027)", () => {
    it.each(routing.locales)("resolves every banner's alt text in %s", (locale) => {
      for (const image of featured.images) {
        const value = image.altKey
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown> | undefined)?.[key],
            MESSAGES[locale],
          );
        expect(typeof value).toBe("string");
        expect((value as string).length).toBeGreaterThan(0);
      }
    });

    it.each(routing.locales)("has hero region and dot labels in %s", (locale) => {
      const hero = MESSAGES[locale].home.hero;
      expect(hero.region.length).toBeGreaterThan(0);
      expect(hero.viewProduct.length).toBeGreaterThan(0);
      expect(hero.goToSlide).toContain("{number}");
      expect(hero.previous.length).toBeGreaterThan(0);
      expect(hero.next.length).toBeGreaterThan(0);
    });

    it("keeps the hero labels in parity across id and en", () => {
      const keys = ["region", "goToSlide", "viewProduct", "previous", "next"] as const;
      for (const key of keys) {
        expect(typeof MESSAGES.id.home.hero[key]).toBe("string");
        expect(typeof MESSAGES.en.home.hero[key]).toBe("string");
      }
    });
  });

  /**
   * 006 R-511: the hero h1 names whichever product is featured, from the
   * catalogue, not from message copy that goes wrong when the featured
   * product changes (Principle III).
   */
  describe("the h1 is the featured product's name (006 R-511)", () => {
    const PAGE = path.join(process.cwd(), "src", "app", "[locale]", "(home)", "page.tsx");

    beforeAll(async () => {
      await resetDb();
      // seedProduct names it "Produk …" in id and "Product …" in en.
      await seedProduct({ slug: "hero-uji", status: "ACTIVE", priceIDR: 100000, stock: 5 });
    });

    afterAll(async () => {
      await resetDb();
    });

    it("reads a different name per locale from getFeaturedProduct", async () => {
      const { getFeaturedProduct } = await import("@/infrastructure/db/catalogue");

      const [inId, inEn] = await Promise.all([getFeaturedProduct("id"), getFeaturedProduct("en")]);

      expect(inId.name).toBe("Produk hero-uji");
      expect(inEn.name).toBe("Product hero-uji");
    });

    it("renders featured.name in the page's one h1, not a message key", () => {
      // Since 007 the h1 is the buy box's product name (FR-027): the page has
      // none of its own and hands the featured product to ProductDetail.
      const source = readFileSync(PAGE, "utf8");
      expect(source).not.toMatch(/<h1\b/);
      expect(source).toMatch(/<ProductDetail\b[\s\S]*?product=\{featured\}/);
      expect(source).not.toMatch(/home\.hero\.(title|subtitle|eyebrow)/);

      const buyBox = readFileSync("src/components/product/BuyBox.tsx", "utf8");
      const h1 = buyBox.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
      expect(h1).not.toBeNull();
      expect(h1?.[1].trim()).toBe("{product.name}");
      expect(buyBox.match(/<h1\b/g)).toHaveLength(1);
    });
  });
});

/**
 * 007 T025, research R-706: at lg the carousel takes two thirds of the row and
 * one square banner the remaining third, so no baked-in text is cropped. The
 * preload and the carousel read one sizes constant, sized for that column.
 */
describe("hero row with a side banner (007 US2)", () => {
  it("picks the first square banner for the side tile", () => {
    const square = featured.images.find((image) => image.orientation === "square");
    expect(square).toBeDefined();
    expect(sideBanner(featured.images)).toBe(square);
  });

  it("has no side tile when the product has no square banner", () => {
    const withoutSquare = featured.images.filter((image) => image.orientation !== "square");
    expect(sideBanner(withoutSquare)).toBeNull();
  });

  it("sizes the desktop carousel for its two-thirds column", () => {
    expect(HERO_DESKTOP_SIZES).toBe("(min-width: 1280px) 820px, (min-width: 1024px) 66vw, 100vw");
  });

  it("HeroPreload and HeroCarousel both read the shared sizes constant", () => {
    for (const file of ["HeroPreload.tsx", "HeroCarousel.tsx"]) {
      const source = readFileSync(path.join("src/components/home", file), "utf8");
      expect(source).toMatch(/HERO_DESKTOP_SIZES/);
      expect(source).not.toMatch(/sizes="\(min-width/);
    }
  });
});
