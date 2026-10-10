# Tokoshopee Redesign + Catalogue Management: Phase 1 Plan

## Context
The client wants a professional multi-product storefront and product management in the admin area (see `docs/redesign-brief.md` and the scope update in the request). Today the store is a single product held in a JSON file. This plan covers the analysis, audit, design system and phase split.

**Decisions already made by the user (2026-10-03):**
1. Amend the constitution in Phase 2, so the catalogue moves into PostgreSQL.
2. Keep **one product per order**. There will be no multi-item cart.

**Method notes:**
- No `design-refs/` folder exists. Reference research uses general knowledge of the four marketplaces.
- Live capture was not possible. Docker is not running, so there is no Postgres; every storefront route reads the DB; Playwright is not installed and installing it would add a dependency.
- The audit is therefore code-level, building on `docs/mobile-verification.md`. Live screenshots at 375, 768 and 1440 are a Phase 6 QA item.

**After approval, do only these two things, then stop:**
1. Save this plan as `docs/redesign-plan.md`.
2. Add a `## Design System` section to `CLAUDE.md` with §5 below (tokens and component specs).

No other code changes and no commit. CLAUDE.md requires a PHR for every prompt; I'll write `history/prompts/general/<id>-redesign-phase1-plan.general.prompt.md` unless you tell me to skip it.

---

## 1. Project analysis

**Stack**
- Next.js 15.5.25 (App Router, `output: "standalone"`), React 19.1, TypeScript strict.
- next-intl 4.14 with locales `id` (default) and `en`, `localePrefix: always`.
- Tailwind v4 with CSS-first tokens in `src/app/globals.css`. `tailwind.config.ts` is a tooling-only mirror; Tailwind v4 does not read it because there is no `@config`.
- zod 4, Prisma 6.19 on PostgreSQL 16, Midtrans Snap, bcrypt, Vitest 5.
- No UI library and no state library.

**Health (measured this session)**
- `typecheck`: pass. `lint`: pass. `npm test`: 17 files / 247 tests pass.
- Integration and concurrency tests, the dev server and the build were **not** run, because they need Postgres and Docker is stopped. A prior build exists in `.next/`.

**Run locally**
1. `docker compose up -d db`
2. `cp .env.example .env`
3. `npm run prisma:migrate`
4. `npm run seed:production && npm run seed:dev`
5. `npm run dev` (webpack wrapper at `scripts/dev.ts`, port 3000)

Build with `npm run build`; `prebuild` runs the constitution, messages and media checks.

**Structure**
- `src/app/[locale]/*` holds the storefront and `src/app/admin/*` the admin area.
- Server actions are in `src/app/actions/**`.
- `src/domain` is pure logic, enforced by an ESLint rule.
- `src/infrastructure/{db,auth,payment,shipping,seo,rate-limit}`.
- `src/data/product.json` is the catalogue; message files are `src/messages/{id,en}.json`.

**Routes** (id path / en path)
- `/` → `/`
- `/produk/[slug]` → `/product/[slug]`
- `/checkout` → `/checkout`
- `/cek-pesanan` → `/check-order`
- `/pesanan/[n]` → `/order/[n]`
- `/ulasan` → `/write-review`
- `/cara-pemesanan` → `/how-to-order`
- `/syarat-ketentuan` → `/terms`
- `/kebijakan-privasi` → `/privacy`
- `/kebijakan-pengembalian` → `/returns`
- Plus 404, error and `[...rest]`.
- Admin: `/admin/{login,dashboard,orders,orders/[n],stock,reviews,settings}`.
- API: `/api/webhooks/midtrans`, `/api/jobs/expire-orders`. Also `sitemap.ts`, `robots.ts`, `icon.tsx`.

**Components: reusable as-is or with small changes**
- `ui/Icon`, `ui/LocaleSwitcher`, `ui/Wordmark`
- `content/ContentPage` and its parts
- `product/QuantitySelector`, `product/Gallery`, `product/TrustBadges`
- `home/SectionHeading`, `home/ProductShowcase` (already maps over a product array), `home/HeroCarousel`, `home/HeroPreload`
- `home/Faq` (emits FAQPage JSON-LD), `home/OrderingSteps`, `home/VideoStage`
- `checkout/AddressFields`, `checkout/OrderSummary`, `checkout/SnapTrigger`
- Admin `dashboard/*` (Panel, StatCard, TrendChart, StatusDonut, Meter), `StatusBadge`, `EmptyState`

**Components: hard-wired to the single product**
- These read `catalogue[0]`: `Header.tsx:42`, `Footer.tsx:39`, `[locale]/page.tsx:57`, `pesanan/[orderNumber]/page.tsx:10`, `CheckoutForm.tsx:32` (which also imports the JSON into the client bundle), `actions/checkout.ts:58`.
- `BenefitsStrip:16-21` and `FinalCta:14-18` key their icon maps on this product's message keys.
- `PurchasePanel:31` and `StickyBuyBar` build the checkout href by hand, with no product.
- `Reviews.tsx:67,73` builds its pagination href by hand.

**Styling**
- Cream/brown tokens with brown-tinted shadows: `soft`, `card`, `lifted`, `glow`.
- Heavy CSS motion: `aurora`, `float-soft`, `marquee-x`, `sheen`, `TiltCard` 3D tilt, `Reveal` on every section. All of it is disabled under reduced motion.
- Fonts are Geist and Geist Mono via `next/font`. `--font-display` is a dead, self-referential variable.

**State**
- Server components plus local `useState` only.
- There is no cart, no context and no client storage.

**Product data**
- `product.json` holds one item, `slippers-gemoy`, at `priceIDR` 169999.
- Media: 6 banner PNGs (landscape, portrait and square, with text baked in) and a video plus poster. Images use `next/image` at quality 80, with explicit sizes from `ORIENTATION_INTRINSIC`.
- All text fields are message keys: `nameKey`, `benefitKeys`, `trustBadgeKeys`.
- The DB has **no product table**:
  - `StockLevel` is one row, `id="default"`.
  - `Order` has no product reference.
  - `Review` is global, and so is the sold count (`Setting SOLD_COUNT_BASELINE`).
- There is no CMS and no file upload anywhere. Nginx has `client_max_body_size 1m`.

**Features that exist today**
- Product page, quantity, direct checkout with ONLINE (Midtrans Snap) or COD payment (COD disabled for some provinces).
- Shipping quote via `ShippingProvider` (flat zone rates, which are **PLACEHOLDER** values).
- Order confirmation, order lookup by number plus phone, self-service cancellation, verified-purchase review form.
- Bilingual SEO (canonical, hreflang, sitemap, robots, FAQPage JSON-LD).

