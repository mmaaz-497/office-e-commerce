"use server";

import { prisma } from "@/infrastructure/db/prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { getLegacyProductId } from "@/infrastructure/db/catalogue";
import { setSoldCountBaselineInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type SetSoldCountBaselineResult = { ok: true } | { ok: false; errorKey: string };

/** FR-063: a non-negative integer, validated server-side regardless of what
 * the form allowed through. The baseline lives on the product (003 spec
 * Assumptions); until the 2b per-product admin this screen edits the legacy
 * product's, and the SOLD_COUNT_BASELINE setting is no longer written. */
export async function setSoldCountBaseline(rawInput: unknown): Promise<SetSoldCountBaselineResult> {
  await requireAdminSession();
  const parsed = setSoldCountBaselineInputSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, errorKey: "errors.validation" };

  try {
    const legacyProductId = await getLegacyProductId();
    if (!legacyProductId) {
      console.error("Cannot set the sold-count baseline: catalogue not imported.");
      return { ok: false, errorKey: "errors.validation" };
    }
    await prisma.product.update({
      where: { id: legacyProductId },
      data: { soldCountBaseline: parsed.data.baseline },
    });
    return { ok: true };
  } catch (err) {
    return toErrorResult(err);
  }
}
