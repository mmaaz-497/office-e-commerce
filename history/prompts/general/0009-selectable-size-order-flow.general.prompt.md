---
id: 0009
title: Selectable size through the order flow
stage: general
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["sizes", "checkout", "orders", "admin", "migration", "catalogue"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - prisma/schema.prisma
 - prisma/migrations/20261108090000_product_sizes_order_size/migration.sql
 - src/domain/catalogue/sizes.ts
 - src/domain/catalogue/product-schema.ts
 - src/app/actions/checkout.ts
 - src/app/actions/schemas.ts
 - src/app/actions/lookup.ts
 - src/app/actions/admin/products.ts
 - src/infrastructure/db/catalogue.ts
 - src/infrastructure/db/admin-orders.ts
 - src/components/product/SizeSelector.tsx
 - src/components/product/PurchasePanel.tsx
 - src/components/product/StickyBuyBar.tsx
 - src/components/product/BuyBox.tsx
 - src/components/product/checkout-href.ts
 - src/app/[locale]/checkout/page.tsx
 - src/components/checkout/CheckoutForm.tsx
 - src/components/checkout/OrderSummary.tsx
 - src/components/lookup/LookupForm.tsx
 - src/app/admin/orders/[orderNumber]/page.tsx
 - src/app/admin/orders/page.tsx
 - src/app/admin/products/[id]/page.tsx
 - src/app/admin/products/new/page.tsx
 - src/components/admin/catalogue/ProductForm.tsx
 - src/components/admin/catalogue/form-errors.ts
 - src/messages/id.json
 - src/messages/en.json
 - tests/integration/helpers/db.ts
 - tests/integration/helpers/admin-product-input.ts
tests:
 - tests/unit/product-sizes.test.ts (10, new)
 - tests/unit/checkout-href-size.test.ts (2, new)
 - tests/unit/form-errors-at.test.ts (3, new)
 - tests/integration/checkout-sizes.test.ts (10, new)
 - npm run verify (743 unit), test:integration (582), test:concurrency (5): all green
 - next build + next start -p 3001: curl of every touched page, server actions via curl, CDP screenshots at 375 and 1440
---

## Prompt

You have only displayed the sizes. The user must be able to select their preferred size, and the selected size must be carried forward to the checkout page and the admin panel. Wherever the order details appear, the selected size must be displayed and preserved so that the correct size is delivered to the customer.

## Response snapshot

Two test-gated sub-phases, each committed.

A (2d614c0): `Product.sizes String[] @default([])` and `Order.size String?` (additive migration).
`src/domain/catalogue/sizes.ts` holds the rules (`resolveSizeChoice`, `preselectedSize`, list
parse/format). `productInputSchema` validates sizes (pattern, length, at most 20, no duplicates). `submitCheckout`
requires one of the product's sizes when it offers any (`errors.sizeRequired` /
`errors.sizeUnavailable`) before stock, order or Snap session, and freezes it on the order. The lookup
and the admin order list/detail return it. On update, a save that omits `sizes` keeps the stored list.
Copy that said no size choice was needed (benefit card, FAQ, how-to-order step 1) was corrected.

B (f929ddf): `SizeSelector` option cards (no preselection). With sizes on offer, both buy buttons block and
focus the picker until a size is chosen. `?size=` is carried to checkout and kept only if offered.
The checkout picker and summary line, the lookup row, the admin detail row and list column, and the
admin "Available sizes" field were added. Stock stays per product. Manual verification found and fixed a crash in the
admin form's error lookup (now a tested pure function) and a selected-chip background lost to
utility order.

Dev DB: slippers-gemoy sizes set to 36, 38, 40, 42; the display-only highlight and spec row from
0008 were removed; the verification order was deleted.

## Outcome

- ✅ Impact: size chosen on the product page reaches checkout, the order row, the customer lookup and the admin order screens; the server refuses orders without a valid size.
- 🧪 Tests: 25 new tests; full unit, integration and concurrency suites green.
- 📁 Files: listed above; one migration.
- 🔁 Next prompts: production deploy (migrate, then set sizes in the admin editor); decide on the "All size untuk semua" highlight and "All Size" SEO titles; per-size stock if needed.
- 🧠 Reflection: the order confirmation page deliberately shows no product details (reachable by order number alone), so the size is shown in the phone-checked lookup instead.

## Evaluation notes (flywheel)

- Failure modes observed: the previous turn delivered display-only sizes. Also, no test renders ProductForm, so its crash was caught only by manual verification.
- Graders run and results (PASS/FAIL): unit/integration/concurrency PASS; build PASS; manual curl/CDP PASS after two fixes.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): a render test for ProductForm.
