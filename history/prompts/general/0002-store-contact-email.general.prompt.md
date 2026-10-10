---
id: 0002
title: Store contact email
stage: general
date: 2026-10-10
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["contact-email", "copy", "footer", "legal-pages"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/config/store.config.ts
 - src/components/content/ContentPage.tsx
 - src/components/layout/Footer.tsx
 - src/components/ui/Icon.tsx
 - src/app/[locale]/cara-pemesanan/page.tsx
 - src/app/[locale]/syarat-ketentuan/page.tsx
 - src/app/[locale]/kebijakan-privasi/page.tsx
 - src/app/[locale]/kebijakan-pengembalian/page.tsx
 - src/messages/id.json
 - src/messages/en.json
 - docs/release-checklist.md
 - docs/redesign-plan.md
tests:
 - npm run verify (typecheck, lint, constitution, 724-key message parity, media, 692 unit) — PASS
 - npm run test:integration — PASS 555/555
 - dev server curl of 4 content pages x 2 locales + both homepages — mailto link count matches every mention, no raw <email> tag, no email PLACEHOLDER
---

## Prompt

One more task: Add the email address [blooginga@gmail.com](mailto:blooginga@gmail.com) to the project wherever it is appropriate and should be used.

## Response snapshot

Found six "[PLACEHOLDER: store contact email]" uses per language (How to Order help, Terms seller
details, Privacy controller details and rights, Returns how-to step and contact) plus the footer,
which deliberately omitted contact details until one existed (redesign-plan §7.1). The address
lives once in `src/config/store.config.ts` (zod-validated at load); messages mark its position
with an `<email></email>` tag rendered via `t.rich(key, emailTag)` as a `ContactEmailLink`
mailto link. The footer gains a mail-icon mailto link with a translated aria-label. No outgoing
mail exists in the app, so no sender address was needed. Legal name and address remain
PLACEHOLDER. Docs updated to the new placeholder counts.

## Outcome

- ✅ Impact: customers can reach the store at blooginga@gmail.com from every help/legal page and the footer, in both languages.
- 🧪 Tests: verify green, integration 555/555, rendered-page check in id and en.
- 📁 Files: 12 modified/added (see list above).
- 🔁 Next prompts: supply legal name and address; production deploy needs owner approval.
- 🧠 Reflection: one config constant instead of 12 copies in translation files keeps the address a one-line change.

## Evaluation notes (flywheel)

- Failure modes observed: first curl pass missed the /id locale redirect (no -L); rerun confirmed.
- Graders run and results (PASS/FAIL): verify PASS, integration PASS.
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
