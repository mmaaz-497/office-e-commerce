import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { asAppLocale, localeHref } from "@/i18n/pathnames";
import { env } from "@/config";
import { routeMetadata } from "@/infrastructure/seo/metadata";
import { resolveCheckoutProduct } from "@/infrastructure/db/catalogue";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("checkout.metadata");
  return routeMetadata({
    locale: asAppLocale(locale),
    internal: "/checkout",
    title: t("title"),
    description: t("description"),
  });
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ product?: string | string[]; quantity?: string }>;
}) {
  const { locale } = await params;
  const appLocale = asAppLocale(locale);
  const { product: productParam, quantity } = await searchParams;
  const initialQuantity = Math.min(10, Math.max(1, Number(quantity) || 1));

  // The product comes from the database, never from the client (contracts/checkout.md).
  // A repeated ?product= is ambiguous, so it is treated as an unknown product.
  const slug = Array.isArray(productParam) ? "" : productParam;
  const resolution = await resolveCheckoutProduct(slug, appLocale);
  if (resolution.kind === "notFound") notFound();
  if (resolution.kind === "redirectHome") redirect(localeHref("/", appLocale));
  if (resolution.kind === "redirectToProduct") {
    redirect(localeHref("/produk/[slug]", appLocale, { slug: resolution.slug }));
  }
  const { product } = resolution;

  return (
    <CheckoutForm
      locale={appLocale}
      initialQuantity={initialQuantity}
      productSlug={product.slug}
      productName={product.name}
      // resolveCheckoutProduct returns only products on sale, which have a price.
      unitPriceIDR={product.priceIDR!}
      midtransClientKey={env.MIDTRANS_CLIENT_KEY}
      midtransIsProduction={env.MIDTRANS_IS_PRODUCTION}
    />
  );
}
