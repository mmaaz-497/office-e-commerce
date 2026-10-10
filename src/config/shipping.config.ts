import { z } from "zod";

/**
 * Every commercial value below is a PLACEHOLDER (FR-011a) — replace with the
 * client's real courier rates and COD-disabled list before launch. COD
 * carries no fee.
 * The release checklist greps for the literal string PLACEHOLDER and refuses
 * to proceed while any instance remains.
 */

export const rawShippingConfig = {
  // PLACEHOLDER — pairs of slippers per billable kilogram.
  pairsPerKg: 2,

  // PLACEHOLDER — one entry per province, rate in whole IDR per billable kg.
  zones: {
    "11": { rateIDR: 20000 }, // PLACEHOLDER — Aceh
    "12": { rateIDR: 20000 }, // PLACEHOLDER — Sumatera Utara
    "13": { rateIDR: 20000 }, // PLACEHOLDER — Sumatera Barat
    "14": { rateIDR: 20000 }, // PLACEHOLDER — Riau
    "15": { rateIDR: 20000 }, // PLACEHOLDER — Jambi
    "16": { rateIDR: 20000 }, // PLACEHOLDER — Sumatera Selatan
    "17": { rateIDR: 20000 }, // PLACEHOLDER — Bengkulu
    "18": { rateIDR: 20000 }, // PLACEHOLDER — Lampung
    "19": { rateIDR: 20000 }, // PLACEHOLDER — Kepulauan Bangka Belitung
    "21": { rateIDR: 20000 }, // PLACEHOLDER — Kepulauan Riau
    "31": { rateIDR: 15000 }, // PLACEHOLDER — Daerah Khusus Ibukota Jakarta
    "32": { rateIDR: 15000 }, // PLACEHOLDER — Jawa Barat
    "33": { rateIDR: 15000 }, // PLACEHOLDER — Jawa Tengah
    "34": { rateIDR: 15000 }, // PLACEHOLDER — Daerah Istimewa Yogyakarta
    "35": { rateIDR: 15000 }, // PLACEHOLDER — Jawa Timur
    "36": { rateIDR: 15000 }, // PLACEHOLDER — Banten
    "51": { rateIDR: 15000 }, // PLACEHOLDER — Bali
    "52": { rateIDR: 20000 }, // PLACEHOLDER — Nusa Tenggara Barat
    "53": { rateIDR: 20000 }, // PLACEHOLDER — Nusa Tenggara Timur
    "61": { rateIDR: 20000 }, // PLACEHOLDER — Kalimantan Barat
    "62": { rateIDR: 20000 }, // PLACEHOLDER — Kalimantan Tengah
    "63": { rateIDR: 20000 }, // PLACEHOLDER — Kalimantan Selatan
    "64": { rateIDR: 20000 }, // PLACEHOLDER — Kalimantan Timur
    "65": { rateIDR: 20000 }, // PLACEHOLDER — Kalimantan Utara
    "71": { rateIDR: 25000 }, // PLACEHOLDER — Sulawesi Utara
    "72": { rateIDR: 25000 }, // PLACEHOLDER — Sulawesi Tengah
    "73": { rateIDR: 25000 }, // PLACEHOLDER — Sulawesi Selatan
    "74": { rateIDR: 25000 }, // PLACEHOLDER — Sulawesi Tenggara
    "75": { rateIDR: 25000 }, // PLACEHOLDER — Gorontalo
    "76": { rateIDR: 25000 }, // PLACEHOLDER — Sulawesi Barat
    "81": { rateIDR: 25000 }, // PLACEHOLDER — Maluku
    "82": { rateIDR: 25000 }, // PLACEHOLDER — Maluku Utara
    "91": { rateIDR: 25000 }, // PLACEHOLDER — Papua
    "92": { rateIDR: 25000 }, // PLACEHOLDER — Papua Barat
    "93": { rateIDR: 25000 }, // PLACEHOLDER — Papua Selatan
    "94": { rateIDR: 25000 }, // PLACEHOLDER — Papua Tengah
    "95": { rateIDR: 25000 }, // PLACEHOLDER — Papua Pegunungan
    "96": { rateIDR: 25000 }, // PLACEHOLDER — Papua Barat Daya
  },

  // PLACEHOLDER — provinces where COD is not offered.
  codDisabledProvinces: [
    "91", // Papua
    "92", // Papua Barat
    "93", // Papua Selatan
    "94", // Papua Tengah
    "95", // Papua Pegunungan
    "96", // Papua Barat Daya
  ],
} as const;

const zoneSchema = z.object({
  rateIDR: z.number().int().positive(),
});

export const shippingConfigSchema = z
  .object({
    pairsPerKg: z.number().int().positive(),
    zones: z.record(z.string(), zoneSchema),
    codDisabledProvinces: z.array(z.string()),
  })
  .superRefine((config, ctx) => {
    for (const code of config.codDisabledProvinces) {
      if (!(code in config.zones)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `codDisabledProvinces entry "${code}" has no matching zone rate`,
          path: ["codDisabledProvinces"],
        });
      }
    }
  });

export type ShippingConfig = z.infer<typeof shippingConfigSchema>;
