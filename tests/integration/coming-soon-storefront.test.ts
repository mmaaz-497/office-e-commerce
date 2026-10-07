import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/infrastructure/db/prisma";
import { storefrontDisplay } from "@/domain/catalogue/status";
import { getListedProductBySlug, resolveCheckoutProduct } from "@/infrastructure/db/catalogue";
import { routing } from "@/i18n/routing";
import { absoluteUrl } from "@/infrastructure/seo/metadata";
import { resetDb, seedProduct, seedStockLevel } from "./helpers/db";
import { makeMockPaymentProvider } from "./helpers/mock-payment-provider";

/**
 * T023 (005 US2, FR-035 to FR-039, contracts/storefront.md). A COMING_SOON
 * product shows no price and no purchase element whatever price is stored, is
 * noindex, stays out of the sitemap and is refused at checkout; a DRAFT
 * product is not found. The existing product stays on sale throughout.
 */
const { mockPaymentProvider } = vi.hoisted(() => ({
  mockPaymentProvider: {} as ReturnType<typeof makeMockPaymentProvider>,
}));

vi.mock("@/infrastructure/payment/midtrans-provider", () => ({
  MidtransProvider: vi.fn().mockImplementation(function MockMidtransProvider() {
    return mockPaymentProvider;
  }),
}));

const EXISTING = "slippers-gemoy";
const COMING_SOON = "segera-uji";
const DRAFT = "draf-uji";

const JAKARTA_INPUT = {
  quantity: 1,
  name: "Sari Wulandari",
  phone: "081234567890",
  provinceCode: "31",
  cityCode: "3171",
  district: "Menteng",
  postalCode: "10310",
  streetAddress: "Jl. Merdeka No. 1",
  paymentMethod: "ONLINE" as const,
};

describe("Coming Soon on the storefront (integration)", () => {
  beforeEach(async () => {
    await resetDb();
    Object.assign(mockPaymentProvider, makeMockPaymentProvider());
    // seedCatalogue() through seedStockLevel, so the existing product has stock to sell.
    await seedStockLevel(5);
    await seedProduct({ slug: COMING_SOON, status: "COMING_SOON", priceIDR: 120000, stock: 5 });
    await seedProduct({ slug: DRAFT, status: "DRAFT", priceIDR: null });
  });

  afterEach(async () => {
    await resetDb();
  });

  it.each(routing.locales)(
    "(a) shows no price and no purchase for a stored-price COMING_SOON product in %s",
    async (locale) => {
      const comingSoon = await getListedProductBySlug(COMING_SOON, locale);
      expect(comingSoon).not.toBeNull();
      expect(comingSoon!.priceIDR).toBe(120000);
      const display = storefrontDisplay(comingSoon!);
      expect(display.comingSoon).toBe(true);
      expect(display.showPrice).toBe(false);
      expect(display.showPurchase).toBe(false);
      expect(display.showSocialProof).toBe(false);

      const existing = await getListedProductBySlug(EXISTING, locale);
      const existingDisplay = storefrontDisplay(existing!);
      expect(existingDisplay.showPrice).toBe(true);
      expect(existingDisplay.showPurchase).toBe(true);
    },
  );

  it.each(routing.locales)(
    "(b) product-page metadata is noindex for COMING_SOON and indexable for the existing product in %s",
    async (locale) => {
      const { generateMetadata } = await import("@/app/[locale]/produk/[slug]/page");

      const comingSoon = await generateMetadata({
        params: Promise.resolve({ locale, slug: COMING_SOON }),
      });
      expect(comingSoon.robots).toEqual({ index: false, follow: false });

      const existing = await generateMetadata({
        params: Promise.resolve({ locale, slug: EXISTING }),
      });
      // routeMetadata omits robots for an indexable page, which means index: true.
      expect(existing.robots).toBeUndefined();
      expect(existing.alternates?.canonical).toBe(
        absoluteUrl(locale, "/produk/[slug]", { slug: EXISTING }),
      );
    },
  );

  it.each(routing.locales)("(c) a DRAFT product is not found in %s", async (locale) => {
    expect(await getListedProductBySlug(DRAFT, locale)).toBeNull();
  });

  it("(d) checkout redirects a COMING_SOON product and 404s a DRAFT one", async () => {
    expect(await resolveCheckoutProduct(COMING_SOON, "id")).toEqual({
      kind: "redirectToProduct",
      slug: COMING_SOON,
    });
    expect(await resolveCheckoutProduct(DRAFT, "id")).toEqual({ kind: "notFound" });
    expect((await resolveCheckoutProduct(EXISTING, "id")).kind).toBe("ok");
  });

  it("(e) submitCheckout refuses the COMING_SOON product with no order and no stock change", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: COMING_SOON });

    expect(result).toEqual({ ok: false, errorKey: "errors.productUnavailable" });
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.stockChange.count()).toBe(0);
    expect(mockPaymentProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("(e) the existing product remains purchasable beside it", async () => {
    const { submitCheckout } = await import("@/app/actions/checkout");

    const result = await submitCheckout({ ...JAKARTA_INPUT, productSlug: EXISTING });

    expect(result.ok).toBe(true);
    expect(await prisma.order.count()).toBe(1);
  });

  it("(f) the sitemap lists neither the COMING_SOON nor the DRAFT product", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const locale of routing.locales) {
      expect(urls).toContain(absoluteUrl(locale, "/produk/[slug]", { slug: EXISTING }));
    }
    for (const slug of [COMING_SOON, DRAFT]) {
      expect(urls.some((url) => url.includes(slug))).toBe(false);
    }
  });
});
