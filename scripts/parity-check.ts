/**
 * Dev-only parity gate for 003-catalogue-database (tasks.md T031, quickstart #5).
 *
 * Fetches the same storefront pages from two production servers on the same
 * database — `main` (reads product.json) and this branch (reads the catalogue
 * tables) — and compares what a shopper or crawler can observe: visible text,
 * every href/src/alt, the title, meta description, canonical and hreflang.
 * Any difference prints a diff and exits 1. No dependencies: built-in fetch.
 *
 *   npx tsx scripts/parity-check.ts [mainBase] [branchBase] [orderNumber]
 *
 * Never point it at a production server: it is a read-only comparison of two
 * local builds.
 */

const MAIN = process.argv[2] ?? "http://localhost:3001";
const BRANCH = process.argv[3] ?? "http://localhost:3000";
const ORDER = process.argv[4] ?? "TKS-260928-94BYV";

const PAGES: Record<"id" | "en", string[]> = {
  id: [
    "/id",
    "/id/produk/slippers-gemoy",
    "/id/checkout?quantity=2",
    "/id/checkout?product=slippers-gemoy&quantity=2",
    "/id/cek-pesanan",
    "/id/ulasan",
    "/id/cara-pemesanan",
    `/id/pesanan/${ORDER}`,
  ],
  en: [
    "/en",
    "/en/product/slippers-gemoy",
    "/en/checkout?quantity=2",
    "/en/checkout?product=slippers-gemoy&quantity=2",
    "/en/check-order",
    "/en/write-review",
    "/en/how-to-order",
    `/en/order/${ORDER}`,
  ],
};

/**
 * Deliberate, contracted differences, applied to the branch's features only
 * and reported on every run so none can hide an unintended change.
 * - Phase 5 (contracts/checkout.md "Product page buy links"): the buy link
 *   names the product, `/checkout?product=<slug>&quantity=<n>`; the baseline
 *   links `/checkout?quantity=<n>`, which still resolves to the same page.
 */
const INTENDED_CHANGES: Array<{ name: string; pages: RegExp; from: RegExp; to: string }> = [
  {
    name: "buy link names the product (T036)",
    // Only the product page's buy links; elsewhere (the language switcher on
    // /checkout?product=…) the same href is carried over unchanged by both.
    pages: /^\/(?:id\/produk|en\/product)\//,
    from: /^href: (\/(?:id|en)\/checkout)\?product=[a-z0-9-]+&quantity=(\d+)$/,
    to: "href: $1?quantity=$2",
  },
];
const intendedHits = new Map<string, number>();

function applyIntendedChanges(path: string, features: string[]): string[] {
  return features.map((feature) => {
    for (const change of INTENDED_CHANGES) {
      if (change.pages.test(path) && change.from.test(feature)) {
        intendedHits.set(change.name, (intendedHits.get(change.name) ?? 0) + 1);
        return feature.replace(change.from, change.to);
      }
    }
    return feature;
  });
}

/** Removes what legitimately differs between two builds of the same output. */
function normalise(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*rel="(?:preload|stylesheet|modulepreload)"[^>]*>/gi, "")
    .replace(/\/_next\/static\/[^"'\s)]+/g, "/_next/static/<asset>")
    .replace(/\bdpl=[\w-]+/g, "dpl=<build>");
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * The observable features of a page, one per line: metadata first, then the
 * body's text and attributes in document order.
 *
 * Metadata is read from the whole document and kept out of the body walk: a
 * prerendered page (the baseline) streams its <title>/<meta>/<link> into
 * <body>, which React 19 hoists into <head>, while a dynamic page (this
 * branch, R-209) sends them in <head>. Same tags, different byte position.
 */
function features(html: string): string[] {
  const out: string[] = [];
  const title = /<title>([\s\S]*?)<\/title>/i.exec(html);
  out.push(`title: ${decode(title?.[1] ?? "")}`);

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /\b(?:name|property)="([^"]+)"/.exec(tag)?.[1];
    if (name && /^(description|og:|twitter:|robots)/.test(name)) {
      out.push(`meta ${name}: ${decode(/\bcontent="([^"]*)"/.exec(tag)?.[1] ?? "")}`);
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel="([^"]+)"/.exec(tag)?.[1];
    if (rel === "canonical" || rel === "alternate" || rel === "icon") {
      const lang = /\bhreflang="([^"]+)"/.exec(tag)?.[1] ?? "";
      out.push(`link ${rel} ${lang}: ${/\bhref="([^"]*)"/.exec(tag)?.[1] ?? ""}`);
    }
  }

  const body = (/<body\b[\s\S]*<\/body>/i.exec(html)?.[0] ?? html).replace(
    /<title>[\s\S]*?<\/title>/gi,
    "",
  );
  const tokens = body.match(/<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (/^<(link|meta)\b/i.test(token)) continue;
    if (token.startsWith("<")) {
      for (const attr of ["href", "src", "srcset", "alt", "poster", "aria-label"]) {
        const match = new RegExp(`\\s${attr}="([^"]*)"`).exec(token);
        if (match) out.push(`${attr}: ${decode(match[1])}`);
      }
    } else {
      const text = decode(token).replace(/\s+/g, " ").trim();
      if (text) out.push(`text: ${text}`);
    }
  }
  return out;
}

async function fetchPage(base: string, path: string): Promise<{ status: number; html: string }> {
  const response = await fetch(base + path, { redirect: "manual" });
  return { status: response.status, html: normalise(await response.text()) };
}

/** A minimal line diff: the first divergence plus a window of context. */
function diff(a: string[], b: string[]): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 2);
  const lines = [`  first difference at feature #${i} (main ${a.length}, branch ${b.length})`];
  for (let k = from; k < from + 12 && (k < a.length || k < b.length); k++) {
    if (a[k] === b[k]) lines.push(`    ${a[k]}`);
    else {
      if (k < a.length) lines.push(`  - ${a[k]}`);
      if (k < b.length) lines.push(`  + ${b[k]}`);
    }
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  let failures = 0;
  let compared = 0;
  for (const path of [...PAGES.id, ...PAGES.en]) {
    const [left, right] = await Promise.all([fetchPage(MAIN, path), fetchPage(BRANCH, path)]);
    const a = features(left.html);
    const b = applyIntendedChanges(path, features(right.html));
    compared++;
    const same = left.status === right.status && a.join("\n") === b.join("\n");
    console.log(
      `${same ? "OK  " : "DIFF"} ${path}  [${left.status}/${right.status}, ${a.length} features]`,
    );
    if (!same) {
      failures++;
      if (left.status !== right.status)
        console.log(`  status main ${left.status} ≠ branch ${right.status}`);
      console.log(diff(a, b));
    }
  }
  for (const change of INTENDED_CHANGES) {
    console.log(`intended change "${change.name}": ${intendedHits.get(change.name) ?? 0} hrefs`);
  }
  console.log(`\n${compared - failures}/${compared} pages identical`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
