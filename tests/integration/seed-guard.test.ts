import { describe, expect, it } from "vitest";
import { assertSeedAllowed } from "@/infrastructure/db/seed-guard";

const LOCAL_URL = "postgresql://tokoshopee:pw@127.0.0.1:5432/tokoshopee";
const PRODUCTION_SHAPED_URL = "postgresql://user:pw@tokoshopee.com:5432/tokoshopee";

describe("assertSeedAllowed (dev seed guard)", () => {
  it("allows a local DATABASE_URL with NODE_ENV unset", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: LOCAL_URL })).not.toThrow();
  });

  it("throws under NODE_ENV=production, even against a local DATABASE_URL", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: LOCAL_URL })).toThrow(
      /NODE_ENV=production/,
    );
  });

  it("throws under a production-shaped DATABASE_URL with NODE_ENV unset", () => {
    expect(() => assertSeedAllowed({ DATABASE_URL: PRODUCTION_SHAPED_URL })).toThrow(
      /not a recognised local database/,
    );
  });

  it("throws when DATABASE_URL is missing entirely", () => {
    expect(() => assertSeedAllowed({})).toThrow(/DATABASE_URL is not set/);
  });

  it("the two conditions are independently sufficient — NODE_ENV alone is enough", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", DATABASE_URL: PRODUCTION_SHAPED_URL }),
    ).toThrow(/NODE_ENV=production/); // the NODE_ENV check fires first either way
  });

  it("the two conditions are independently sufficient — a bad host alone is enough with NODE_ENV=development", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: PRODUCTION_SHAPED_URL }),
    ).toThrow(/not a recognised local database/);
  });
});
