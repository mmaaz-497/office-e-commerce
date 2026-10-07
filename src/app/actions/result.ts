import { DomainError } from "@/domain/errors";

/** Shared by every server action's catch block — a DomainError becomes a
 * translation-keyed result; anything else is a real bug and must not be
 * swallowed into a generic error message. */
export function toErrorResult(err: unknown): { ok: false; errorKey: string } {
  if (err instanceof DomainError) {
    return { ok: false, errorKey: err.messageKey };
  }
  throw err;
}
