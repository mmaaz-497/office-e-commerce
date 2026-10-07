import { z } from "zod";
import { shippingConfig } from "@/config";
import regions from "@/data/regions.id.json";
import { SLUG_PATTERN } from "@/domain/catalogue/product-schema";

const provinceCodes = new Set(shippingConfig.zones ? Object.keys(shippingConfig.zones) : []);
const cityByCode = new Map(regions.cities.map((c) => [c.code, c]));

/**
 * Input for `submitCheckout` — matches contracts/http-api.md exactly.
 * Accepts no monetary field from the client (FR-013): the server quotes the
 * order itself, from the catalogue and shippingConfig only.
 *
 * `productSlug` (003, contracts/checkout.md) names the product; it is a
 * lookup key, never a price. Absent, the server buys the only product on sale.
 */
export const checkoutInputSchema = z
  .object({
    productSlug: z.string().regex(SLUG_PATTERN).max(80).optional(),
    quantity: z.number().int().min(1).max(10),
    name: z.string().min(2).max(100),
    phone: z.string().min(9).max(20),
    email: z
      .string()
      .email()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    provinceCode: z.string().refine((code) => provinceCodes.has(code), {
      message: "errors.unknownProvince",
    }),
    cityCode: z.string(),
    district: z.string().min(2).max(100),
    postalCode: z.string().regex(/^\d{5}$/, { message: "errors.invalidPostalCode" }),
    streetAddress: z.string().min(5).max(500),
    paymentMethod: z.enum(["ONLINE", "COD"]),
    note: z
      .string()
      .max(500)
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((data, ctx) => {
    const city = cityByCode.get(data.cityCode);
    if (!city) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "errors.unknownCity",
        path: ["cityCode"],
      });
      return;
    }
    if (city.provinceCode !== data.provinceCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "errors.cityProvinceMismatch",
        path: ["cityCode"],
      });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
