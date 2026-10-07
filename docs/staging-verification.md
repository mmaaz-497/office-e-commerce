# Staging Verification of the Release Checklist (T134)

**Satisfies**: FR-011a; plan.md Risks.

## Status: not yet performed

No staging host exists yet — there is no VPS provisioned at all (see
`docs/postgres-network-verification.md` and `docs/restore-drill.md`, which record the same gap
for their respective checks). This document records that gap honestly rather than a fabricated
walkthrough, and is the template to fill in once a staging host exists — before this can be
called a verified pass, every row below needs a real result, not an assumption.

## What was verified in code instead

Two of `docs/release-checklist.md`'s items have a testable behaviour even without a live host,
and that behaviour was verified directly against the source:

- **`robots.txt` blocks indexing on staging, allows it in production.** `src/app/robots.ts`
  reads `env.NEXT_PUBLIC_ALLOW_INDEXING`, which `src/config/env.ts` defaults to `false` when the
  variable is unset (`tests/unit/config.test.ts` asserts this default). A staging deployment
  that never sets the variable therefore blocks all crawling by construction, not by an operator
  remembering to configure it — only a production deployment that explicitly sets
  `NEXT_PUBLIC_ALLOW_INDEXING="true"` allows indexing. This is a code-level guarantee, but "the
  code defaults closed" is not the same claim as "a real staging deployment was observed
  returning `Disallow: /`" — the latter still needs to happen for real, once a staging host
  exists.
- **Metadata coverage (SC-011).** `tests/integration/metadata.test.ts` (T124) already asserts
  title/description length and canonical/hreflang resolution for every route in both locales —
  this is the "any item that could not be verified is recorded with the reason" spirit applied
  the other way around: it's an item that *can* be verified without a host, so it was, rather
  than deferred to the staging walkthrough.

## Walkthrough log

Every other row in `docs/release-checklist.md` needs a real staging host to walk. Record the
result and, for anything not verifiable even there (e.g. a production-only credential that
must never touch staging), the reason — per the AC, an unverifiable item recorded with its
reason is acceptable; a silently skipped one is not.

| Checklist item | Verified? | Result / reason if not verified |
|---|---|---|
| `grep PLACEHOLDER` returns nothing | Not yet | No staging host provisioned |
| Opening stock set | Not yet | No staging host provisioned |
| Sold-count baseline set | Not yet | No staging host provisioned |
| `MIDTRANS_IS_PRODUCTION` + keys | Not yet | Staging should stay on sandbox keys by design — this item is production-only and will never show "verified" on staging; that is correct, not a gap |
| Midtrans notification URL | Not yet | Same as above — staging points at its own sandbox webhook |
| `ADMIN_PASSWORD_HASH` regenerated | Not yet | No staging host provisioned |
| `SESSION_SECRET` / `JOB_SECRET` regenerated | Not yet | No staging host provisioned |
| No demo data in the database | Not yet | No staging host provisioned |
| `npm run check:messages` passes | Verified (locally) | Passes in this repository; re-run on the staging build as part of `npm run build`'s `prebuild` hook |
| Test suite passes, incl. metadata + snapshot-immutability | Verified (locally, unit + this session's integration run) | Concurrency/full integration suite needs the staging database; re-run there |
| PostgreSQL unreachable publicly | Not yet | No staging host provisioned — see `docs/postgres-network-verification.md` |
| HTTPS + HSTS | Not yet | No staging host provisioned |
| `robots.txt` blocks staging / allows production | Verified in code (see above) | Live staging observation still pending |
| Backup restored once | Not yet | See `docs/restore-drill.md` |
| Cron entries installed | Not yet | No staging host provisioned |

## Sign-off

Not signed off. This checklist may not be marked complete on `docs/release-checklist.md` until
every "Not yet" row above has a real result.
