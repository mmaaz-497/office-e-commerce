/**
 * Next.js calls register() once, before the server accepts any traffic.
 * Importing src/config here is what turns a malformed rate table or a
 * missing secret into a startup crash instead of a customer-facing failure
 * at checkout (R-012).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./config");
  }
}
