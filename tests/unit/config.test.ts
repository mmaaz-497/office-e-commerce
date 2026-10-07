import { describe, expect, it } from "vitest";
import { envSchema } from "@/config/env";
import { shippingConfigSchema } from "@/config/shipping.config";

const VALID_ENV = {
  DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/tokoshopee",
  NEXT_PUBLIC_BASE_URL: "https://tokoshopee.com",
  MIDTRANS_SERVER_KEY: "SB-Mid-server-xxx",
  MIDTRANS_CLIENT_KEY: "SB-Mid-client-xxx",
  MIDTRANS_IS_PRODUCTION: "false",
  ADMIN_USERNAME: "owner",
  ADMIN_PASSWORD_HASH: "$2b$12$abcdefghijklmnopqrstuv",
  SESSION_SECRET: "a".repeat(32),
  JOB_SECRET: "b".repeat(32),
  UPLOAD_DIR: "/var/lib/tokoshopee/uploads",
};

const VALID_SHIPPING = {
  pairsPerKg: 2,
  codFeeIDR: 5000,
  zones: { "31": { rateIDR: 15000 }, "94": { rateIDR: 25000 } },
  codDisabledProvinces: ["94"],
};

describe("envSchema", () => {
  it("accepts a fully-populated valid environment", () => {
    expect(envSchema.safeParse(VALID_ENV).success).toBe(true);
  });

  it("rejects a missing required env var", () => {
    const withoutSecret: Record<string, string> = { ...VALID_ENV };
    delete withoutSecret.SESSION_SECRET;
    const result = envSchema.safeParse(withoutSecret);
    expect(result.success).toBe(false);
  });

  it("rejects MIDTRANS_IS_PRODUCTION values other than exactly 'true' or 'false'", () => {
    const result = envSchema.safeParse({ ...VALID_ENV, MIDTRANS_IS_PRODUCTION: "yes" });
    expect(result.success).toBe(false);
  });

  it("defaults NEXT_PUBLIC_ALLOW_INDEXING to false when unset", () => {
    const result = envSchema.safeParse(VALID_ENV);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_ALLOW_INDEXING).toBe(false);
    }
  });

  it("rejects NEXT_PUBLIC_ALLOW_INDEXING values other than exactly 'true' or 'false'", () => {
    const result = envSchema.safeParse({ ...VALID_ENV, NEXT_PUBLIC_ALLOW_INDEXING: "yes" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing UPLOAD_DIR", () => {
    const withoutUploadDir: Record<string, string> = { ...VALID_ENV };
    delete withoutUploadDir.UPLOAD_DIR;
    expect(envSchema.safeParse(withoutUploadDir).success).toBe(false);
  });

  it("rejects a relative UPLOAD_DIR", () => {
    expect(envSchema.safeParse({ ...VALID_ENV, UPLOAD_DIR: "uploads" }).success).toBe(false);
  });

  it("accepts an absolute UPLOAD_DIR", () => {
    const result = envSchema.safeParse({ ...VALID_ENV, UPLOAD_DIR: "/srv/uploads" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.UPLOAD_DIR).toBe("/srv/uploads");
  });
});

describe("shippingConfigSchema", () => {
  it("accepts a valid shipping config", () => {
    expect(shippingConfigSchema.safeParse(VALID_SHIPPING).success).toBe(true);
  });

  it("rejects a float money value", () => {
    const result = shippingConfigSchema.safeParse({
      ...VALID_SHIPPING,
      codFeeIDR: 5000.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a float zone rate", () => {
    const result = shippingConfigSchema.safeParse({
      ...VALID_SHIPPING,
      zones: { "31": { rateIDR: 15000.99 } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a COD-disabled province absent from zones", () => {
    const result = shippingConfigSchema.safeParse({
      ...VALID_SHIPPING,
      codDisabledProvinces: ["99"], // not present in `zones`
    });
    expect(result.success).toBe(false);
  });
});
