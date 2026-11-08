---
id: 0010
title: Owner email on every new order
stage: general
date: 2026-11-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["notifications", "email", "resend", "checkout", "orders", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - prisma/schema.prisma
 - prisma/migrations/20261108120000_owner_notification/migration.sql
 - src/config/env.ts
 - src/domain/notification/order-email.ts
 - src/infrastructure/email/resend-sender.ts
 - src/infrastructure/db/owner-notifications.ts
 - src/app/actions/checkout.ts
 - src/app/api/jobs/expire-orders/route.ts
 - src/messages/id.json
 - src/messages/en.json
 - .env.example
 - docs/owner-order-email.md
 - tests/integration/setup.ts
 - tests/integration/helpers/db.ts
tests:
 - tests/unit/owner-order-email.test.ts (9, new)
 - tests/integration/owner-notification.test.ts (11, new)
 - tests/concurrency/owner-notification-race.test.ts (1, new)
 - npm run verify (752 unit), test:integration (593), test:concurrency (6): all green
 - next build + next start -p 3001 with a deliberately invalid RESEND_API_KEY: live COD order via server action; after() reached Resend (401 recorded, row PENDING); expiry job retried (attempt 2)
---

## Prompt

Hey, can I add a feature where I receive an email notification whenever a user places an order? This way, I can track how many orders I receive and when they are placed.

Please explain the entire process to me, including the free options available. I want a complete overview first. Do not implement anything yet. Just explain how it works and what I need to do.

## Response snapshot

Plan mode: overview of how it would work, free options compared (Resend 100/day and 3,000/month; Gmail
SMTP ~500/day plus App Password, nodemailer and a possibly blocked port 587; Brevo 300/day;
Telegram as a non-email alternative), and what the owner must do. Owner's choices: email on every placed order, then check the
dashboard; Resend; summary plus admin link (no name, phone or address). The owner approved the plan in
plan mode, then it was implemented.

Implementation (7c3d1be): an `OwnerNotification` table (new table only, so past orders are never
emailed), written in the transaction that places the order: COD at creation, ONLINE together with the
midtransOrderId update after the Snap session. `after()` sends it once the customer has their response,
and the expiry job sweeps anything pending. A claim guard with a 2-minute lease, plus Resend's
`Idempotency-Key` (`owner-new-order/<orderNumber>`), means each order is emailed once. All failures
retry (wrong key and wrong recipient are fixable config); FAILED after 12 attempts. Pure email builder in
`src/domain/notification` (Indonesian labels from `admin.orderEmail.*`, HTML-escaped). Resend called with
fetch, no new dependency. Env: RESEND_API_KEY (unset = off), ORDER_NOTIFY_EMAIL, EMAIL_FROM. Test setup
clears the key so the suite never sends.

## Outcome

- ✅ Impact: the owner gets one email per placed order once RESEND_API_KEY is set; orders unaffected by email failures.
- 🧪 Tests: 21 new; full unit, integration and concurrency suites green; live check with an invalid key proved both send paths.
- 📁 Files: listed above; one migration.
- 🔁 Next prompts: owner creates the Resend account and key and sends a real test; privacy policy wording for the email provider; optional verified domain.
- 🧠 Reflection: the admin locale is pinned to English, but the approved plan sends Indonesian; the email labels are a single constant to change.

## Evaluation notes (flywheel)

- Failure modes observed: two test-logic mistakes (COD does not take stock at creation; seedStockLevel cannot run twice), fixed in the test.
- Graders run and results (PASS/FAIL): all suites PASS; build PASS; live send path PASS (Resend 401 with a fake key, as intended).
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): a daily summary email from the same job, if the owner wants counts per day.
