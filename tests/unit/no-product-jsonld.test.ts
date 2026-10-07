import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import catalogue from "@/data/product.json";
import { FAQ_ITEM_KEYS, faqItems, faqPageJsonLd } from "@/components/home/faq-items";
import id from "@/messages/id.json";

/**
 * T024 (005 R-409, FR-037). Pages are not mounted in tests, so this is a
 * static guarantee instead: no source file builds Product structured data
 * today. When Phase 4 adds it, it must do so on purpose, behind isIndexable,
 * and change this test — a COMING_SOON product can never leak into it by
 * accident. The FAQ structured data, the one JSON-LD the storefront does emit,
 * names no catalogue product.
 */
const SRC = join(process.cwd(), "src");
const PRODUCT_TYPE = /["']@type["']\s*:\s*["']Product["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("no Product structured data (R-409)", () => {
  it('no file under src/ builds "@type": "Product"', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => PRODUCT_TYPE.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"));

    expect(offenders).toEqual([]);
  });

  it("the pattern does catch both quote styles", () => {
    expect(PRODUCT_TYPE.test(`{ "@type": "Product" }`)).toBe(true);
    expect(PRODUCT_TYPE.test(`{ '@type': 'Product' }`)).toBe(true);
    expect(PRODUCT_TYPE.test(`{ "@type": "FAQPage" }`)).toBe(false);
  });

  it("the FAQ structured data names no catalogue slug", () => {
    const faq = id.faq as unknown as { items: Record<string, { q: string; a: string }> };
    const t = (key: string) => {
      const [, item, field] = key.split(".");
      return faq.items[item][field as "q" | "a"];
    };
    const json = JSON.stringify(faqPageJsonLd(faqItems(t)));

    expect(FAQ_ITEM_KEYS.length).toBeGreaterThan(0);
    for (const product of catalogue as Array<{ slug: string }>) {
      expect(json).not.toContain(product.slug);
    }
  });
});
