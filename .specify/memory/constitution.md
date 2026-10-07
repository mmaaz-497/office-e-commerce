<!--
SYNC IMPACT REPORT (v2.0.0)
===========================
Version change: 1.0.0 → 2.0.0
Bump rationale: MAJOR — Principle III is redefined in a backward-incompatible way: product
catalog data moves from a developer-edited repository file into PostgreSQL, managed from the
admin area. Approved by the project owner on 2026-10-03 (redesign Phase 2a).

Modified principles:
- I. Indonesian-First, Translation-Only Copy — interface strings stay in translation files;
  product catalog content is data, stored in both `id` and `en`, and both are required before
  a product becomes ACTIVE.
- III. Single Source of Truth per Data Class — catalog data lives in PostgreSQL; a repository
  file may only be an import source, never read by the running storefront; stock is not a
  catalog field.
- VII. Honest Content — adds the approved, bounded exception for `isSample` COMING_SOON products.
- X. Future-Ready Without Over-Building — the storefront may list multiple products; one product
  per order; a multi-item cart stays out of scope.

Unchanged: II, IV, V (NON-NEGOTIABLE), VI (NON-NEGOTIABLE), VIII, IX, XI; Technology &
Deployment Constraints; Development Workflow & Quality Gates; Governance.

Added sections: none (Scope Boundary gains one clarifying note).
Removed sections: none.