**Features that don't exist**
- Cart, search, wishlist, customer accounts.
- Product JSON-LD, Open Graph images.
- Customer-facing stock display.

**Must keep working (regression list)**
- [ ] Locale routing: `/` redirects to `/id`, both locales' paths work, the locale switcher keeps the query string, and there is no Accept-Language redirect.
- [ ] Checkout:
  - server-side recomputation of the amount (Principle V)
  - stock check at checkout and again before Snap
  - COD gating by province
  - order-number retry
  - frozen price snapshot
- [ ] Midtrans webhook: signature check, idempotency, ordering, expiry job.
- [ ] Stock lifecycle (Principle VI):
  - decrement on PAID (online) or CONFIRMED (COD)
  - restore only if `stockDecremented`
  - append-only ledger
  - `CHECK (quantity >= 0)`
  - no overselling under concurrency
- [ ] Order lookup, cancellation, review submission, moderation, owner-entered reviews.
- [ ] Admin:
  - auth (HMAC cookie, middleware plus `requireAdminSession` in every action and loader)
  - login rate limit
  - dashboard, orders and filters, fulfilment actions, stock adjustment, sold-count baseline
- [ ] SEO: metadata on every page, sitemap, robots (`NEXT_PUBLIC_ALLOW_INDEXING`), FAQ JSON-LD.
- [ ] Build gates: `check:constitution`, `check:messages` (id/en parity), `check:media`, ESLint domain-import rule, the no-Shopee-branding test.

## 2. Reference research (UX patterns only)

**Header**
- Shopee and Tokopedia: logo, a wide search field and the cart in one row. Daraz and Amazon add a category/"All" menu before search.
- Mobile: search *is* the header. The logo shrinks, and the cart/account icons sit on the right.
- **Adopt:**
  - logo, search, "Cek Pesanan" (in place of the account link) and the locale switcher in one row
  - a category nav row on desktop
  - a full-width search row on mobile
  - a static announcement bar holding one real message

**Search**
- Suggestions while typing, then a results grid with sort.
- **Adopt** a simple submit-to-results page with sort and an empty state. No suggestions for now; that needs a larger catalogue.

**Cards**
- A 1:1 image, a 2-line title clamp, a bold price, a strikethrough original with a discount % badge, rating and sold count *only when present*, and location/shipping chips.
- The whole card is the link. The grid is 2 columns on mobile and 4–6 on desktop.
- **Adopt** the same, with a stock badge and a Coming Soon state.

**Product page**
- Gallery with thumbnails on the left; buy box on the right with title, rating line, price block, variants, quantity, two CTAs, delivery estimate and seller/trust block.
- Below: specs table, description, reviews, related products.
- Mobile: sticky bottom bar with Buy.
- Constitution II already mandates the Tokopedia-style sticky bar.

**Trust**
- Payment method logos, COD availability, return policy link, secure checkout note, real review counts, seller info.
- **Adopt** only what is true: Midtrans methods, COD where enabled, the return policy, the order-tracking page.

**Checkout**
- Single page; address first; shipping and payment as selectable cards; a sticky order summary showing the product thumbnail; one primary CTA showing the total.

**Mobile**
- Bottom-anchored CTAs, 44px+ targets, horizontally scrollable rails for secondary sections.

**Avoid**
- Marketplace orange (Shopee `#EE4D2D`) and green (Tokopedia).
- Mascots and dense promo clutter.

## 3. Frontend audit: top 10 by impact on trust and conversion
The audit is code-level; see Context.

1. **Placeholder business information is shown to customers.**
   - Legal pages render "[PLACEHOLDER: nama badan usaha / alamat / email]" (`src/messages/id.json:375-377,417-419`, and en).
   - Every shipping rate is a placeholder (`src/config/shipping.config.ts`). COD is free (no fee, since 2026-10-10).
   - This is the biggest trust break, and it's a content problem rather than a design one. See §7.
2. **Stock is invisible.**
   - There is no stock state on the product page or anywhere else on the storefront.
   - `QuantitySelector` caps at a constant 10, not at stock.
   - Out-of-stock is discovered only when the order is submitted (`actions/checkout.ts:68-75`).
   - Components: `product/PurchasePanel.tsx`, `QuantitySelector.tsx`.
3. **Checkout never shows what is being bought.**
   - There is no product image, name or line item; only totals (`checkout/CheckoutForm.tsx`, `OrderSummary.tsx`).
   - Lookup is the same (`lookup/LookupForm.tsx`).
4. **The product page looks weak.**
   - The gallery is marketing banners with baked-in text, shown `object-contain`, with no thumbnails (`product/Gallery.tsx`).
   - The rating is a plain "★ 4.5 (n)" text line.
   - There's no specs or description block.
   - The title and meta are static messages with a hardcoded price (`produk/[slug]/page.tsx:23-37`).
   - There is no Product JSON-LD and no OG image.
5. **The header isn't a shopping header.**
   - No search, and no product or category entry.
   - The nav is mostly help links.
   - The scrolling marquee announcement hurts readability.
   - The Buy pill is hidden below `sm` (`layout/Header.tsx`, `HeaderBar.tsx`).
6. **Decorative motion makes it look like a template.**
   - Aurora blobs, 3D `TiltCard`, `sheen`, `float-soft`, marquee, and `Reveal` fades on every section (`globals.css`, `[locale]/page.tsx`, `home/ProductShowcase.tsx`, `FinalCta.tsx`, `SocialProof.tsx`).
   - `Reveal` sets content to opacity 0 after hydration, which delays visibility.
7. **Contrast failures (WCAG).**
   - Accent `#C98A3E` on white is 2.92:1. It's used for text and the global focus ring (`globals.css:236`), and in `Wordmark`, `Header` and `Footer`.
   - Input borders use `line` `#E6D6C0`, which is 1.42:1 and fails the 3:1 non-text contrast rule (1.4.11).
8. **Tap targets under 44px.**
   - Form controls use `py-2` app-wide, which is about 40px.
   - Also: the locale switcher links, review stars, and COD/ONLINE radio labels.
   - These were flagged as F1–F4 in `docs/mobile-verification.md` and never fixed (`CheckoutForm`, `ReviewForm`, `LocaleSwitcher`).
9. **Broken or misleading interactions.**
   - Review pagination links to the homepage (`product/Reviews.tsx:67,73`).
   - The sticky bar shows the unit price, not price × quantity (`StickyBuyBar.tsx`).
   - Hand-built hrefs bypass `localeHref`.
