---
id: 0014
title: Order email not delivered diagnosis
stage: general
date: 2026-11-09
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["notifications", "email", "resend", "debugging"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/infrastructure/email/resend-sender.ts
 - tests/unit/resend-sender.test.ts
 - docs/owner-order-email.md
tests:
 - tests/unit/resend-sender.test.ts (5, new)
 - npm run verify (764 unit), owner-notification integration (11), owner-notification race (1): green
 - live resend of TKS-261109-M0X20 through sendOwnerNotifications: Resend 403 (account address mismatch)
---

## Prompt

I added the API key and the email in the .env file for the address I wanted to send the email to, then I placed a dummy order for testing, but the email wasn't sent to that address. Check what the issue is and fix it quickly.

(Sent twice.)

## Response snapshot

The test order TKS-261109-M0X20 had its notification row, with lastError "Resend unreachable: The
operation was aborted due to timeout". curl showed 1 in 3 connections to api.resend.com stalling
(7 s connect). Locally nothing retries (the expiry cron runs only on the VPS). Fix: ResendEmailSender
now tries up to 3 times (1 s, 3 s pauses) on a network error, 429 or 5xx; 4xx is not retried; the
idempotency key keeps retries safe. Resending the pending row then showed the real blocker: Resend
403, "You can only send testing emails to your own email address (mmaaz000004@gmail.com)". The key
comes from a Resend account registered with a different address than ORDER_NOTIFY_EMAIL
(asadaliblogger0266@gmail.com). That cannot be fixed in code: the owner must create the Resend
account and key with asadaliblogger0266@gmail.com, or verify a domain and set EMAIL_FROM. Troubleshooting
doc updated with both errors.

## Outcome

- ✅ Impact: stalled connections no longer lose the email; the delivery blocker is identified with the exact Resend message.
- 🧪 Tests: 5 new unit tests; related suites green.
- 📁 Files: resend-sender.ts, its test, the setup doc.
- 🔁 Next prompts: new Resend key from an account registered with asadaliblogger0266@gmail.com; resend the pending email for TKS-261109-M0X20.
- 🧠 Reflection: the first recorded error (timeout) hid the second (403); a live resend surfaced it.

## Evaluation notes (flywheel)

- Failure modes observed: network stalls to Resend; Resend account address differs from the recipient.
- Graders run and results (PASS/FAIL): unit, integration, concurrency PASS; live send FAIL (403, configuration).
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): show the last email error on the admin order page.
