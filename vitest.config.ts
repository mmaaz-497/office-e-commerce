import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // next has no "exports" map, so a bare `next/server` from a dependency's
      // ESM build (next-intl/middleware) hits Node's extensionless-import
      // rule and fails to resolve under Vitest. Next itself resolves it
      // through its own bundler, so this alias is a test-runner concern only.
      "next/server": path.resolve(import.meta.dirname, "./node_modules/next/server.js"),
    },
  },
  // tsconfig keeps "jsx": "preserve" for Next's own compiler, which Vite would
  // honour and leave JSX untransformed. Tests that render a server component
  // (catalogue-read: Header/Footer) need it compiled, as React's runtime does.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    server: {
      deps: {
        // Without this, next-intl stays externalised and Node resolves its
        // bare `next/server` import itself — which fails, because `next` ships
        // no "exports" map and ESM will not guess the .js extension. Inlining
        // hands the import to Vite, where the alias above applies.
        inline: ["next-intl"],
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          // Every file shares one live database and resets it in
          // beforeEach/afterEach — running files in parallel lets one
          // file's reset wipe another file's freshly-seeded row mid-test.
          fileParallelism: false,
          // Real PostgreSQL in Docker, not mocks — a mocked conditional update
          // proves nothing about whether the real WHERE quantity >= n holds
          // under real concurrency (research.md R-015; SC-003).
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "concurrency",
          include: ["tests/concurrency/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