10. **The homepage repeats one product five times and still feels empty.**
    - Hero carousel, video band, a single centred showcase card, gallery strip and final CTA each repeat the same image and CTA.
    - Buttons are inconsistent: pills, glow shadows, mixed sizes.
    - There is no catalogue structure (categories, grid, "coming soon").
    - Files: `[locale]/page.tsx`, `home/*`.

**Performance note:** checkout ships 239 kB of first-load JS. The cause is likely `regions.id.json` in the client bundle plus Snap, and `CheckoutForm` imports `product.json` client-side. Lighthouse has never been run (`docs/performance-baseline.md`).

## 4. Redesign strategy

**Per page**
- **Header:**
  - announcement bar (static, one real message)
  - logo, search, Cek Pesanan, ID/EN
  - desktop category row
  - mobile: a search row, plus a drawer with categories and help links
- **Homepage:**
  - hero showing the featured ACTIVE product (keep the art-directed carousel and preload)
  - category tiles
  - "Produk Pilihan" grid of ACTIVE products
  - "Segera Hadir" rail of COMING_SOON products
  - benefits
  - "Cara Pesan" ordering steps
  - payment and delivery info (from real config)
  - reviews (only if any exist)
  - FAQ
  - one final CTA
  - Drop the gallery strip and video duplication: the video moves to the product page gallery.
- **Product page:**
  - gallery with thumbnails, keyboard navigation and swipe on mobile
  - buy box: title, rating (only if reviews exist), price / compare-at / discount, stock badge, stock-aware quantity, Buy now
  - delivery and COD note, payment methods, trust links
  - tabs-free sections: Description, Specifications table, Reviews (fix pagination), related products (same category)
  - sticky mobile bar showing the total
- **Category page (new, `/kategori/[slug]` and `/en/category/[slug]`):** grid, sort (newest, price ↑, price ↓), status filter, empty state.
- **Search page (new, `/cari?q=` and `/en/search?q=`):** reuses the grid.
- **Checkout:**
  - Two columns at `lg`: form on the left, sticky summary with product thumbnail, name, qty and totals on the right.
  - Payment methods as selectable cards; COD-unavailable state explained.
  - Clear error and loading states. Logic is untouched.
- **Confirmation, lookup, review, legal, 404 and error:** restyle with primitives; add the product line to confirmation and lookup.

**A complete-feeling homepage with one live product, honestly:**
- One ACTIVE product, 10 approved COMING_SOON samples, real category tiles, real ordering steps, payment and delivery facts, FAQ.
- No invented numbers.

**Scalability**
- Primitives: `ProductCard` with variants grid and compact, and states active, discounted, out of stock and coming soon.
- `ProductGrid` (2/3/4 columns), `ProductRail` (horizontal scroll), and `SectionHeader` with a "Lihat semua" link.
- Every homepage section takes a `products[]` query result and renders nothing when it is empty.
- One data-access module: `src/infrastructure/db/catalogue.ts`. It returns locale-resolved `ProductView` objects, wrapped in React `cache()`.

**Real data versus hidden sections**
- **Real:**
  - price and compare-at price (only when set)
  - stock state (`StockLevel`)
  - sold count (baseline plus completed orders; hidden when null)
  - published reviews and rating (hidden when there are none)
  - payment methods, COD rules, shipping rates (config, but see §7)
  - categories, products, FAQ
- **Hidden until real data exists:**
  - "Best sellers": needs at least 2 ACTIVE products with completed orders.
  - "Deals": needs any compare-at price.
  - "New arrivals": needs at least 2 ACTIVE products.
  - Testimonials and rating summaries: need published reviews.
- **Never built:**
  - Newsletter: there is no email service, and email is out of scope by constitution.
  - Wishlist: there are no customer accounts, which are also out of scope.
  - Customer counts, "trusted by", or press stats.

## 5. Design system (proposed for CLAUDE.md `## Design System`)

### Brand
- Restrained cream/brown (Constitution II). No Shopee or Tokopedia hues.
- White surfaces on a warm canvas.
- Brown is the action colour. Gold is used only for highlights and stars, never as text on light backgrounds.

### Colour tokens
All contrast ratios below were computed this session.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `canvas` | `#FAF6F0` | Page background | — |
| `surface` | `#FFFFFF` | Cards, header, inputs, panels | — |
| `surface-muted` | `#F3EADD` | Section bands, table header, skeleton | — |
| `ink` | `#2E1B10` | Headings, body, price | 16.40 on surface / 15.23 on canvas / 13.76 on muted |
| `ink-2` | `#5C4434` | Secondary text | 9.01 / 8.37 / 7.56 |
| `ink-3` | `#76604F` | Meta, help text, placeholder | 5.90 / 5.48 / 4.96 |
| `primary` | `#7A4B32` | Primary button bg, links, focus ring | white on it 7.29; on surface 7.29; on canvas 6.77 |
| `primary-hover` | `#643C27` | Hover | white on it 9.47 |
| `primary-active` | `#4E2E1E` | Pressed | white on it 12.11 |
| `primary-soft` | `#F3E7DC` | Selected chip and option bg | primary on it 6.00 |
| `accent` | `#E0A758` | Stars, highlight bars, small fills | ink on it 7.68 |
| `accent-strong` | `#8F5A17` | Accent as text (eyebrows) | 5.76 on surface / 4.92 on accent-soft |
| `accent-soft` | `#FBEBD3` | Highlight bg | ink on it 14.00 |
| `sale` | `#B3261E` | Discount badge bg (white text) | white on it 6.54; on sale-soft 5.55 |
| `success` / `success-soft` | `#1B6B3E` / `#E6F4EC` | In stock, active status | 6.52 / 5.75 |
| `warning` / `warning-soft` | `#8A5300` / `#FFF3DC` | Low stock | 5.76 |
| `danger` / `danger-soft` | `#B3261E` / `#FCE8E6` | Errors | 6.54 / 5.55 |
| `info` / `info-soft` | `#1F5A8C` / `#E7F0F8` | Notices | 6.28 |
| `neutral-badge` / `neutral-badge-bg` | `#3F3A36` / `#ECE7E1` | Coming Soon, out of stock, draft | 9.14 |
| `border` | `#E6D9C8` | Decorative dividers and card outlines (non-essential) | 1.39 |
| `border-strong` | `#9A8471` | Input, select and checkbox borders | 3.55 on surface / 3.30 on canvas (≥3:1 non-text) |
| `disabled-fg` / `disabled-bg` | `#8C7E73` / `#EFEAE4` | Disabled controls | 3.28 (inactive UI is exempt, 1.4.3) |
| Footer band | `ink` bg | Text `#F3EADD`, muted `#C9B8A6`, link hover `accent` | 13.76 / 8.51 / 7.68 |

