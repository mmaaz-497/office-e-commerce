# Release Checklist

**Satisfies**: FR-011a; spec D-002, D-003; FR-052, SC-012.

Mirrors `specs/001-tokoshopee-storefront/quickstart.md`'s "Deployment (VPS)" and "Release
checklist" sections, expanded with the exact verification command for each item so this is a
check to run, not prose to remember. Every box must be checked before real customers reach this
store — the consequence of skipping the first one is that it silently ships production business
figures the previous section describes as invented.

## Commercial and content placeholders

- [ ] **`grep -r PLACEHOLDER src/config/ src/messages/` returns nothing.** As of this writing it
      returns 43 hits in `shipping.config.ts` (every zone rate and the COD-disabled province
      list; COD is free, so there is no COD fee) and 10 hits in each message file (store legal
      name, address and contact email, each repeated across `howToOrder`, `terms`, `privacy`,
      and `returns`; the return window is set to 7 days). **The store charges invented shipping rates and displays a
      fake legal address until every one of these is replaced with a client-supplied figure.**
- [ ] Opening stock set to the real figure via the admin stock page (not left at whatever the
      dev seed produced).
- [ ] Sold-count baseline set via the admin settings page, or deliberately left at zero so the
      "N terjual" figure stays hidden (FR-053) rather than showing a wrong number.

## Payments

- [ ] `MIDTRANS_IS_PRODUCTION="true"` in the production `.env`, with production
      `MIDTRANS_SERVER_KEY`/`MIDTRANS_CLIENT_KEY` — sandbox (`SB-Mid-…`) keys absent from the
      server entirely, not just unused.
- [ ] The Midtrans dashboard's notification URL points at the production domain's
      `/api/webhooks/midtrans`, not sandbox or staging.

## Secrets

- [ ] `ADMIN_PASSWORD_HASH` regenerated for production (`tsx scripts/hash-password.ts
      '<new password>'`) — the development password is not reused.
- [ ] `SESSION_SECRET` and `JOB_SECRET` freshly generated for production (each a long random
      string; rotating either invalidates every existing admin session / breaks the cron job
      until updated together).

## Data honesty (Constitution Principle VII, FR-052, SC-012)

- [ ] **No demo reviews or demo orders in the production database** —
      `npm run seed:dev` has never been run against it. `prisma/seed.dev.ts` refuses to run
      when `NODE_ENV=production` or when `DATABASE_URL` matches the configured production host,
      but a refusal that's never been tested is itself untested — confirm the guard actually
      fires against the real production `DATABASE_URL` at least once.
      Verify by count, not by trusting the guard alone:
      `SELECT count(*) FROM "Review" WHERE origin != 'CUSTOMER'` should match only reviews the
      owner deliberately entered by hand through the admin area, and
      `SELECT count(*) FROM "Order"` should match real orders only.

## Correctness checks (run these, don't just read them)

- [ ] `npm run check:messages` passes — both locales complete, no drift.
- [ ] `npm run test` (or `npm run verify`) passes, including
      `tests/integration/metadata.test.ts` (T124) and
      `tests/integration/snapshot-immutability.test.ts` (T135).
- [ ] Every public page has a unique title ≤60 chars and a description of 140-165 characters in
      both locales (SC-011) — covered by the metadata test above, not a separate manual pass.

## Performance

- [ ] Lighthouse mobile run confirms the product page is interactive under 3s and the checkout
      flow reaches confirmation under 2s (excluding the payment provider's own redirect), both
      throttled to mid-range Android over 4G. Full context and the one number actually measured
      so far (production JS bundle size per route) in `docs/performance-baseline.md` (T136) —
      it flags the checkout page's 239 kB First Load JS as the one most likely to need a real
      measurement first.

## Network and infrastructure

- [ ] PostgreSQL unreachable from the public internet — both `listen_addresses = 'localhost'`
      **and** a firewall rule, verified from **off** the server with `nc -zv <domain> 5432`
      (must fail). Full procedure and log: `docs/postgres-network-verification.md` (T132).
- [ ] HTTPS enforced, HTTP redirects to HTTPS, HSTS header present (`deploy/nginx.conf`).
- [ ] `NEXT_PUBLIC_ALLOW_INDEXING="true"` in the production `.env` — it defaults to `"false"`
      (blocking all crawling) specifically so a deployment that forgets to set this fails
      closed. Confirm `robots.txt` actually allows indexing in production and blocks it on
      staging (T134), and that `sitemap.xml` lists both locales for every static route.
- [ ] Backup has been **restored once** into a scratch database. An untested backup is an
      assumption, not a recovery plan. Full procedure and log: `docs/restore-drill.md` (T130).
- [ ] Cron entries installed from `deploy/crontab.example` (expiry job every 5 minutes, nightly
      backup) — confirm with `crontab -l`, not just that the file exists.

## Deploying

```bash
npm run build                  # standalone output (next.config.ts: output: "standalone")
npx prisma migrate deploy      # explicit step; never `migrate dev`, never auto-sync
pm2 startOrReload ecosystem.config.js --env production --update-env
```

Or run `deploy/deploy.sh`, which does exactly this in order and refuses to reload PM2 if the
migration step fails.
