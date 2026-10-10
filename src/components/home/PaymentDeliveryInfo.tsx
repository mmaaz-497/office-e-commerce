import { getTranslations } from "next-intl/server";
import { shippingConfig } from "@/config";
import regions from "@/data/regions.id.json";
import { codUnavailableProvinceNames } from "@/domain/shipping/delivery-facts";
import { Container } from "@/components/ui/Container";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/SectionHeader";

/**
 * The payment and delivery facts (contracts/storefront.md, row 7; R-512).
 * Every statement is a rule checkout and the shipping provider enforce, read
 * from configuration, so the copy follows the config with no edit. No rate
 * amount is shown while those are placeholders (FR-024). COD has no fee.
 */
export async function PaymentDeliveryInfo() {
  const t = await getTranslations("home.paymentDelivery");

  const codUnavailable = codUnavailableProvinceNames(
    shippingConfig.codDisabledProvinces,
    regions.provinces,
  );
  const cod =
    codUnavailable.length === 0
      ? t("codAll")
      : t("codExcept", { provinces: codUnavailable.join(", ") });

  const facts: ReadonlyArray<{ key: string; icon: IconName; text: string }> = [
    { key: "online", icon: "shield", text: t("online") },
    { key: "cod", icon: "wallet", text: `${cod} ${t("codFree")}` },
    { key: "shipping", icon: "truck", text: t("shipping") },
  ];

  return (
    <section
      id="pembayaran"
      aria-labelledby="home-payment-delivery"
      className="scroll-mt-28 py-8 lg:py-12"
    >
      <Container>
        <SectionHeader id="home-payment-delivery" eyebrow={t("eyebrow")} title={t("title")} />
        <ul className="grid gap-3 md:grid-cols-3 lg:gap-4">
          {facts.map(({ key, icon, text }) => (
            <li
              key={key}
              className="bg-surface border-border flex items-start gap-3 rounded-md border p-4"
            >
              <span className="bg-primary-soft text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
                <Icon name={icon} className="h-5 w-5" />
              </span>
              <p className="text-ink text-sm">{text}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
