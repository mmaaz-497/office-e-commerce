import { getTranslations } from "next-intl/server";
import type { ProductView } from "@/infrastructure/db/catalogue";

/**
 * The specifications table (007 FR-019): label/value rows from the catalogue.
 * Absent, not empty, when the product has no specs.
 */
export async function SpecsTable({ specs }: { specs: ProductView["specs"] }) {
  if (specs.length === 0) return null;
  const t = await getTranslations("product.sections");
  return (
    <section id="spesifikasi" aria-labelledby="spesifikasi-title" className="scroll-mt-28">
      <h2
        id="spesifikasi-title"
        className="text-ink mb-4 text-xl leading-7 font-semibold lg:text-2xl lg:leading-8"
      >
        {t("specs")}
      </h2>
      <table className="border-border w-full max-w-3xl border-collapse overflow-hidden rounded-md border text-sm sm:text-base">
        <tbody>
          {specs.map((row) => (
            <tr key={row.label} className="border-border border-b last:border-b-0">
              <th
                scope="row"
                className="bg-surface-muted text-ink-2 w-2/5 px-3 py-3 text-left align-top font-medium sm:w-1/3 sm:px-4"
              >
                {row.label}
              </th>
              <td className="bg-surface text-ink px-3 py-3 align-top sm:px-4">{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
