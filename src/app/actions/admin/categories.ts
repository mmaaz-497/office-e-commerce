"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/infrastructure/db/prisma";
import { requireAdminSession } from "@/infrastructure/auth/session";
import { toFieldErrors, type FieldError } from "@/components/admin/catalogue/form-errors";
import { saveCategoryInputSchema } from "./schemas";
import { toErrorResult } from "./result";

export type SaveCategoryResult =
  | { ok: true; categoryId: string }
  | { ok: false; errorKey: string; fieldErrors?: Record<string, FieldError[]> };

/**
 * Creates or edits a category (spec US6, contracts/admin-catalogue-actions.md
 * saveCategory). There is no delete: a category with products keeps them, and
 * an unused one costs nothing (FR-005).
 */
export async function saveCategory(rawInput: unknown): Promise<SaveCategoryResult> {
  try {
    await requireAdminSession();
  } catch (err) {
    return toErrorResult(err);
  }

  const parsed = saveCategoryInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: "errors.validation",
      fieldErrors: toFieldErrors(parsed.error.issues),
    };
  }
  const { categoryId, ...data } = parsed.data;

  try {
    const saved =
      categoryId === undefined
        ? await prisma.category.create({ data, select: { id: true } })
        : await prisma.category.update({ where: { id: categoryId }, data, select: { id: true } });
    revalidatePath("/admin/categories");
    return { ok: true, categoryId: saved.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return {
          ok: false,
          errorKey: "errors.validation",
          fieldErrors: { slug: [{ key: "slugTaken" }] },
        };
      }
      // The category edited from a stale page no longer exists.
      if (err.code === "P2025") return { ok: false, errorKey: "errors.validation" };
    }
    return toErrorResult(err);
  }
}
