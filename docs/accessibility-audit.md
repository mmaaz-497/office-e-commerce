# Accessibility Pass Across Public Pages (T127)

**Satisfies**: FR-073.

## Methodology

Same constraint as `docs/mobile-verification.md`: no connected browser and no live database
in this environment, so this is a **code-level audit** — reading every public page and
component against the four AC criteria — rather than a screen-reader or automated-scanner run.
Fixes below are additive ARIA/semantics changes with no visual footprint, so they carry none of
the "needs to be seen live" risk that blocked further changes in the mobile pass.

## AC 1 — Every form field labelled

Checked every `<input>`, `<select>`, and `<textarea>` under `src/components/{checkout,lookup,
review}` and `src/app/[locale]/**`. All of them are wrapped in a `<label>` containing both the
field and its caption (`<label className="flex flex-col gap-1"><span>…</span><input …/></label>`)
— implicit label association, valid without a separate `htmlFor`/`id` pair. The one custom
control that isn't a native form element, `QuantitySelector`, carries `role="group"` with
`aria-label` on the container and `aria-label` on each button. **No gaps found.**

## AC 2 — Focus visible and order logical

- No `outline-none` or `focus:outline-*` override exists anywhere in `src/` — the browser's
  default focus ring is intact on every interactive element. **No gaps found.**
- No `tabIndex` overrides exist anywhere in `src/` — tab order follows DOM order, which follows
  visual order (top-to-bottom, left-to-right) in every form. **No gaps found.**
- **Fixed**: dynamic error messages (validation and submission failures) appeared as plain
  `<p>` elements with no announcement to assistive technology — a screen reader user would not
  know an error appeared unless they happened to re-read the form. Added `role="alert"` to the
  error paragraph in:
  - `src/components/checkout/CheckoutForm.tsx` (submission error)
  - `src/components/lookup/LookupForm.tsx` (lookup-failed error)
  - `src/components/lookup/CancellationActions.tsx` (cancellation-request error)
  - `src/components/review/ReviewForm.tsx` (verify error and submit error)
- **Fixed**: the five star-rating buttons in `ReviewForm` had an `aria-label` per button
  ("3 bintang") but no indication of which stars were already selected — a screen reader user
  could hear each button's label but not the current rating. Added `aria-pressed={star <=
  rating}` to each button.

## AC 3 — Colour contrast meets WCAG AA against the cream/brown palette

Computed WCAG 2 contrast ratios (relative-luminance formula, not a visual estimate) for every
foreground/background pair actually used as text in the app, against `tailwind.config.ts`'s
declared hex values:

| Foreground | Background | Ratio | Normal text (≥4.5:1) | Large/bold text (≥3:1) |
|---|---|---|---|---|
| brown-dark `#4A2E1E` | cream `#FDF8F0` | 11.68:1 | PASS | PASS |
| brown-dark `#4A2E1E` | cream-dark `#F5EBDD` | 10.47:1 | PASS | PASS |
| brown `#7A4B32` | cream `#FDF8F0` | 6.90:1 | PASS | PASS |
| brown `#7A4B32` | cream-dark `#F5EBDD` | 6.18:1 | PASS | PASS |
| white | brown `#7A4B32` | 7.29:1 | PASS | PASS |
| red-700 (Tailwind default) | cream `#FDF8F0` | 6.12:1 | PASS | PASS |
| green-700 (Tailwind default) | cream `#FDF8F0` | 4.74:1 | PASS | PASS |
| amber-700 (Tailwind default) | cream `#FDF8F0` | 4.75:1 | PASS | PASS |
| accent `#C98A3E` | cream `#FDF8F0` | 2.76:1 | FAIL | FAIL |
| brown-light `#A9764F` | cream `#FDF8F0` | 3.68:1 | FAIL | PASS |

The two failing pairs are not live defects:

- **`accent`** is used in exactly one place, `src/components/ui/Wordmark.tsx`, as the "shopee"
  half of the "Toko**shopee**" logotype. WCAG SC 1.4.3 explicitly exempts text that is part of a
  logo or brand name from the contrast requirement.
- **`brown-light`** is declared as a design token in `tailwind.config.ts` and `globals.css` but
  is not used as a text colour anywhere in the codebase (`grep -rn "text-brown-light" src/`
  returns nothing) — there is nothing to fail against.

`text-cream-dark` (near-invisible against `bg-cream` by design) is used in exactly two places,
both decorative rather than content-bearing: the unselected-star fill in `ReviewForm` (the
essential information — which rating is selected — is now conveyed via `aria-pressed`, not
colour alone) and the `aria-hidden` "|" separator in `LocaleSwitcher`. Neither is a WCAG 1.4.3
violation because neither is the sole carrier of information.

**Verdict: every colour pair actually used for content text passes WCAG AA.**

## AC 4 — Every image has meaningful alt text in both languages

There is exactly one `<img>` element in the entire codebase (`grep -rn "<img" src/`):
`src/components/product/Gallery.tsx:19`, which resolves its `alt` from a message key
(`t(image.altKey)`, keys `product.alt.front/side/pair`) present in both `id.json` and `en.json`
and enforced identical by `scripts/check-messages.ts`'s parity check. **No gaps found.**

## Fixes applied

| File | Change |
|---|---|
| `src/components/checkout/CheckoutForm.tsx` | `role="alert"` on the submission-error paragraph. |
| `src/components/lookup/LookupForm.tsx` | `role="alert"` on the lookup-failed paragraph. |
| `src/components/lookup/CancellationActions.tsx` | `role="alert"` on the cancellation error paragraph. |
| `src/components/review/ReviewForm.tsx` | `role="alert"` on both error paragraphs; `aria-pressed` on the star-rating buttons. |

## Not fixed — out of this task's scope

The admin area (`src/app/admin/**`) has the same unannounced-error pattern (`{error && <p
className="text-sm text-red-700">…</p>}` with no `role="alert"`) in `AddOwnerReviewForm`,
`LoginForm`, `OrderActions`, `ReviewModeration`, `SoldCountBaselineForm`, and `StockAdjustForm`.
T127's task title scopes this pass to public pages; the admin operator is a single known user,
not the anonymous public this AC protects, so this was left alone rather than expanding scope.
Worth the same one-line fix in a future pass.
