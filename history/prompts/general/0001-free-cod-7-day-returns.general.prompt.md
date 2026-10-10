---
id: 0001
title: Free COD and 7-day returns
stage: general
date: 2026-10-10
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["cod", "pricing", "returns-policy", "copy", "constitution"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/config/shipping.config.ts
 - src/domain/shipping/provider.ts
 - src/domain/shipping/flat-zone-provider.ts
 - src/domain/shipping/client-quote.ts
 - src/domain/pricing/quote.ts
 - src/infrastructure/shipping/provider.ts
 - src/app/actions/checkout.ts
 - src/app/actions/lookup.ts
 - src/components/checkout/OrderSummary.tsx
 - src/components/checkout/CheckoutForm.tsx
 - src/components/lookup/LookupForm.tsx
 - src/components/home/PaymentDeliveryInfo.tsx
 - src/app/[locale]/kebijakan-pengembalian/page.tsx
 - src/messages/id.json
 - src/messages/en.json
 - prisma/schema.prisma
 - prisma/migrations/20261010090000_cod_fee_default_zero/migration.sql
 - prisma/seed.dev.ts
 - .specify/memory/constitution.md
 - docs/release-checklist.md
 - docs/redesign-plan.md
 - tests/unit/pricing.test.ts
 - tests/unit/cod-gating.test.ts
 - tests/unit/billable-weight.test.ts
 - tests/unit/config.test.ts
 - tests/integration/checkout.test.ts
 - tests/integration/amount-identity.test.ts
 - tests/integration/snapshot-immutability.test.ts
tests:
 - npm run verify (typecheck, lint, constitution, messages, media, 692 unit tests) — PASS
 - tests/integration/checkout.test.ts "charges a COD order exactly what an online order costs" — added, PASS
 - npm run test:integration — PASS 555/555 (after fixing id terms meta description length, 166 → 163)
 - npm run test:concurrency — PASS 5/5
 - prisma migrate deploy on tokoshopee and tokoshopee_test; migrate diff vs schema — no drift
---

## Prompt

First, analyze the entire project and identify all the places where these details are mentioned, then correct them wherever necessary.

Remove the COD fee completely and make Cash on Delivery (COD) free. Also, update the return policy to 7 days everywhere in the project.

## Response snapshot

Audited every COD-fee and return-window mention. User chose: remove the fee from config, domain,
quote, UI, copy and tests while keeping the `Order.codFeeIDR` column (new migration sets DEFAULT 0
so earlier orders still reconcile), and a PATCH constitution amendment to v2.0.1 (drop "COD fee"
from Principles III and XI). `quoteOrder` total is now subtotal + shipping; checkout no longer
writes codFeeIDR; lookup and order summary no longer show a COD fee line. Copy in id/en now says
COD is free (homepage, FAQ, trust row, footer, How to Order, Terms). Return window placeholder
replaced with 7 days in the Returns page, its meta description, FAQ and product trust link.

## Outcome

- ✅ Impact: COD orders cost the same as online orders; return window is 7 days in both languages.
- 🧪 Tests: verify green (692 unit), integration 555/555, concurrency 5/5. Follow-up session (Docker up) applied the migration, fixed the one metadata-length failure, and committed.
- 📁 Files: 28 files modified/added (see list above).
- 🔁 Next prompts: production deploy (needs owner approval; run `prisma migrate deploy` there first).
- 🧠 Reflection: the return window was never a number, only a PLACEHOLDER; COD fee touched the payment-integrity path, so the DB column was kept for reversibility.

## Evaluation notes (flywheel)

- Failure modes observed: a shell probe waited on stdin and had to be stopped; type errors in snapshot test caught by typecheck.
- Graders run and results (PASS/FAIL): npm run verify PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
