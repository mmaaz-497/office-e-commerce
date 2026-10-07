/**
 * `next dev` with the routes pre-compiled.
 *
 * Turbopack compiles a route the first time it is requested, and the first
 * route requested in a session also pays for the shared module graph — React,
 * next-intl, the locale layout, the fonts, every shared chunk. Measured on
 * this project, that one-time cost is ~7s and it lands on whichever page the
 * developer happens to open first:
 *
 *   cold server, /cara-pemesanan requested first -> compiled in 7.3s
 *   then /                       requested second -> compiled in 1.3s
 *
 *   cold server, /              requested first -> compiled in 9.7s
 *   then /produk/[slug]         requested second -> compiled in 1.7s
 *
 * The cost is not the page's complexity, so it cannot be optimised away by
 * making a page simpler. What it can be is *moved*: this wrapper waits for the
 * dev server to come up and then requests each route itself, so compilation
 * happens while the developer is still switching to the browser rather than
 * while they are waiting on a navigation.
 *
 * The routes come from the i18n manifest, so a page added there is warmed
 * without touching this file.
 *
 * Set NO_WARM=1 to run a plain `next dev`.
 */
import { spawn } from "node:child_process";
import catalogue from "../src/data/product.json" with { type: "json" };
import type { Product } from "../src/data/product-types";
import { pathnames, routing } from "../src/i18n/routing";
import { localeHref } from "../src/i18n/pathnames";
import type { InternalPathname } from "../src/i18n/routing";

/** Dynamic routes needing a real record we cannot invent; not warmable. */
const SKIP: ReadonlySet<InternalPathname> = new Set(["/pesanan/[orderNumber]"]);

const featured = (catalogue as Product[])[0];

function warmupPaths(): string[] {
  const urls: string[] = [];

  for (const locale of routing.locales) {
    for (const internal of Object.keys(pathnames) as InternalPathname[]) {
      if (SKIP.has(internal)) continue;
      // The only dynamic route left is the product page, and the catalogue
      // already says which slugs exist.
      const params: Record<string, string> =
        internal === "/produk/[slug]" ? { slug: featured.slug } : {};
      urls.push(localeHref(internal, locale, params));
    }
  }

  // The first request pays the shared-graph cost, so start with the page a
  // developer is most likely to open.
  urls.sort((a, b) => a.length - b.length);
  return urls;
}

/** Resolves once the server answers, or rejects after the timeout. */
async function waitForServer(origin: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // redirect: "manual" — "/" answers with next-intl's redirect to "/id",
      // which is all this probe needs to know the server is up. Following it
      // would compile the locale root inside a 2s timeout that a cold compile
      // always exceeds, so the probe aborted and retried, piling concurrent
      // compiles of /id onto each other until one read a half-written
      // manifest ("SyntaxError: Unexpected end of JSON input", a 500).
      await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Dev server did not respond at ${origin} within ${timeoutMs}ms`);
}

async function warm(origin: string): Promise<void> {
  const paths = warmupPaths();
  const started = Date.now();

  // Sequential, not parallel. Turbopack compiles one route at a time anyway,
  // and firing twelve requests at once only makes each one's timing useless
  // for the log line below.
  for (const path of paths) {
    const at = Date.now();
    try {
      await fetch(origin + path, { signal: AbortSignal.timeout(180_000) });
      const ms = Date.now() - at;
      // Only report the slow ones; a list of twelve sub-second lines is noise.
      if (ms > 1_500) {
        console.log(`   warmed ${path} (${(ms / 1000).toFixed(1)}s)`);
      }
    } catch {
      // A route that fails to warm is not a reason to stop: it will simply
      // compile on demand as it did before, and the dev server is unaffected.
    }
  }

  console.log(
    `\n   ✓ Pre-compiled ${paths.length} routes in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `navigation should now be warm.\n`,
  );
}

/**
 * Webpack, not Turbopack, for `next dev` — measured on this machine, where the
 * project lives on a USB-attached 5400rpm HDD (E:). Warm Turbopack dev added a
 * flat ~0.9s to *every* request, including a 404 for a missing static file,
 * and that cost tracked the disk: the same blank Next app rendered in 0.55s
 * from the internal SSD and 1.0s from E:. Warm webpack dev on the same disk:
 *
 *   page navigation   turbopack 0.7–1.1s   webpack 0.14–0.31s
 *   language switch   turbopack 0.75–1.0s  webpack 0.22–0.36s
 *
 * `next build` stays on Turbopack; this only changes the dev server. On an SSD
 * the gap may close — `npm run dev:turbo` runs the old command for comparison.
 */
const useTurbopack = process.argv.includes("--turbo");
const nextArgs = process.argv.slice(2).filter((arg) => arg !== "--turbo");

function main(): void {
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", ...(useTurbopack ? ["--turbopack"] : []), ...nextArgs],
    { stdio: ["inherit", "pipe", "inherit"], shell: process.platform === "win32" },
  );

  let origin: string | null = null;
  let warming = false;

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    process.stdout.write(text);

    // Next prints "- Local: http://localhost:3000"; the port is not
    // necessarily 3000, because it moves on when the port is taken.
    const match = text.match(/https?:\/\/localhost:(\d+)/);
    if (match) origin = `http://localhost:${match[1]}`;

    // Wait for "✓ Ready" before touching the server. Requesting a page while
    // it is still starting races the manifest writes and logs a spurious
    // "Unexpected end of JSON input" against whichever route was unlucky.
    if (warming || !origin || !/Ready in/.test(text)) return;
    if (process.env.NO_WARM === "1") return;

    warming = true;
    void waitForServer(origin)
      .then(() => warm(origin!))
      .catch((error: unknown) => {
        console.warn(`   (warmup skipped: ${error instanceof Error ? error.message : error})`);
      });
  });

  const stop = () => child.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