### Typography
- **Font:** Plus Jakarta Sans, a variable font (OFL, designed in Indonesia), loaded via `next/font/google`:
  - `subsets: ["latin"]`, `display: "swap"`, default `adjustFontFallback`. The size-adjusted fallback means near-zero CLS.
  - Self-hosted at build time, so there is no third-party request.
- It replaces Geist and Geist Mono in both root layouts. Use `tabular-nums` for prices and order numbers. That leaves one family to load.
- Weights: 400 body, 500 UI, 600 headings and buttons, 700 prices and display.
- Scale (mobile → `lg`):

| Style | Mobile | `lg` | Weight |
|---|---|---|---|
| `display` | 28/34 | 40/48 | 700 |
| `h1` | 24/32 | 32/40 | 700 |
| `h2` | 20/28 | 24/32 | 600 |
| `h3` | 18/26 | 20/28 | 600 |
| `body-lg` | 18/28 | 18/28 | — |
| `body` | 16/24 | 16/24 | — |
| `body-sm` | 14/20 | 14/20 | — |
| `caption` | 12/16 | 12/16 | meta only |
| `price-lg` | 28/36 | 28/36 | 700 |
| `price` | 16/24 | 18/24 | 700 |

- Inputs are always at least 16px, which stops iOS from zooming.
- Sentence case everywhere: no uppercase labels, which hurt Indonesian readability.

### Layout
- **Spacing:** Tailwind's 4px scale, restricted to 1, 2, 3, 4, 6, 8, 12, 16, 24.
  - Sections: `py-10` mobile, `py-16` desktop.
  - Card padding: 12 / 16.
  - Grid gap: 12 mobile, 16 at `sm`, 24 at `lg`.
- **Radius:** `sm` 4px (badges), `md` 8px (buttons, inputs, cards), `lg` 12px (panels, modals, PDP image frame). `full` only for count dots and avatars; no pill buttons.
- **Shadows:**
  - `xs`: `0 1px 2px rgb(46 27 16 / .06)`
  - `sm`: `0 2px 8px -2px rgb(46 27 16 / .10)` (card hover, condensed header)
  - `md`: `0 8px 24px -8px rgb(46 27 16 / .18)` (dropdown, drawer, sticky bar)
  - Remove `card`, `lifted` and `glow`.
- **Containers:** `max-w-7xl` (1280) with `px-4 sm:px-6 lg:px-8`. Prose pages use `max-w-3xl`. Checkout `max-w-5xl`. Admin is fluid up to 1440.
- **Breakpoints:** Tailwind defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). QA at 360, 375, 768, 1024 and 1440.
- **Motion:**
  - 150ms ease-out on colour, border and shadow; 200ms for overlays.
  - No transforms on hover.
  - Remove aurora, tilt, sheen, float, marquee, and scroll-reveal on content.
  - Keep the hero carousel's auto-advance: it already pauses on interaction and respects reduced motion.
  - Keep the reduced-motion backstop.

### Components
**Button**
- Sizes: `md` 44px (default), `lg` 48px (product page CTA, sticky bar, checkout submit), `sm` 36px (desktop admin only). `px-4`/`px-5`, radius `md`, 15–16px weight 600.
- Variants:

| Variant | Rest | Hover | Active |
|---|---|---|---|
| `primary` | `primary` bg, white text | `primary-hover` | `primary-active` |
| `secondary` | `surface` bg, 1px `primary` border, `primary` text | `primary-soft` bg | — |
| `ghost` | `ink-2` text | `surface-muted` bg | — |
| `danger` (admin) | `danger` bg, white text | — | — |
| `link` | `primary` text with underline | — | — |

- States:
  - **Focus-visible:** 2px `primary` outline, 2px offset. This replaces the global accent ring.
  - **Disabled:** `disabled-bg` and `disabled-fg`, `cursor-not-allowed`, no hover.
  - **Loading:** keeps its width; a 16px spinner replaces the icon; label reads "Memproses…"; `aria-busy`; non-interactive.
- Primary CTAs are full width below `sm`.

**Input, Select, Textarea**
- 44px high (48 on mobile checkout), `px-3`, 16px text, `surface` bg, 1px `border-strong`, radius `md`.
- Label sits above in 14/20 weight 600 `ink`. Help text in 14 `ink-3`. Optional fields say "(opsional)".
- States:
  - **Hover:** border `ink-3`.
  - **Focus:** border `primary` plus a 2px `primary` outline.
  - **Error:** border `danger`, a 14px `danger` message with an icon below the field, `aria-invalid` and `aria-describedby`.
  - **Disabled:** disabled tokens.
- Radio and checkbox options are bordered option cards, at least 48px high, with the whole card clickable. Selected means a 2px `primary` border on `primary-soft`.

**ProductCard**
- `surface` bg, 1px `border`, radius `md`, no rest shadow. Hover adds shadow `sm`; there is no zoom.
- Image area is 1:1 with `object-cover`; legacy banners use `object-contain` on `surface-muted`.
- Title is a 2-line clamp: 14/20 mobile, 16/24 from `md`.
- Price row: `price`, compare-at in `ink-3` strikethrough, `sale` badge "-15%".
- Optional meta row: rating and sold count, only if real.
- At most 2 badges, overlaid top-left on the image. The whole card is one link; the image has meaningful alt text.
- States:
  - **Coming soon:** neutral "Segera Hadir" badge; the price slot reads "Segera hadir" in `ink-3`; no CTA.
  - **Out of stock:** "Stok habis" badge; the price stays visible.
  - **Loading:** a skeleton of identical dimensions.

**Badge**
- 22px high, `px-2`, radius `sm`, 12/16 weight 600, sentence case.
- Variants:
  - `sale`
  - `neutral` (Segera Hadir, Stok habis, Draf)
  - `success` (Stok tersedia, Aktif)
  - `warning` (Sisa N, shown when stock is 5 or fewer)
  - `info`

**Empty, error and loading states**
- **Empty:** a 40px `ink-3` icon, an `h3` title, one line of body, and one action.
- **Form-level error:** a `danger-soft` box with a 4px `danger` left border, `ink` text and `role="alert"`.
- **Page error:** `error.tsx` with retry.
- **Loading:** route `loading.tsx` skeletons that match the final layout, so nothing shifts.
- **Admin save feedback:** inline "Tersimpan" with `aria-live="polite"`. No toast library.

**Admin**
- Same tokens.
- Sidebar nav (a drawer on mobile).
- Tables with a `surface-muted` header and 44px rows.
- Filters bar, sticky form footer for Save, inline stock editor.

