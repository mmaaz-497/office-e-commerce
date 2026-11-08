---
id: 0012
title: Free shipping on every order
stage: general
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["shipping", "checkout", "pricing", "cod", "copy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/config/shipping.config.ts
 - src/domain/shipping/flat-zone-provider.ts
 - src/domain/shipping/client-quote.ts
 - src/infrastructure/shipping/provider.ts
 - src/components/checkout/OrderSummary.tsx
 - src/components/lookup/LookupForm.tsx
 - src/messages/id.json
 - src/messages/en.json
 - docs/release-checklist.md
 - docs/redesign-plan.md
 - tests/unit/config.test.ts
 - tests/unit/free-shipping.test.ts
 - tests/integration/free-shipping-checkout.test.ts
tests:
 - tests/unit/free-shipping.test.ts (6, new)
 - tests/unit/config.test.ts (+1: freeShipping must be stated)
 - tests/integration/free-shipping-checkout.test.ts (4, new: COD and online, Jakarta and Sulawesi Selatan)
 - npm run verify (759 unit), test:integration (597), test:concurrency (6): all green
 - next build + next start -p 3001: homepage, Terms and footer show the free-shipping copy in id and en; old "calculated from the province" copy gone
---

## Prompt

I already told you that shipping is completely free, and I had configured the settings accordingly. However, shipping charges are still being added at checkout. Please fix this issue and ensure that Cash on Delivery (COD) is completely free, with no shipping charges applied anywhere on the website.

## Response snapshot

Cause: the earlier change (6d8ffed, PHR 0001) removed the COD fee only; shipping was still priced
per province from the placeholder zone rates (Rp 15,000–25,000 per kg) for COD and online alike.

Fix: a required `freeShipping: true` setting in `src/config/shipping.config.ts` (commercial rules live
in config, Constitution III). `FlatZoneShippingProvider` returns `shippingCost` 0 when it is set, and
both the server provider and the client preview pass it. Every order, COD or online, now costs the item
price only: that total is frozen on the order and sent to Midtrans. Province validation, COD
availability and billable weight are unchanged. Checkout summary and order lookup show "Gratis"/"Free"
for a Rp 0 shipping line; older orders keep their recorded cost. Copy in id and en updated: homepage
delivery fact, FAQ, footer, How to Order, Terms (body and meta), product and search meta. A unit test
fails if `freeShipping` is turned off without changing that copy. Release checklist and redesign plan
updated. No migration.

## Outcome

- ✅ Impact: no shipping charge on any order, COD or online; the site says shipping is free everywhere it mentioned shipping cost.
- 🧪 Tests: 11 new; all suites green; production build checked.
- 📁 Files: listed above.
- 🔁 Next prompts: the real COD-disabled province list (still a placeholder); restart the :3000 dev server; deploy.
- 🧠 Reflection: "COD free" was earlier read as "no COD fee"; free shipping is a separate rule, now explicit in config.

## Evaluation notes (flywheel)

- Failure modes observed: the earlier request was implemented narrowly (COD fee only), which the owner experienced as shipping still being charged.
- Graders run and results (PASS/FAIL): unit, integration, concurrency, build PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): a free-shipping badge in the buy box, if the owner wants it shown before checkout too.
