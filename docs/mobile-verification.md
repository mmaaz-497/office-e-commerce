# Mobile Verification at 360px (T126)

**Satisfies**: SC-001; Constitution Principle II.

## Methodology and its limits

This pass could not use a real rendered browser: the Claude-in-Chrome extension was not
connected in the environment this was run in, and several routes need a live PostgreSQL
database that was also unavailable (Docker was not running). Rather than install a new
headless-browser dependency (Playwright, ~300MB of Chromium binaries) into the project to
produce numbers that still couldn't be cross-checked visually, this was done as a **code-level
audit**: reading every route's markup and Tailwind classes for the three things the AC asks
for — horizontal overflow at 360px, the sticky buy bar, and 44px tap targets — and fixing what
could be confirmed as a real defect from the markup alone (a fixed pixel size below 44px, a
`flex` row with no wrap and no shrinkable child, a `<table>` with no scroll container).

**This is not a substitute for opening each page in a real 360px viewport.** The findings below
that are marked "flagged, not fixed" are cases where the arithmetic is close enough (or the
content is variable-length enough) that a confident fix needs to be seen, not calculated. Doing
that live pass — with real DevTools device emulation — is a release-checklist item
(`docs/release-checklist.md`) and should happen before T134's staging sign-off.

## Issues found and fixed

| # | File | Issue | Fix |
|---|---|---|---|
| 1 | `src/app/admin/orders/page.tsx` | Bare 5-column `<table>` with no scroll container — wider than 360px, so the whole page would scroll horizontally. | Wrapped in `<div className="overflow-x-auto">` so only the table region scrolls. |
| 2 | `src/app/admin/stock/page.tsx` | Same defect, 6-column stock-change log table. | Same fix. |
| 3 | `src/app/admin/dashboard/page.tsx` | `<nav className="flex gap-4">` with four Indonesian nav labels ("Daftar Pesanan", "Kelola Stok", "Kelola Ulasan", "Pengaturan") — their combined width plus gaps exceeds 360px, and the row had no `flex-wrap`. | Added `flex-wrap`. |
| 4 | `src/components/product/QuantitySelector.tsx` | The +/- buttons were a fixed `h-10 w-10` (40×40px), below the 44px minimum. | Bumped to `h-11 w-11` (44×44px). |
| 5 | `src/app/admin/orders/page.tsx` | The filter row's two `<select>`s, search `<input>`, and "Terapkan" button all used `py-1` (~28-32px tall). | Bumped to `py-2`, matching the app's baseline control height (see finding F1 below — that baseline itself needs live confirmation). |
| 6 | `src/components/admin/ReviewModeration.tsx` | The Approve/Unpublish/Delete buttons used `py-1`. | Bumped to `py-2`, same reasoning as #5. |

## Findings flagged, not fixed (need a live pass)

- **F1 — the app-wide form-control height.** The dominant pattern for every text input,
  select, and most buttons across the entire app (checkout, lookup, review, admin) is
  `px-3 py-2`. Arithmetic estimate: ~16px line-height contribution from `text-sm`/default body
  size + 16px vertical padding + 2px border ≈ 38-42px, i.e. plausibly just **under** the 44px
  target. This is dozens of call sites across nearly every form in the app; changing it
  everywhere without seeing the actual rendered height first risks a wide, unverified visual
  change for a defect that arithmetic alone can't confirm. **Action**: measure one representative
  input in real DevTools; if it is under 44px, bump the site-wide baseline from `py-2` to `py-2.5`
  or `py-3` in one pass rather than patching call sites individually.
- **F2 — `LocaleSwitcher` ("ID" / "EN") hit area.** `src/components/ui/LocaleSwitcher.tsx` renders
  bare, unpadded text links in the header of every public page. Tap target is close to the glyph
  size alone (well under 44px). Suggested fix once confirmed live: `p-2 -m-2` on each `<Link>` to
  grow the hit area without shifting the visible layout.
- **F3 — `ReviewForm` star rating buttons.** `src/components/review/ReviewForm.tsx`'s five star
  buttons (`text-3xl`, no padding) are roughly 30-36px, under 44px. Same "confirm live, then pad
  without disturbing the 5-star row" treatment as F2.