### Mapping to the styling system
- Every token is declared once in `@theme` in `src/app/globals.css` as `--color-*`, `--radius-*`, `--shadow-*` and `--font-sans`. Tailwind v4 generates utilities from them, e.g. `bg-surface`, `text-ink-2`, `border-border-strong`, `rounded-md`, `shadow-sm`.
- Legacy names (`cream`, `brown*`, `accent`, `shell`, `sand`, `gold`, `line`) stay as aliases until Phase 6, then they are deleted.
- `tailwind.config.ts` is deleted in Phase 6. It isn't read by v4.

## 6. Implementation plan

Each phase runs as an SDD feature (`/sp.specify` → `/sp.plan` → `/sp.tasks` → `/sp.implement`) with PHRs and a commit per chunk.

**[BACKEND]** marks a change that touches the DB, an API, server actions, deploy or the payment/stock path. These appear in Phase 2 only.

### Prerequisite before Phase 2 starts
- Docker Desktop is running and `docker compose up -d db` is healthy.
- `npm run test:integration` and `npm run test:concurrency` pass on the **unchanged** code first, to establish a baseline.
- Phase 2 does not start until both hold. That way the payment and stock tests really run against PostgreSQL instead of being skipped.

### Phase 2: data model, categories, status, admin product CRUD (minimal UI), sample seed

Phase 2 is split into three sub-phases. **Each one ends with unit, integration and concurrency tests all green, `typecheck`, `lint` and `check:*` passing, and its own commit.** The numbered items below map to the sub-phases as follows:

- **2a: data foundation and the payment/stock path** (items 0, 1, 2, 3, 4, 5, plus the tests in item 12 that cover them):
  - constitution amendment and ADR
  - `add_catalogue` migration
  - `catalogue:import`
  - domain status logic and the shared zod schema
  - per-product checkout, stock, reviews and sold count
  - updated `helpers/db.ts`
  - new tests: checkout status rejection, per-product stock, oversell per product, import idempotency
  - **Status: done (2026-10-04)** as feature `specs/003-catalogue-database/` (ADR-0004), on
    branch `003-catalogue-database`. Exit gate: unit 286, integration 329, concurrency 3, all
    green; build, parity, COD lifecycle, admin and rollback checks recorded in its
    `quickstart.md`. Deviations, from that plan's Complexity Tracking:
    - **Sitemap** moved from 2c into 2a: dynamic and ACTIVE-only, read from the catalogue
      (`/sp.analyze` C1). The storefront reading through `catalogue.ts` also landed in 2a, with
      identical output.
    - **Dynamic `[locale]` layout**: the header and footer read the featured product from the DB,
      and the build runs before the migration (R-209).
    - **`deploy.sh`** gained the `catalogue:import` step in 2a, pulled forward from 2b (FR-011).
      nginx, backup and env stay in 2b.
- **2b: admin management and infrastructure** (items 6, 7, 10, plus tests):
  - uploads endpoint, image validation and serving route
  - admin products and categories pages, `ProductForm`, `ImageUploader`
  - inline stock editor
  - `deploy.sh`, `nginx.conf`, `backup.sh`, `.env.example`, `env.ts` (`UPLOAD_DIR`)
  - tests: upload validation, admin product actions require a session, inline stock writes the ledger
  - **Status: done (2026-10-05)** as feature `specs/004-catalogue-admin/`, on branch
    `004-catalogue-admin`. No migration, no new dependency. Exit gate: unit 396, integration 416,
    concurrency 4, all green (2a ended at 286 / 329 / 3); `npm run verify` and `npm run build`
    pass; secrets review clean. The local `UPLOAD_DIR` restore rehearsal and the upload and
    products-list timings are in its `quickstart.md` Results. Staging checks (deploy without
    `UPLOAD_DIR`, deploy keeps uploads, nginx 3m/1m, backup and restore of uploads) are recorded
    there as not yet run: no staging VPS. Deviations:
    - **Upload path** is `/admin/api/uploads`, not `/api/admin/uploads`, so the existing
      `/admin` session cookie path and middleware guard cover it (R-301).
    - **Design tokens**: only the colour tokens whose names do not collide with values the
      storefront uses today were added in 2b, so the storefront renders unchanged. `accent`,
      the radius and the shadow tokens wait for Phase 3 (R-315).
    - **Publish gate**: `PUBLISHING_OPEN = false`. New products are DRAFT only, and the existing
      product stays ACTIVE (spec FR-024).
  - **2c note** (**done in 2c**, 005 T006 and T012): flip `PUBLISHING_OPEN` in
    `src/domain/catalogue/publish-gate.ts`, and set `publishedAt` on a product's first
    transition to ACTIVE (which also locks its slug).
