---
id: 0004
title: Tokopedia-style premium header
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Muhammad Maaz
command: none
labels: ["header", "design-system", "ui", "tokopedia-reference"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - src/components/layout/AnnouncementBar.tsx
 - src/components/layout/Header.tsx
 - src/components/layout/HeaderBar.tsx
 - src/components/layout/HeaderSearch.tsx
 - src/messages/id.json
 - src/messages/en.json
tests:
 - npx vitest run tests/unit (692 passed)
 - tsc --noEmit, eslint src/components/layout
 - headless Chrome screenshots at 1440 (closed and Kategori open), 1024, 768 and 375
---

## Prompt

& 'c:\Users\HP\OneDrive\画像\Screenshots\Screenshot 2026-10-12 115148.png'

Hi, my website’s current header is very simple, while Tokopedia’s header looks much more premium. You already have the Tokopedia header reference I shared with you. Use it as inspiration to redesign my website’s header and make it look modern, polished, and premium.

## Response

Rebuilt the header on the Tokopedia structure within the Design System:
- Utility band moved from the ink band to a quiet `surface-muted` band (ink message, ink-2 help links).
- Main bar 80px at lg with a larger wordmark, a "Kategori" disclosure dropdown (panel, Escape,
  outside press and focus-out close it), a single-field search whose magnifier is the submit
  button, the ID/EN switcher, a divider, then an outlined "Cek Pesanan" + solid "Beli" pair
  (mirroring Masuk/Daftar). Cek Pesanan is icon-only from md to xl.
- Slim row under the bar (lg): category links left, "Dikirim ke seluruh Indonesia" right (the
  claim the store tagline already makes). New keys `home.nav.shipsTo` / `shipsToArea`.
- Mobile layout and drawer unchanged.

## Outcome

- ✅ Impact: header matches the reference's hierarchy without Tokopedia green or a cart/account
  the store does not have.
- 🧪 Tests: unit suite green; typecheck and lint clean; screenshots at five widths.
- 📁 Files: 6 changed.
- 🔁 Next prompts: optional — collapse the slim row when scrolled.
- 🧠 Reflection: 007 contract text still describes an "ink" utility band; update it if the spec is revisited.
