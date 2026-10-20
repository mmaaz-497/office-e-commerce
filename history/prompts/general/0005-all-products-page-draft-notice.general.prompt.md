---
id: 0005
title: All products page and draft notice
stage: general
date: 2026-10-20
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["storefront", "catalogue", "admin", "diagnosis", "seo"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/domain/catalogue/product-listing.ts
 - src/domain/catalogue/publish-requirements.ts
 - src/app/[locale]/produk/(list)/page.tsx
 - src/app/[locale]/produk/(list)/loading.tsx
 - src/app/[locale]/(home)/page.tsx
 - src/app/admin/products/[id]/page.tsx
 - src/components/layout/Header.tsx
 - src/components/layout/HeaderBar.tsx
 - src/i18n/routing.ts
 - src/infrastructure/db/catalogue.ts
 - src/messages/id.json
 - src/messages/en.json
 - tests/unit/product-listing.test.ts
 - tests/unit/publish-requirements.test.ts
 - tests/integration/all-products.test.ts
 - tests/integration/metadata.test.ts
 - tests/integration/locale-routing.test.ts
tests:
 - tests/unit/product-listing.test.ts
 - tests/unit/publish-requirements.test.ts
 - tests/integration/all-products.test.ts
 - tests/integration/metadata.test.ts
 - tests/integration/locale-routing.test.ts
 - tests/integration/sitemap.test.ts
---

## Prompt

A product I created from the admin dashboard does not appear on the homepage, and there is no page that lists all products.

1. Diagnose first, without changing code: for every product in the dev database, report its status, isSample, category, price, image count, stock, and whether the id and en content are complete. Then explain exactly why each one is or isn't shown on the homepage (hero, featured grid with its 2-ACTIVE minimum, Segera Hadir row), on its category page and at /produk/[slug].
2. If a product meets every rule and still doesn't show, find the root cause and fix it with a test.
3. Add an all-products page: /produk (id) and /en/products. It lists every ACTIVE and COMING_SOON product in the ProductGrid, with sort (newest, price low to high, price high to low), pagination, an empty state, metadata in both languages and a sitemap entry. Link it from the header ("Semua Produk" / "All Products") and from the featured grid's "Lihat semua" link. DRAFT products never appear.
4. In the admin edit page, when a product is DRAFT, show a clear notice: "This product is not visible in the store. Publish it to show it to shoppers." List which publishing requirements are still missing.
Keep all suites and the build green. Commit the fix (if any), the new page and the admin notice separately.

## Response snapshot

Diagnosis: 12 products. The admin-created `pangoin` is ACTIVE, price 1000, 1 image, stock 5, id/en complete.
The featured product (hero and full detail) is `slippers-gemoy`, which comes first on sale by position. The
"more on sale" grid counts the ACTIVE products other than the featured one and needs 2 of them; with only
pangoin it has 1, so the grid is hidden. That is the documented rule (R-708, pinned by home-thresholds.test.ts),
not a bug. Pangoin does show on /kategori/sandal and at /produk/pangoin. The 10 samples fill the Segera hadir row.
No fix commit was needed.

Added /id/produk and /en/products (pure sort/paginate rules in src/domain, 24 per page; the price sorts rank only
products on sale). The route is in the manifest, so it gets a sitemap entry and is covered by the metadata
tests. It is linked from the header row and drawer and from the featured grid. A page past the last shows the
last page, because the route streams behind loading.tsx and a 404 there would only be a soft 404. Added the
DRAFT notice on the admin edit page; its checklist comes from productInputSchema run with ACTIVE plus the
stock-row rule.

## Outcome

- ✅ Impact: products can be browsed in one place; DRAFT products explain why they are hidden
- 🧪 Tests: unit 727, integration 572, concurrency 5 passing; build green
- 📁 Files: 2 domain modules, 1 page + skeleton, header, homepage, admin edit page, messages, 3 new/2 updated tests
- 🔁 Next prompts: consider whether the featured grid minimum should count the featured product
- 🧠 Reflection: a loading.tsx makes notFound() a soft 404; layouts cannot see searchParams

## Evaluation notes (flywheel)

- Failure modes observed: notFound() under a streamed Suspense boundary returned 200 even for bot user agents
- Graders run and results (PASS/FAIL): verify PASS, integration PASS, concurrency PASS, build PASS
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
