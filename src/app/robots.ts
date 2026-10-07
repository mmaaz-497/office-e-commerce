import type { MetadataRoute } from "next";
import { env } from "@/config";

/**
 * Blocks all crawling unless NEXT_PUBLIC_ALLOW_INDEXING="true" — the default
 * closed state means a staging deployment that forgets to set it stays out of
 * search results, rather than a production deployment leaking in (T134).
 * The admin area also carries its own per-page `robots: {index:false}`
 * (src/app/admin/layout.tsx), so this is defence in depth, not the only gate.
 */
export default function robots(): MetadataRoute.Robots {
  if (!env.NEXT_PUBLIC_ALLOW_INDEXING) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }

  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api"] },
    sitemap: new URL("/sitemap.xml", env.NEXT_PUBLIC_BASE_URL).toString(),
  };
}
