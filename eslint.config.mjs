import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // .next-dev is `next dev`'s build directory (see distDir in
    // next.config.ts); it holds generated output, same as .next.
    ignores: ["node_modules/**", ".next/**", ".next-dev/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    // src/domain must stay framework-agnostic — no Next.js, no Prisma client.
    // ADR-0001; Constitution Principle X. This is the architectural boundary
    // enforced mechanically rather than by convention.
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "src/domain must not import Next.js. Keep the domain layer framework-agnostic (ADR-0001).",
            },
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "src/domain must not import @prisma/client. Persistence belongs in src/infrastructure (ADR-0001).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
