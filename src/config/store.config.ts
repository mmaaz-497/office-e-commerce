import { z } from "zod";

/**
 * The store's public contact address — the one place it is written. Every
 * page that tells a customer how to reach the store (help, terms, privacy,
 * returns, footer) renders it from here through ContactEmailLink, so changing
 * it is a one-line edit. Pure static data with no process.env access, so it
 * can be imported directly without pulling in the env validation in index.ts.
 * Validated at module load: a typo fails the build, not a customer's email.
 */
export const STORE_CONTACT_EMAIL = z.email().parse("blooginga@gmail.com");
