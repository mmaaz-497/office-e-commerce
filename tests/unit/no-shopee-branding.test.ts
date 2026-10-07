import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * FR-074, Constitution Principle II. "Tokoshopee" — the store's own name —
 * contains the literal substring "shopee" and is the one permitted match;
 * the keyword check below only flags a "shopee" that is NOT part of that
 * word. The colour check is a value comparison against the brand tokens
 * actually declared, not a text grep, because both globals.css and
 * tailwind.config.ts intentionally document the forbidden hex in a comment
 * to explain why it is absent — grepping raw text would fail on that comment.
 */

const ROOT = join(process.cwd());

const CATALOGUE_AND_CONFIG_FILES = [
  "src/messages/id.json",
  "src/messages/en.json",
  "src/data/product.json",
  "src/data/regions.id.json",
  "src/config/env.ts",
  "src/config/index.ts",
  "src/config/shipping.config.ts",
  // 005 T042: the sample definitions are an import source too.
  "prisma/samples/definitions.ts",
];

/** Matches "shopee" unless it is immediately preceded by "toko" (case-insensitive). */
const STANDALONE_SHOPEE = /(?<!toko)shopee/gi;

const SHOPEE_ORANGE = "#ee4d2d";

describe("no Shopee branding (FR-074)", () => {
  it.each(CATALOGUE_AND_CONFIG_FILES)(
    "%s carries no Shopee keyword outside the store name",
    (path) => {
      const contents = readFileSync(join(ROOT, path), "utf-8");
      const hits = contents.match(STANDALONE_SHOPEE) ?? [];
      expect(hits).toEqual([]);
    },
  );

  it("the declared Tailwind colour tokens exclude Shopee orange", async () => {
    const { default: config } = await import("../../tailwind.config");
    const colors = config.theme?.extend?.colors as Record<string, unknown> | undefined;
    const hexValues: string[] = [];

    function collect(node: unknown): void {
      if (typeof node === "string") {
        hexValues.push(node);
      } else if (node && typeof node === "object") {
        for (const value of Object.values(node)) collect(value);
      }
    }
    collect(colors);

    expect(hexValues.length).toBeGreaterThan(0);
    for (const hex of hexValues) {
      expect(hex.toLowerCase()).not.toBe(SHOPEE_ORANGE);
    }
  });

  it("the CSS custom-property colour tokens exclude Shopee orange", () => {
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf-8");
    const declaredHexValues = [...css.matchAll(/--color-[\w-]+:\s*(#[0-9a-fA-F]{6})/g)].map(
      (match) => match[1].toLowerCase(),
    );

    expect(declaredHexValues.length).toBeGreaterThan(0);
    expect(declaredHexValues).not.toContain(SHOPEE_ORANGE);
  });
});