- **2c: samples and storefront wiring** (items 8, 9, 11, plus tests):
  - `seed:samples` and `cleanup:samples`, with 10 distinct placeholder images
  - Coming Soon behaviour
  - storefront reads through `catalogue.ts`
  - dynamic, ACTIVE-only sitemap
  - tests: seed run twice still gives 10 rows and leaves the real product untouched; cleanup removes samples only; Coming Soon is not purchasable and not in the sitemap
  - updated `catalogue-media`, `check-media`, `sitemap`, `no-shopee-branding` and homepage tests
  - **Status: done (2026-10-05)** as feature `specs/005-samples-coming-soon/`, on branch
    `005-samples-coming-soon`, in three test-gated sub-phases (2c-1 publishing and unpublish,
    2c-2 Coming Soon and featured product, 2c-3 samples and cleanup). One migration (a CHECK
    constraint), no new dependency, no new copy beyond the planned message keys. Exit gate: unit
    588, integration 492, concurrency 5, all green (2b ended at 396 / 416 / 4);
    `npm run verify` and `npm run build` pass. The 21-row quickstart matrix ran against the local
    dev database (restored afterwards) and the layout check at 360–1440; both are in its
    `quickstart.md` Results. The Midtrans Snap sandbox purchase (#19) is blocked by sandbox keys
    that Midtrans rejects (401); COD and the signed-webhook path pass. Deviations, from that
    plan's Complexity Tracking:
    - **CHECK migration** `Product_sample_coming_soon`: a sample is always COMING_SOON
      (Constitution VII, R-402), so the "activate a sample" flow is: mark as real (one-way, clears
      `isSample`), then price, stock and ACTIVE.
    - **Stricter cleanup**: it keeps a sample with orders, reviews, stock history or stock, not
      only orders (Constitution VI, `Restrict` FKs, R-414), and reports each keep with its reason.
    - **No product line on the order confirmation page**: it is reachable by order number alone
      (Constitution IX, R-410); the product line belongs in the phone-checked lookup (Phase 5).
    - **Featured product = first on sale**, falling back to the first Coming Soon product, so a
      sample can never take the buy links (R-407).
    - **Read-only dry-run**: plain queries, not a rolled-back transaction, so a preview takes no
      locks in production (R-412).
  - **Production run** (operator, after deploying 2c-3; contracts/operator-commands.md):
    1. deploy (runs `prisma migrate deploy`, which adds the constraint);
    2. `npm run seed:samples` and read the plan: expect "would create 10";
    3. `npm run seed:samples -- --apply`: expect "created 10"; a re-run says "nothing to do";
    4. open `/id` and one sample page, and check that `/sitemap.xml` lists no sample;
    5. later, `npm run cleanup:samples` (dry run) then `-- --apply` removes unused samples.

**0. Constitution amendment v1.0.0 → 2.0.0 (MAJOR)**
- Use the documented procedure, with a Sync Impact Report. This is an amendment, not a re-ratification.
- **III:** the PostgreSQL catalogue, managed from the admin area, is the single source of truth.
- **I:** product content is stored bilingually in the DB, and both locales are required. UI chrome stays in message files.
- **VII:** records the approved exception: `isSample` COMING_SOON products in production, with no price, ratings or reviews.
- **X:** the storefront may list multiple products.
- **V/VI unchanged.**
- Plus an ADR `catalogue-in-database`.

**1. [BACKEND/DB] Prisma migration `add_catalogue`, additive only, with no drops**

```prisma
enum ProductStatus { ACTIVE COMING_SOON DRAFT }
model Category { id String @id @default(cuid()) slug String @unique nameId String nameEn String position Int @default(0) products Product[] createdAt DateTime @default(now()) updatedAt DateTime @updatedAt }
model Product {
  id String @id @default(cuid())  slug String @unique  sku String? @unique
  status ProductStatus @default(DRAFT)  categoryId String  category Category @relation(...)
  priceIDR Int?  compareAtPriceIDR Int?          // Int IDR (Principle IV); null allowed only when not ACTIVE
  isSample Boolean @default(false)  position Int @default(0)
  videoUrl String?  videoPosterUrl String?  soldCountBaseline Int @default(0)
  translations ProductTranslation[]  images ProductImage[]  stockLevel StockLevel?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt  publishedAt DateTime?
  @@index([status, categoryId])
}
model ProductTranslation { productId String  locale String /* "id"|"en" */  name String  shortDescription String
  longDescription String  highlights String[]  specs Json /* [{label,value}] zod-validated */
  seoTitle String?  seoDescription String?  @@id([productId, locale]) }
model ProductImage { id String @id @default(cuid())  productId String  url String  width Int  height Int
  altId String  altEn String  orientation String  position Int  @@index([productId, position]) }
```

- Also add nullable `productId` (FK, indexed) to `StockLevel` (`@unique`), `StockChange`, `Order` and `Review`. Add `Order.productNameSnapshot String?`.
- **Why `StockLevel.id` stays `"default"`:**
  - The existing stock row and its ledger are never rewritten, which keeps Principle VI history intact.
  - The previous release still works against the migrated DB, so rollback is a redeploy with no down-migration.
  - New products get `StockLevel { id: product.id, productId }`.
- **Stock is not a column on `Product`.** It stays in `StockLevel` plus the ledger, so every stock change keeps its transaction and audit row.

**2. [BACKEND/DB] Import `scripts/catalogue/import-from-json.ts` (`npm run catalogue:import`)**
- Idempotent: it upserts by slug and never overwrites existing rows.
- Creates category `sandal` (id "Sandal", en "Sandals"; editable).
- Creates the existing product as ACTIVE at 169999 with the same slug. Translations, highlights and image alts are copied from the current id/en message values. Images keep their real dimensions and orientation.
- Links `StockLevel "default"` and backfills `productId` on existing orders, stock changes and reviews. Moves `SOLD_COUNT_BASELINE` into `Product.soldCountBaseline`; the setting row is left in place.
- `product.json` stays as the import source until Phase 6.

**3. Domain logic, pure and unit-tested**

`src/domain/catalogue/status.ts`:
- `isPurchasable`: ACTIVE, price set, stock > 0.
- `isListed`: ACTIVE or COMING_SOON.
- `isIndexable`: ACTIVE.

`src/domain/catalogue/product-schema.ts` holds the **one shared zod schema**, used by the client form and the server action:
- `slug`: matches `^[a-z0-9]+(-[a-z0-9]+)*$`, 3–80 characters, unique (checked on the server).
- `sku`: optional, matches `^[A-Z0-9-]{3,32}$`, unique.
- Per locale:
  - `name` 3–120
  - `shortDescription` 20–200
  - `longDescription` ≤ 5000
  - `highlights` ≤ 6 × 80
  - `specs` ≤ 20 rows; label ≤ 40, value ≤ 200
  - `seoTitle` ≤ 60, `seoDescription` ≤ 160 (Principle VIII)
- `priceIDR`: integer, 1,000–100,000,000.
- `compareAtPriceIDR`: optional; must be greater than `priceIDR` and only allowed when a price is set.
- **ACTIVE requires:** a price, at least 1 image, complete id+en content, and a stock row (it may be 0, which displays as out of stock).
- **COMING_SOON requires:** name, short description and 1 image in both locales. The price is ignored and never rendered.
- **Branding:** a refinement rejects "shopee" not preceded by "toko", which replaces `no-shopee-branding` coverage of the JSON.

**4. [BACKEND/API] Checkout per product** (`actions/checkout.ts`, `create-order.ts`, `order-transaction.ts`, `admin/fulfilment.ts`, `admin/stock.ts`)
- The checkout URL becomes `/checkout?product=<slug>&quantity=N`.
- If `product` is missing and exactly one ACTIVE product exists, use it, so old links keep working. Otherwise redirect home.
- The server loads the product from the DB, rejects anything not ACTIVE, takes the price from the DB, and checks stock on that product's `StockLevel`.
- It writes `Order.productId` plus the name snapshot. Decrement and restore target `StockLevel` by `productId`.
- The Midtrans payload is unchanged: no `item_details`, `gross_amount` still recomputed on the server.
- `CheckoutForm` receives `unitPrice`, `slug` and `name` as props and stops importing JSON.
- **Why:** "activate means purchasable with no code change" is impossible while price and stock are global. Principles V and VI are what force tests here.

**5. [BACKEND] Reviews, sold count and dashboard per product**
- `review-stats.ts` and `sold-count.ts` filter by `productId`.
- The dashboard's `outOfStock` lists ACTIVE products with stock 0.

**6. [BACKEND] Uploads**
- Nothing exists for this today, and `public/` is wiped on every deploy (`deploy.sh` copies it).
- New `UPLOAD_DIR` env, validated by zod (e.g. `/var/lib/tokoshopee/uploads`, outside the release).
- `POST /api/admin/uploads`: `requireAdminSession`, then validate.
- **Image rules:**
  - JPEG, PNG or WebP, checked by magic bytes as well as MIME type.
  - At most 2 MB.
  - At least 800×800; 1200×1200 recommended.
  - Square, 1:1 within ±2%.
  - At most 8 images per product.
  - Alt text required in both id and en.
- Dimensions come from a small header parser in `src/infrastructure/storage/image-header.ts`, so there is no new dependency.
- Files are named `sha256-16.ext`: immutable and deduplicated.
- Served by `src/app/uploads/[file]/route.ts` with an immutable cache header and a path-traversal guard. Middleware already skips dotted paths. `next/image` optimizes them like local files.
- The existing banners are grandfathered: imported as-is, not re-uploaded.

**7. [BACKEND/DEPLOY]**
- `deploy/deploy.sh`: add `mkdir -p $UPLOAD_DIR` and run `catalogue:import` after `migrate deploy`, before `pm2 reload`.
- `deploy/nginx.conf`: set `client_max_body_size 3m` for `/api/admin/uploads` only.
- `deploy/backup.sh`: also `rclone copy` `UPLOAD_DIR`.
- `.env.example` and `src/config/env.ts`: add `UPLOAD_DIR`.

**8. Sample products: `prisma/seed.samples.ts` and `prisma/cleanup.samples.ts` [BACKEND/DB, production]**

`seed:samples`:
- **Dry-run by default; `--apply` writes.** Everything runs in one transaction.
- Aborts unless exactly one ACTIVE non-sample product exists. It reads that product's category.
- For each of the 10 fixed slugs:
  - If the slug exists with `isSample=false`, it **aborts** and never touches real data.
  - If it exists with `isSample=true`, it skips. That makes the script idempotent, and owner edits are preserved.
  - Otherwise it creates the product: COMING_SOON, `priceIDR null`, `isSample true`, id+en translations, 1 image from its own placeholder (below), no `StockLevel`, no reviews.
- **Placeholder images:** 10 distinct files, `public/images/placeholders/sample-01.png` … `sample-10.png`, committed to the repo.
  - Each is 1200×1200 PNG under 200 KB.
  - Each uses its own brand-palette tint: `surface-muted`, `primary-soft`, `accent-soft`, `canvas`, `#EADBC8`, `#E8D5C0`, `#F0E2CD`, `#EDE3D6`, `#F6E9D7`, `#E4D3BF`.
  - Each shows the product name centred in `ink` plus the small wordmark. Text-to-background contrast is checked at ≥ 4.5:1.
  - They are typography on a flat tint, never a product photo or an illustration of a product.
  - They're generated once with no new dependency:
    1. `scripts/catalogue/make-sample-placeholders.ts` writes 10 SVGs.
    2. The locally installed Chrome renders each one to PNG with `--headless --screenshot --window-size=1200,1200`.
    3. The PNGs are committed. The script is kept for regeneration.
  - Placeholder alt text in both id and en reads "Gambar sementara – {name}" / "Placeholder image – {name}".
  - The owner replaces them with real images from the dashboard. Placeholder files that are no longer referenced are removed in Phase 6.
- **Post-checks:** 10 sample rows; the set of ACTIVE products is unchanged; the existing product's `updatedAt` is unchanged.

`cleanup:samples`:
- Dry-run by default.
- Deletes `isSample && status != ACTIVE && no orders`, and reports anything it skipped.

**Activation from the dashboard:** set the price, stock, real images and ACTIVE status. A "Tandai sebagai produk asli" control clears `isSample`.

**Proposed sample names** (id; en translations are written in the Phase 2 PR, and the final copy needs client sign-off):
1. Sandal Slide Cloud Tebal
2. Sandal Jepit Karet Klasik
3. Sandal Rumah Bulu Lembut
4. Sandal Selop Anyaman
5. Sandal Slide Strap Ganda
6. Sandal Platform Kasual
7. Sandal Gunung Tali Velcro
8. Sandal Rumah Waffle
9. Sandal Slide Anak Pastel
10. Sandal Jepit Sol Tebal

Short descriptions describe shape, material and use only. No performance or comparative claims.

**9. Coming Soon behaviour (functional, minimal styling in Phase 2)**
- Product page and cards: badge, no price, no quantity or CTA.
- Product page sets `robots: noindex`.
- Excluded from the sitemap (`sitemap.ts` becomes dynamic and lists ACTIVE only) and from Product JSON-LD (added in Phase 4, ACTIVE only).
- Checkout rejects it on the server.
- DRAFT returns 404.
- Pages are already `force-dynamic`, so a status change takes effect on the next request.

**10. Admin pages (minimal UI)**
- `src/app/admin/products/page.tsx`: table with filters (status, category, search), an inline stock editor that sets the target quantity, and a "Sampel" tag.
- `products/new/page.tsx`, `products/[id]/page.tsx`, `categories/page.tsx`.
- `components/admin/{ProductForm,ImageUploader,InlineStockEditor}.tsx`.
- `actions/admin/{products,categories}.ts`, which call `requireAdminSession` first.
- The inline stock editor reuses the `adjustStock` transaction: it computes the delta, writes the ledger with reason `MANUAL_ADJUSTMENT`, and requires a note.
- No delete action: use DRAFT instead.

**11. Storefront wiring, functional only, no redesign**
- `[locale]/page.tsx`, `produk/[slug]/page.tsx`, `Header`, `Footer`, `pesanan/[n]`, `PurchasePanel` and `StickyBuyBar` read through `catalogue.ts` and build hrefs with `localeHref`.
- `ProductShowcase` lists ACTIVE and COMING_SOON products.
- Product title and meta come from the DB. This fixes the hardcoded price in the message.

**12. Tests**
- Update:
  - `catalogue-media`, which now validates the import source and placeholder
  - `check-media`
  - `sitemap`
  - `no-shopee-branding`
  - `helpers/db.ts`, which seeds a product and `StockLevel` with `productId`
  - homepage tests
- Add:
  - checkout rejects COMING_SOON and DRAFT
  - per-product stock decrement and restore
  - oversell concurrency per product
  - `catalogue:import` run twice stays idempotent
  - `seed:samples` run twice gives 10 rows and the real product untouched
  - `cleanup:samples` removes only samples
  - shared schema unit tests
  - upload validation
- All existing integration and concurrency tests must stay green.

**Risks**
- **Payment and stock path:** guarded by the full existing suite, the new tests, and keeping the `"default"` stock id.
- **Deploy ordering:** if the import hasn't run, the storefront would be empty. The import runs in `deploy.sh` before reload, and the catalogue reader logs and returns a 503 page when there are no products.
- **Uploads on one disk with 2 PM2 workers:** fine on a single VPS, but they must be included in backups.

### Phase 3: primitives, header, footer, homepage (frontend only)
- `globals.css`: new tokens and aliases; delete aurora, sheen, float and marquee.
- Both layouts switch the font to Plus Jakarta Sans.
- `src/components/ui/{Button,Input,Select,Textarea,Field,Badge,Price,Skeleton,EmptyState,Alert,Container,SectionHeader}.tsx`.
- `ProductCard`, `ProductGrid` and `ProductRail`, base version. **Deviation from your split:** these are pulled forward from Phase 4 because the homepage needs them.
- `layout/{Header,HeaderBar,Footer}.tsx`, `AnnouncementBar.tsx`. The header leaves a slot for search, which is wired in Phase 4.
- Homepage sections:
  - `[locale]/page.tsx`
  - `home/{CategoryTiles,PaymentDeliveryInfo}.tsx` (new)
  - restyle `HeroCarousel`, `BenefitsStrip`, `OrderingSteps`, `Faq`, `SocialProof`, `FinalCta`
  - remove `GalleryStrip` and the `VideoSection` band
  - delete `TiltCard.tsx` and `Reveal` usage
- Messages: id+en keys.
- **Risks:**
  - The `homepage-hero` and `homepage-sections` integration tests assert on markup, so they need updating.
  - Hero LCP: keep `HeroPreload`.
  - Message parity.
- No backend changes.

### Phase 4: product page, cards and grid, category page, search
- `produk/[slug]/page.tsx`
- `product/{Gallery (thumbnails),BuyBox,StockBadge,SpecsTable,Description,RelatedProducts}.tsx`
- `PurchasePanel` and `QuantitySelector`: max is the lower of 10 and stock.
- `StickyBuyBar` shows the total.
- Fix the `Reviews` pagination.
- Product JSON-LD (ACTIVE only) and OG image in `infrastructure/seo`.
- New routes:
  - `[locale]/kategori/[slug]/page.tsx` and `[locale]/cari/page.tsx`
  - entries in `i18n/routing.ts` pathnames
  - categories added to the sitemap
- Search is a read-only `ILIKE` over translations through `catalogue.ts`. No schema change.
- **Risks:** `locale-routing`, `metadata` and `sitemap` tests; the canonical and hreflang for the new routes.

### Phase 5: cart and checkout UX (logic untouched)
- **"Cart" means the one-product-per-order flow** (your decision): from the product page's Buy now, to checkout, to Snap or COD, to confirmation. There is no multi-item cart and no change to `actions/checkout.ts`, the domain or the DB.
- If the product or quantity is invalid, checkout shows an empty state ("Belum ada produk dipilih" plus a link to shop) instead of a bare form.
- `checkout/page.tsx`, `CheckoutForm.tsx` (presentation only), `OrderSummary.tsx` (adds the product line), `AddressFields.tsx` (option cards and 48px controls).
- `pesanan/[n]/page.tsx`, `lookup/LookupForm.tsx` (product line), `review/ReviewForm.tsx` (44px stars).
- No multi-item cart, by decision.
- **Risks:**
  - `SnapTrigger`, the submit flow and the error mapping must stay byte-for-byte in behaviour.
  - Tests: `checkout`, `order-journey`, `cancellation`, `lookup`.
  - Optional performance item: lazy-load `regions.id.json`, behaviour-neutral.

### Phase 6: dashboard UI redesign, cleanup and full QA
- **Cleanup:** remove legacy token aliases, delete `tailwind.config.ts` (after confirming `prettier-plugin-tailwindcss` doesn't need it), remove the `product.json` import source, and remove unreferenced placeholders.
- **Live screenshot QA:** every customer-facing page and every admin page at 360, 375, 768, 1024 and 1440, in the empty, loading, error and populated states. This uses a real browser (Claude in Chrome, or Playwright as a dev dependency if you approve it).
- **Lighthouse:** a mobile run on home, product page, category and checkout. Results are recorded in `docs/performance-baseline.md` against the budgets.
- `admin/layout.tsx` sidebar shell with a logout button. The `logout` action already exists but nothing calls it.
- Restyle `products`, `orders`, `stock`, `reviews`, `settings` and `dashboard` with the shared primitives.
- Content pages, 404 and error.
- Delete the legacy token aliases, `tailwind.config.ts` and `product.json` (the import source, once production has been verified).
- **QA:**
  - Live pass at 360, 375, 768, 1024 and 1440 on every page.
  - Lighthouse mobile.
  - axe checks.
  - Console errors, broken links, overflow.
  - The release checklist's live items (F1–F6).
  - Playwright is only an option with your approval of a dev dependency.

## 7. Open questions (blocking)
1. **Business details:** legal entity name, address and contact email. They show as `[PLACEHOLDER]` on the legal pages today. Phase 3's footer and trust block leave contact details out until these exist.
2. **Real shipping rates:** every rate is a placeholder today (COD is free, so no COD fee is needed). Phase 3 and 4 delivery info shows rates as computed at checkout; there will be no "ongkir mulai Rp X" claim until they are real.
3. **Logo:** only a text wordmark exists. Is there a logo or icon file? If not, the wordmark is restyled in the new font. The cream/brown palette is assumed to stay, as Constitution II requires.
4. **Sample products:** approve the 10 names above, the category "Sandal" / "Sandals", and the 10 tinted name-and-wordmark placeholder images. All of these can be edited from the dashboard later.

## Verification of this phase's deliverables
- After approval, `docs/redesign-plan.md` exists with §1–7 in full: Phases 2a/2b/2c through 6, the Docker/Postgres prerequisite, and the open questions.
- `CLAUDE.md` has a `## Design System` section containing §5 (tokens table, typography, layout, component specs, token mapping), and nothing else in it changes.
- `git status` shows only those two files plus the PHR changed. No code changes.

📋 Architectural decision detected: product catalogue moves from a JSON file to PostgreSQL with admin management (constitution v2.0.0). Document reasoning and tradeoffs? Run `/sp.adr catalogue-in-database`. It will be created at the start of Phase 2, not in this phase.
