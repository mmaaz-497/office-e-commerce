import { envSchema } from "./env";
import { rawShippingConfig, shippingConfigSchema } from "./shipping.config";

/**
 * Parsed and validated at module load, not lazily on first use — a malformed
 * rate table or missing secret must fail the process at boot, not at a
 * customer's checkout (R-012). Imported from src/instrumentation.ts so the
 * import itself is what triggers the throw before the server accepts traffic.
 */

function loadEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${result.error.message}`);
  }
  return result.data;
}

function loadShippingConfig() {
  const result = shippingConfigSchema.safeParse(rawShippingConfig);
  if (!result.success) {
    throw new Error(`Invalid shipping configuration:\n${result.error.message}`);
  }
  return result.data;
}

export const env = loadEnv();
export const shippingConfig = loadShippingConfig();

export type { EnvConfig as Env } from "./env";
export type { ShippingConfig } from "./shipping.config";
