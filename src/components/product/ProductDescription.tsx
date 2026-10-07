import { getTranslations } from "next-intl/server";

/**
 * The long description (007 FR-019), one paragraph per blank-line-separated
 * block. Absent, not empty, when there is no text.
 */
export async function ProductDescription({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;
  const t = await getTranslations("product.sections");
  return (
    <section id="deskripsi" aria-labelledby="deskripsi-title" className="scroll-mt-28">
      <h2
        id="deskripsi-title"
        className="text-ink mb-4 text-xl leading-7 font-semibold lg:text-2xl lg:leading-8"
      >
        {t("description")}
      </h2>
      <div className="text-ink-2 flex max-w-3xl flex-col gap-4 text-base whitespace-pre-line">
        {paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
