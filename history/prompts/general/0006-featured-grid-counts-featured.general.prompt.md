---
id: 0006
title: Featured grid counts featured product
stage: general
date: 2026-10-20
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["storefront", "homepage", "thresholds"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/domain/catalogue/home-sections.ts
 - src/app/[locale]/(home)/page.tsx
 - tests/unit/home-sections.test.ts
 - tests/integration/home-thresholds.test.ts
tests:
 - tests/unit/home-sections.test.ts
 - tests/integration/home-thresholds.test.ts
---

## Prompt

make the featured grid show with 2 ACTIVE products total

## Response snapshot

planHomeSections now applies SHOWCASE_MINIMUM to every ACTIVE product, the featured one included, and still
leaves the featured product out of the grid. With 2 on sale the grid shows the 1 that isn't featured. The
Segera hadir minimum is unchanged. Updated the unit table (2 ACTIVE gives 1) and the integration steps
(the second ACTIVE shows the grid; drafting back to only the featured one hides it). The dev homepage now
shows pangoin in the grid. Commit 423254e.

## Outcome

- ✅ Impact: a second product on sale now appears on the homepage
- 🧪 Tests: unit 727, integration 572, concurrency 5 passing; build green
- 📁 Files: home-sections.ts, homepage comment, 2 tests
- 🔁 Next prompts: none
- 🧠 Reflection: the rule lives in one pure function, so the change was one line plus tests

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): verify PASS, integration PASS, concurrency PASS, build PASS
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
