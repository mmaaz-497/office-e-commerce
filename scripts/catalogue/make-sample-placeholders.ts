/**
 * Developer-only: writes public/images/placeholders/sample-01.png … sample-10.png
 * from prisma/samples/definitions.ts (005 research R-413). Not run by CI,
 * build or deploy; the PNGs are committed and `npm run check:media` validates
 * them.
 *
 *   npx tsx scripts/catalogue/make-sample-placeholders.ts
 *
 * Each placeholder is typography and flat geometry on a brand tint — never a
 * product photo or a realistic illustration (CLAUDE.md Honest content). Since
 * 007 (research R-712) it carries the category, a pair of abstract sole
 * outlines and the wordmark (the card itself overlays the "Segera Hadir"
 * badge top-left, so the image does not repeat it), so the Segera hadir grid reads
 * as a shelf of upcoming products rather than a wall of flat colour. It is drawn as a 1200×1200 SVG
 * and rendered to PNG by the locally installed Chrome, so no image library is
 * added. Set CHROME_PATH to use a Chrome outside the standard install paths.
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { SAMPLE_DEFINITIONS } from "../../prisma/samples/definitions";
import { SAMPLE_IMAGE_SIZE } from "../../src/domain/catalogue/samples";

// Design System tokens (CLAUDE.md §Colour tokens). Text pairs are checked in
// tests/unit/placeholder-contrast.test.ts.
const INK = "#2E1B10";
const INK_2 = "#5C4434";
const SURFACE = "#FFFFFF";
const BORDER_STRONG = "#9A8471";
const ACCENT = "#E0A758";
const FONT_STACK = "'Segoe UI', Arial, Helvetica, sans-serif";
const NAME_SIZE = 72;
const LINE_HEIGHT = 86;
/** Characters per line at 72px across ~1000px of usable width. */
const MAX_LINE_CHARS = 22;
const MAX_LINES = 3;
const CATEGORY_LABEL = "Sandal";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** A simple greedy word wrap; the plan's names fit in two or three lines. */
function wrap(text: string): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= MAX_LINE_CHARS) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  if (lines.length > MAX_LINES) {
    throw new Error(`"${text}" needs ${lines.length} lines; at most ${MAX_LINES} fit`);
  }
  return lines;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One abstract sole: a rounded slab with a strap band, rotated about its centre. */
function sole(cx: number, angle: number): string {
  const width = 190;
  const height = 430;
  const top = 230;
  const cy = top + height / 2;
  return `<g transform="rotate(${angle} ${cx} ${cy})">
<rect x="${cx - width / 2}" y="${top}" width="${width}" height="${height}" rx="${width / 2}" fill="${SURFACE}" fill-opacity="0.55" stroke="${BORDER_STRONG}" stroke-opacity="0.45" stroke-width="8"/>
<rect x="${cx - width / 2 - 6}" y="${top + 110}" width="${width + 12}" height="64" rx="20" fill="${ACCENT}" fill-opacity="0.6"/>
</g>`;
}

function svgFor(name: string, tint: string): string {
  const size = SAMPLE_IMAGE_SIZE;
  const lines = wrap(name);
  // The name block sits under the soles, its last line at a fixed height so
  // two- and three-line names end at the same place above the wordmark.
  const lastBaseline = 960;
  const firstBaseline = lastBaseline - (lines.length - 1) * LINE_HEIGHT;
  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${size / 2}" y="${firstBaseline + index * LINE_HEIGHT}">${escapeXml(line)}</tspan>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${tint}"/>
<rect x="56" y="56" width="${size - 112}" height="${size - 112}" rx="40" fill="none" stroke="${BORDER_STRONG}" stroke-opacity="0.25" stroke-width="4"/>
<text x="${size - 100}" y="143" text-anchor="end" font-family="${FONT_STACK}" font-size="36" font-weight="600" fill="${INK_2}">${CATEGORY_LABEL}</text>
${sole(size / 2 - 115, -9)}
${sole(size / 2 + 115, 9)}
<text text-anchor="middle" font-family="${FONT_STACK}" font-size="${NAME_SIZE}" font-weight="700" fill="${INK}">${tspans}</text>
<text x="100" y="${size - 100}" font-family="${FONT_STACK}" font-size="36" font-weight="700" fill="${INK_2}">Tokoshopee</text>
</svg>
`;
}

function main(): number {
  const chrome = CHROME_CANDIDATES.find((path) => path && existsSync(path));
  if (!chrome) {
    console.error(
      "No Chrome found. Install Google Chrome or set CHROME_PATH to its executable, then re-run.",
    );
    return 1;
  }

  const outDir = resolve(process.cwd(), "public", "images", "placeholders");
  mkdirSync(outDir, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "sample-placeholders-"));

  for (const definition of SAMPLE_DEFINITIONS) {
    const file = definition.image.split("/").pop()!;
    const svgPath = join(scratch, file.replace(/\.png$/, ".svg"));
    const pngPath = join(outDir, file);
    writeFileSync(svgPath, svgFor(definition.id.name, definition.tint));

    const result = spawnSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        `--window-size=${SAMPLE_IMAGE_SIZE},${SAMPLE_IMAGE_SIZE}`,
        `--screenshot=${pngPath}`,
        pathToFileURL(svgPath).href,
      ],
      { stdio: "pipe" },
    );
    if (result.status !== 0 || !existsSync(pngPath)) {
      console.error(`Chrome failed to render ${file}:`, result.stderr?.toString());
      return 1;
    }
    console.log(`wrote ${definition.image}`);
  }
  return 0;
}

process.exitCode = main();