Templates requiring updates:
- ✅ .specify/templates/* — no template quotes the changed wording; no edit required.
- ✅ CLAUDE.md "Active Technologies → Data" updated by specs/003-catalogue-database/plan.md.

Follow-ups:
- ADR-0004 (history/adr/0004-catalogue-in-database.md) records the decision.
- Exact amendment text: specs/003-catalogue-database/contracts/constitution-amendment.md.
-->

<!--
SYNC IMPACT REPORT
==================
Version change: none (template placeholders) → 1.0.0
Bump rationale: Initial ratification. The template contained only placeholder tokens;
this is the first concrete constitution, so MAJOR baseline 1.0.0 applies.

Modified principles (placeholder → concrete):
- [PRINCIPLE_1_NAME] → I. Indonesian-First, Translation-Only Copy
- [PRINCIPLE_2_NAME] → II. Mobile-First, Brand-Distinct UI
- [PRINCIPLE_3_NAME] → III. Single Source of Truth per Data Class
- [PRINCIPLE_4_NAME] → IV. Money Is Integer IDR
- [PRINCIPLE_5_NAME] → V. Payment Integrity (NON-NEGOTIABLE)
- [PRINCIPLE_6_NAME] → VI. Stock Integrity (NON-NEGOTIABLE)
- [PRINCIPLE__DESCRIPTION] → removed (duplicate placeholder slot)

Added sections:
- Principles VII–XI (Honest Content, SEO by Default, Security Baseline,
  Future-Ready Without Over-Building, Quality & Test Discipline)
- Technology & Deployment Constraints (was [SECTION_2_NAME])
- Development Workflow & Quality Gates (was [SECTION_3_NAME])
- Scope Boundary subsection listing explicit non-goals

Removed sections: none

Templates requiring updates:
- ✅ .specify/templates/plan-template.md — "Constitution Check" gate now resolvable
  against concrete principles; no edit required (it defers to this file by design).
- ✅ .specify/templates/spec-template.md — no constitution-coupled placeholders found.
- ✅ .specify/templates/tasks-template.md — task categories (Setup, Foundational,
  per-story, Polish/Security) already accommodate principle-driven tasks.
- ✅ .specify/templates/checklist-template.md, adr-template.md,
  phr-template.prompt.md, agent-file-template.md — no constitution references.
- ⚠ README.md / docs/quickstart.md — not present in repo yet; when created they MUST
  link to this constitution.

Deferred TODOs: none.
-->

# Tokoshopee Constitution

Tokoshopee (https://tokoshopee.com) is a single-product e-commerce store serving
Indonesian customers, built so it can grow into a multi-product catalog without a
rewrite. This constitution is the highest-authority document in the repository.

## Core Principles

### I. Indonesian-First, Translation-Only Copy

Indonesian is the primary language and Indonesian buyers are the primary audience.

- Default locale MUST be `id`, served at `/id`. Secondary locale MUST be `en`, served
  at `/en`.
- The root URL `/` MUST redirect to `/id`. Browser-language auto-redirect (e.g.
  `Accept-Language` sniffing) MUST NOT be implemented; locale changes only by explicit
  user action or explicit URL.
- Every user-facing interface string MUST come from a next-intl translation file. Hardcoded
  user-facing text in components, pages, emails, or error messages is a defect.
- Product catalog content (names, descriptions, highlights, specifications, image alt text,
  SEO texts) is data, not interface copy: it lives in the catalog (Principle III) and MUST be
  stored in both `id` and `en`. A product MUST NOT become `ACTIVE` while either language is
  incomplete.
- Every translation key MUST exist in both `id` and `en` before the change merges.

Rationale: a mixed-language or auto-switching store erodes trust with Indonesian
buyers and makes copy changes require code changes.

### II. Mobile-First, Brand-Distinct UI

- Layouts MUST be designed and verified at phone widths first; desktop is an
  enhancement, never the baseline.
- The product page MUST follow a Tokopedia-style commerce pattern: sticky bottom buy
  bar, visible trust badges, clean single-column product detail.
- The palette MUST be the brand's cream/brown scheme. Shopee colors, logos, fonts, or
  other Shopee brand assets MUST NOT be used anywhere in the product.

Rationale: nearly all traffic is mobile, and borrowing another marketplace's brand
assets creates legal and trust risk.

### III. Single Source of Truth per Data Class

Each class of data has exactly one authoritative home. Duplicating it elsewhere is a
defect.

- **Product catalog data** (categories, products, prices, status, images, descriptions) lives
  in PostgreSQL and is managed by the owner from the authenticated admin area. It MUST NOT be
  duplicated in repository files, translation files, or code; a repository file MAY serve as an
  import source, read only by the import routine, but MUST NOT be read by the running storefront.
- Stock remains transactional data: a product's quantity lives only in its stock level and
  the stock-change log (Principle VI), never as a catalog field.
- **Transactional data** (orders, stock levels, stock-change log, reviews) lives in
  PostgreSQL.
- **Commercial rules** (shipping zone rates, pairs-per-kg rule — default 2 pairs = 1 kg,
  COD fee, COD-disabled zones) live in a configuration file, not in code branches and
  not in the database.

Rationale: an unambiguous home per data class prevents drift between displayed price,
charged price, and recorded price.

### IV. Money Is Integer IDR

- All monetary values MUST be represented as integers in Indonesian Rupiah. Floating
  point types MUST NOT be used for money in code, database columns, API payloads, or
  config.
- Display formatting MUST use Indonesian conventions, e.g. `Rp 169.999`.
- Formatting MUST live in one shared helper; ad-hoc string concatenation of currency is
  a defect.

Rationale: float arithmetic produces off-by-one Rupiah mismatches between cart,
gateway, and ledger.

### V. Payment Integrity (NON-NEGOTIABLE)

- Every Midtrans webhook MUST have its signature verified before any state is read or
  written. Unverified payloads MUST be rejected and logged.
- Webhook handling MUST be idempotent: replaying the same notification MUST NOT change
  stock, order status, or logs a second time.
- Order status MUST change only through explicitly defined transitions. Arbitrary
  status assignment from request input is forbidden.
- The amount sent to Midtrans MUST be recomputed server-side from authoritative product
  and shipping data, never taken from the client.

Rationale: the payment path is the one place where a bug costs real money.

### VI. Stock Integrity (NON-NEGOTIABLE)

- All stock mutations MUST occur inside a database transaction using a conditional
  update that cannot drive stock below zero.
- Online-payment orders decrement stock when the order becomes `PAID`. COD orders
  decrement stock when the order becomes `CONFIRMED`.
- Stock MUST be re-checked at checkout and again immediately before payment is
  initiated.
- Cancelled, returned, or expired orders MUST restore stock only if that order actually
  decremented it.
- Every stock change MUST append a row to the stock-change log recording quantity
  delta, reason, order reference, and timestamp.

Rationale: overselling a single-product store is an unrecoverable customer-trust
failure.

### VII. Honest Content

- Reviews, ratings, and sold counts shown in production MUST reflect real data.
  Fabricated or placeholder social proof in production is forbidden.
- Demo reviews MAY exist only in development seed data and MUST NOT be loadable in the
  production environment.
- **Approved exception — sample products.** Products flagged `isSample` MAY exist in
  production only with status `COMING_SOON`: they show no price, cannot be purchased, carry
  no ratings, reviews, or sold counts, and use clearly placeholder imagery (never a photo
  presented as the product). They MUST be removable by a single cleanup routine. No other
  placeholder or fabricated content is permitted in production.

Rationale: fake social proof is both a legal exposure and a trust failure that cannot
be undone.

### VIII. SEO by Default

Every user-facing page MUST ship with:

- A unique `<title>` of at most 60 characters and a meta description of approximately
  155 characters, in both `id` and `en`.
- `hreflang` annotations for `id-ID` and `en`, plus a canonical URL.
- Bilingual, descriptive `alt` text on every content image.

The site MUST serve `sitemap.xml` and `robots.txt`. Keyword strategy MUST NOT target
"Shopee" or other third-party marketplace brands.

Rationale: retrofitting metadata across a bilingual site is far more expensive than
adding it per page.

### IX. Security Baseline

- The admin area MUST sit behind a single authenticated login with a hashed password, a
  secure session cookie, and rate-limited login attempts.
- All secrets MUST come from environment variables. Secrets MUST NOT appear in source,
  config files under version control, logs, or client bundles.
- All input crossing a server boundary (route handlers, server actions, webhooks) MUST
  be validated server-side with zod. Client-side validation is a UX aid only.
- Customer order lookup and self-service cancellation MUST require both order number
  and the phone number on the order.

Rationale: a small store is a common target precisely because these basics are often
skipped.

### X. Future-Ready Without Over-Building

- Shipping MUST be accessed through a `ShippingProvider` interface. The only
  implementation for now is a flat zone-rate provider.
- The storefront MAY list multiple products and categories. Each order is for exactly one
  product; a multi-item cart is out of scope until this constitution is amended.
- Features outside the agreed scope MUST NOT be built. Abstractions with exactly one
  current and no agreed future consumer MUST NOT be introduced.

Rationale: two seams (shipping, product cardinality) are known to move; everything else
speculative is waste.

### XI. Quality & Test Discipline

- Changes MUST be small and reviewable; unrelated refactors MUST NOT ride along.
- TypeScript MUST run in strict mode. `any`, non-null assertions on untrusted data, and
  `@ts-ignore` require an inline justification comment.
- Automated tests are MANDATORY for: price calculation, shipping calculation
  (including the pairs-per-kg rounding and COD fee), order status transitions, stock
  transitions, and webhook handling (signature verification plus replay).
- A change to any of the above areas MUST NOT merge without a test covering the new or
  changed behavior.

Rationale: these five areas are where a defect silently costs money or oversells stock.

## Technology & Deployment Constraints

The stack is fixed. Changing any item below is an amendment to this constitution and
requires an ADR.

- **Application**: Next.js (App Router) + TypeScript (strict) + Tailwind CSS
- **Database**: PostgreSQL accessed through Prisma
- **Internationalization**: next-intl
- **Payments**: Midtrans Snap, using the client's Midtrans account. Development and
  staging MUST use Sandbox credentials; production credentials MUST NOT exist outside
  the production environment.
- **Hosting**: the owner's own VPS running Node behind PM2, fronted by Nginx with HTTPS
  enforced.
- **Database exposure**: the PostgreSQL port MUST NOT be reachable from the public
  internet under any circumstance, including "temporarily" during debugging.

### Scope Boundary

The following are explicitly OUT OF SCOPE and MUST NOT be built until this constitution
is amended: WhatsApp contact button, email notifications, analytics, vouchers or
discount codes, customer accounts, size variants, and the footer affiliation
disclaimer.

Product management in the admin area, categories, and product status
(`ACTIVE`/`COMING_SOON`/`DRAFT`) are IN scope as of v2.0.0.

## Development Workflow & Quality Gates

1. **Specify → Plan → Tasks → Implement.** Feature work follows the SDD flow; specs
   live in `specs/<feature>/`.
2. **Constitution Check.** Every plan MUST pass the Constitution Check gate before
   Phase 0 research and again after Phase 1 design. Violations MUST be recorded in the
   plan's Complexity Tracking table with justification, or the design MUST change.
3. **Merge gates.** A change merges only when: TypeScript compiles under strict mode,
   lint passes, mandated tests (Principle XI) pass, both `id` and `en` translations
   exist for new keys, and new pages carry their metadata (Principle VIII).
4. **Mobile verification.** UI changes MUST be visually verified at phone width before
   review.
5. **Records.** Every user prompt produces a PHR under `history/prompts/`.
   Architecturally significant decisions are proposed as ADRs under `history/adr/` and
   created only with user consent.
6. **Secrets review.** Any change touching environment variables MUST confirm no secret
   value entered version control.

## Governance

This constitution supersedes all other development practices, conventions, and habits
in this repository. Where a tool default, framework convention, or prior code pattern
conflicts with a principle here, this document wins.

**Amendment procedure.** Amendments MUST be proposed with: the text being changed, the
rationale, and the migration impact on existing code and specs. Amendments require the
project owner's explicit approval. Amendments that change a NON-NEGOTIABLE principle
(V, VI) or the fixed technology stack additionally require an ADR under `history/adr/`.

**Versioning policy.** This document is versioned with semantic versioning:

- **MAJOR**: a principle is removed or redefined in a backward-incompatible way, or
  governance authority changes.
- **MINOR**: a principle or section is added, or existing guidance is materially
  expanded.
- **PATCH**: clarifications, wording, and typo fixes that do not change obligations.

Every amendment MUST update the version, the Last Amended date, and the Sync Impact
Report comment at the top of this file.

**Compliance review.** Plans and PRs MUST verify compliance against these principles.
Complexity that violates a principle MUST be justified in writing or removed. Runtime
development guidance for agents lives in `CLAUDE.md` and MUST stay consistent with this
constitution; if the two conflict, this constitution governs and `CLAUDE.md` MUST be
corrected.

**Version**: 2.0.0 | **Ratified**: 2026-09-19 | **Last Amended**: 2026-10-03