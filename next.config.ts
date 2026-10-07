import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * `next dev` and `next build` must not share a build directory.
 *
 * They write incompatible artifacts to the same `.next`, so running a build
 * while a dev server is up leaves that server serving a production manifest it
 * cannot resolve — the symptom is a 500 with "Could not find the module ... in
 * the React Client Manifest", which reads like an application bug and is not
 * one. Recovering means deleting `.next` and paying the full cold-compile cost
 * again (measured at ~13s for the homepage route).
 *
 * Giving dev its own directory makes the two independent: a build no longer
 * invalidates the dev server's compiled route cache, so an interleaved
 * `npm run build` costs nothing in dev responsiveness.
 */
const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  // PM2 runs .next/standalone/server.js in production (research.md R-017,
  // ecosystem.config.js). On Windows, `next build`'s trace-copy step symlinks
  // node_modules and needs Developer Mode or an elevated shell — a
  // build-time-only concern on the dev machine, not a production one: the
  // target VPS is Linux, where this needs no special privilege.
  output: "standalone",

  distDir: isDev ? ".next-dev" : ".next",

  /**
   * How long a compiled route is kept before the dev server discards it.
   *
   * The default is 60 seconds and a 5-route buffer, which on a 10-route
   * storefront means a page read for a couple of minutes, or simply the sixth
   * page visited, is evicted and pays its compile cost again on the next
   * navigation. That turns a one-time startup cost into a recurring one.
   * Ignored entirely by `next build`.
   */
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 25,
  },

  images: {
    // Next 15 warns on every optimized-image request whose `q` is not listed
    // here, and Next 16 makes the list mandatory. 80 is the only quality the
    // catalogue's consumers ask for (hero, gallery, showcase, product page).
    qualities: [80],

    // The storefront renders images at four places, none of which needs the
    // full default ladder of eight device widths: the hero is capped at
    // 1120px by HERO_DESKTOP_SIZES, the showcase card at 420px, the gallery
    // strip at 320px and the product gallery at 560px. Every extra width in
    // this list is one more sharp encode the first visitor waits on, and one
    // more entry to hold in the image cache, for a resolution nothing asks
    // for. Trimmed to the widths the `sizes` attributes actually resolve to,
    // plus their 2x retina counterparts.
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [320, 420, 560],
  },
};

export default withNextIntl(nextConfig);