- **F4 — native radio/checkbox labels.** `CheckoutForm`'s payment-method radios wrap the native
  input and its text in a `<label className="flex items-center gap-2">` with no vertical padding
  — the clickable label height is just the text line, under 44px. Same treatment.
- **F5 — `OrderActions` two-button rows** (Approve/Reject Cancellation, ~310px of combined content
  in a 312px-wide content area) are a close call that plausibly fits but should be confirmed live
  rather than assumed.
- **F6 — reviewer name overflow.** `src/app/admin/reviews/page.tsx`'s `flex items-center
  justify-between` row (reviewer name + published/unpublished badge) has no `truncate` or
  `min-w-0` on the name. Browsers wrap on word boundaries by default, so this only breaks for a
  single unbroken token longer than the row — unlikely but not impossible with real customer
  names.

## Route-by-route coverage

All 9 routes in the manifest (`src/i18n/routing.ts`) plus `not-found` and `error` — 11 public
routes total — and all 7 admin routes were read and checked against the three AC criteria.

### Public (11)

| Route | Horizontal overflow | Sticky buy bar | Tap targets |
|---|---|---|---|
| `/` (product) | Clear — single-column `grid md:grid-cols-2`, no fixed widths. Gallery uses `overflow-x-auto` for its own scroll-snap carousel (intentional). | **Present and correct** — `StickyBuyBar` is `fixed inset-x-0 bottom-0 … md:hidden`, so it renders at 360px and disappears at desktop widths where the inline buy button already exists. | Quantity +/- fixed (#4). Buy button and other `py-2` controls: see F1. |
| `/checkout` | Clear — `flex-col` form, no unwrapped rows. | N/A (not the product page) | Radio labels: F4. Rest: F1. |
| `/cek-pesanan` | Clear — `flex-col` form and result rows are all `justify-between` with two short strings. | N/A | F1. |
| `/pesanan/[orderNumber]` | Clear — single centered column, `max-w-lg`. | N/A | Single link button: F1. |
| `/ulasan` | Clear — `flex-col` form. | N/A | Star rating: F3. Text inputs: F1. |
| `/cara-pemesanan` | Clear — `ContentPage` shell is `flex-col`, `max-w-3xl`. | N/A | Text-only page, no interactive controls. |
| `/syarat-ketentuan` | Clear — same shell. | N/A | Text-only. |
| `/kebijakan-privasi` | Clear — same shell. | N/A | Text-only. |
| `/kebijakan-pengembalian` | Clear — same shell. | N/A | Text-only. |
| `not-found` (404) | Clear — centered column, `max-w-lg`. | N/A | Single button: F1. |
| `error` | Clear — same shell as 404, two buttons in a `flex flex-wrap` row. | N/A | F1. |

### Admin (7)

| Route | Horizontal overflow | Tap targets |
|---|---|---|
| `/admin/login` | Clear — centered form. | F1. |
| `/admin/dashboard` | Fixed (#3). Stat card grid is `grid-cols-2` at mobile — fits. | Nav links now wrap; F1 for buttons elsewhere. |
| `/admin/orders` | Fixed (#1). Filter row is `flex flex-wrap`. | Filter controls fixed (#5). |
| `/admin/orders/[orderNumber]` | Clear — `OrderActions` inputs use `flex-1` so they shrink instead of forcing overflow. | F1, F5. |
| `/admin/stock` | Fixed (#2). | F1. |
| `/admin/reviews` | Clear, but see F6. | Moderation buttons fixed (#6). |
| `/admin/settings` | Clear — single form. | F1. |

## Verdict

**Provisional pass.** Every route was checked and the unambiguous defects (2 unwrapped tables,
1 missing `flex-wrap`, 1 pair of under-sized fixed buttons, 4 under-sized fixed-padding buttons)
are fixed. Six findings (F1-F6) need a live 360px DevTools pass to confirm before this can be
called a verified pass rather than a code-level one — tracked as a release-checklist item.

---

# Addendum — Admin Dashboard Rebuild (360px)

**Scope**: the rebuilt `/admin/dashboard` only. Every other route's findings above are unchanged.

## Methodology and its limits

Same constraint as the pass above, for the same reason: the Claude-in-Chrome extension was not
connected, and adding a headless browser (~300MB of Chromium) for one screen is exactly the kind of
dependency Constitution Principle X rules out. So this is again a **code-level audit**, but with one
thing the earlier pass could not do: the page was rendered by a real Next.js server against a real
PostgreSQL database seeded with 41 orders, and the served HTML was read back and checked. That
confirms the markup, the data, the empty states and the failure state — it does not confirm how any
of it looks at 360px.

**A live 360px DevTools pass is still owed** and stays a release-checklist item.

## Layout arithmetic at 360px

`main` is `p-4`, so content width is 328px, and every panel adds `px-4` for 296px inside.

| Region | At 360px | Verdict |
|---|---|---|
| Header | `flex-col` below `lg`. Range filter (~184px) plus the primary button (~160px) exceed 328px and wrap — the row is `flex flex-wrap`. | Clear |
| Section nav | `flex flex-wrap gap-2`, four pills, wraps to two rows. | Clear |
| KPI cards | `grid-cols-1` at mobile, `sm:grid-cols-2`, `lg:grid-cols-4`. Longest realistic value, `Rp 1.234.567.890` at `text-2xl`, is ~224px inside a 296px card; `truncate` plus a `title` attribute covers anything longer. | Clear |
| Requires Attention rows | Left column is `min-w-0 flex-1` with `truncate` on the detail line; right column is `shrink-0`. Verified against a 112-character cancellation reason and a 54-character customer name. | Clear |
| Trend chart | A `w-12` y-axis gutter plus a ~240px plot. The plot is a `viewBox="0 0 100 100"` SVG with `preserveAspectRatio="none"`, so it has no intrinsic width to overflow with; strokes carry `vector-effect="non-scaling-stroke"`. Axis labels are HTML outside the SVG, capped at 6 plus the last day — 7 labels at `text-[10px]` is ~210px in 240px. | Clear |
| Status donut | `flex-col` below `sm`: a 128px square above a full-width legend whose label cell is `truncate`. | Clear |
| Open Pipeline | `grid-cols-1` below `lg`. Each bar row is `flex-wrap`; badge (~120px) plus count and value (~130px) fits 296px. | Clear |
| Latest Orders | Six columns, `min-w-[34rem]` (544px) inside `overflow-x-auto` — the same containment pattern as `/admin/orders` and `/admin/stock`, so the region scrolls and the page does not. | Clear |
| Recent Activity | Order number (~90px) and timestamp (~82px) on one `justify-between` row; the badge row below is `flex-wrap`. | Clear |

## Tap targets

- Range-filter pills were `py-1.5` (~28px) on the first cut and are now `py-2`, matching the app's
  own control baseline. **That baseline is finding F1 above and is still unconfirmed at 44px** — the
  dashboard inherits F1, it does not introduce a new violation.
- Quick-action rows are `py-2.5` around a 28px icon tile, ~44px tall. Clear.
- Section-nav pills are `px-3.5 py-2`, same as F1.
- Panel "view all" links and order-number links are inline text links, consistent with the inline
  links the previous dashboard used throughout.

## Verified by rendering, not by reading

Served HTML was checked in each data state:

| Case | Result |
|---|---|
| 41 orders, 30-day range | 200. All panels present, 30 daily tooltips, 7 axis labels. |
| `?range=7` / `?range=90` | 200. 7 and 90 daily points, 4 and 7 axis labels. |
| `?range=abc`, `?range=365`, `?range=-1` | Coerced to 30 days by `asDashboardRange`, no error. |
| Empty store (every table truncated) | 200. Conflicts group absent (FR-075), charts and lists show their empty copy, stock cover withheld rather than shown as `0`, both meters read "No orders yet". |
| One conflict and nothing else outstanding | 200. Requires Attention holds the red conflicts group alone — no empty panel body, and no contradictory "nothing needs attention". |
| Database missing entirely | 200 with the translated "Figures Unavailable" panel, section navigation intact, and `Admin dashboard: aggregation failed` logged server-side. Not a 500. |
| Markup scan | No `undefined`, `NaN`, `Infinity`, `[object`, or next-intl `MISSING_MESSAGE` anywhere in the rendered HTML. |
