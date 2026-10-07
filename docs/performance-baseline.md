# Performance Baseline (T136)

**Satisfies**: plan.md Performance Goals; SC-001.

**Budgets** (plan.md): product page interactive under 3s on a mid-range Android device over 4G;
checkout submit-to-confirmation under 2s, excluding the payment provider's own redirect.

## Status: not yet measured against the real budget

**Lighthouse was not run.** A real Lighthouse mobile run needs a rendered, deployed (or at least
locally served) build and a browser to drive it — this session had neither a connected browser
(same constraint as `docs/mobile-verification.md` and `docs/accessibility-audit.md`) nor a
Postgres-backed running server to serve the product page or complete a checkout against (the
home page and checkout flow both read from the database). Installing Lighthouse's CLI plus a
headless Chromium to work around that was the option declined in favour of a code-level pass —
same choice as the mobile and accessibility tasks in this same session.

**This is a release blocker**, not an optional nice-to-have: plan.md's budgets are numeric
claims (`< 3s`, `< 2s`) that only a real timed run can confirm or refute. Record the real run in
the log below before checking this off `docs/release-checklist.md`.

## What was actually measured: production bundle sizes

`npm run build` **was** run successfully in this session (`next.config.ts`'s `output:
"standalone"`, added for T128, built and traced without error). Its route-level output is real
data, not an estimate — reproduced in full below. It's a legitimate leading indicator for
JavaScript-bound Time to Interactive (less JS to parse and hydrate generally means faster TTI),
but it is not a substitute for the LCP/TTI budget: it says nothing about server response time,
image weight, database query latency, or the Midtrans Snap widget's own load cost, all of which
count against the 3s/2s budgets above.

```
Route (app)                              Size  First Load JS
┌ ○ /_not-found                           0 B         116 kB
├ ● /[locale]                         1.28 kB         135 kB   ← product page
├   ├ /id
├   └ /en
├ ƒ /[locale]/[...rest]                   0 B         133 kB
├ ● /[locale]/cara-pemesanan              0 B         133 kB
├ ● /[locale]/cek-pesanan             2.18 kB         135 kB
├ ● /[locale]/checkout                 106 kB         239 kB   ← checkout page
├ ● /[locale]/kebijakan-pengembalian      0 B         133 kB
├ ● /[locale]/kebijakan-privasi           0 B         133 kB
├ ƒ /[locale]/pesanan/[orderNumber]       0 B         133 kB
├ ● /[locale]/syarat-ketentuan            0 B         133 kB
├ ● /[locale]/ulasan                   1.6 kB         135 kB
+ First Load JS shared by all          116 kB
```

Observations from this data alone:

- The product page's own First Load JS (135 kB) is close to the 116 kB shared baseline every
  route pays — the product page itself adds very little (`Gallery`, `Benefits`, `TrustBadges`,
  `PurchasePanel`, `Reviews` together add ~19 kB). Most of the 135 kB is fixed cost paid by
  every route, not something specific to the product page that could be trimmed further without
  affecting the rest of the app.
- The checkout page is the clear outlier at 239 kB (106 kB of route-specific JS on top of the
  shared 116 kB, plus 17 kB more shared-chunk growth than other routes) — almost certainly the
  Midtrans Snap client library (`SnapTrigger`) and the address/region dataset
  (`src/data/regions.id.json`) bundled with `AddressFields`. This is the page most likely to be
  close to or over its 2s budget and the one a real Lighthouse run should scrutinise first.
- 239 kB of First Load JS is a plausible but not certain pass against "under 2s to confirmation
  excluding the provider redirect" on a throttled mid-range-Android-over-4G profile — this is
  squarely the kind of number that needs a real timed measurement rather than a guess in either
  direction.

## Measurement log

| Date | Page | Metric | Result | Budget | Pass? | Notes |
|---|---|---|---|---|---|---|
| _(none yet)_ | Product page | Time to Interactive | | < 3s | | |
| _(none yet)_ | Checkout flow | Submit → confirmation | | < 2s (excl. redirect) | | |

Any result missing its budget by more than 20% must be recorded here with its cause, not
quietly re-measured until it passes — per this task's AC.
