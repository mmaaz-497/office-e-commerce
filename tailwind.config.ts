import type { Config } from "tailwindcss";

/**
 * Brand tokens live as CSS custom properties in src/app/globals.css (Tailwind v4
 * CSS-first config). This file mirrors the same names for editor/plugin tooling
 * that still reads a JS config. No Shopee orange (#EE4D2D) or Shopee-derived hue
 * appears anywhere in this palette.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FDF8F0",
          dark: "#F5EBDD",
        },
        brown: {
          light: "#A9764F",
          DEFAULT: "#7A4B32",
          dark: "#4A2E1E",
        },
        accent: {
          DEFAULT: "#C98A3E",
        },
        shell: "#FFFDF9",
        sand: "#F0E2CD",
        ink: "#2E1B10",
        gold: "#E0A758",
        line: "#E6D6C0",
      },
    },
  },
};

export default config;
