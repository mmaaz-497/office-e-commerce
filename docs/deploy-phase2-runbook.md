# Phase 2 production deploy runbook

> **Note (2026-10-06): do not use this runbook for the first deploy.** It was written for
> upgrading a running release (001 at `e6c1ad4`) to Phase 2. The site has never been deployed,
> so there is no production release, database, data or uploads to back up, copy or roll back
> to. The first deploy will be a fresh launch, with its own runbook, after the redesign. Parts of
> this document may still be useful as a reference for that runbook: `UPLOAD_DIR`, nginx,
> `deploy.sh` and its build-step hazard, the smoke checks, the 004/005 checks and the sample
> seed.

**Release**: `main` at `b595aca` (merges of `003-catalogue-database`, `004-catalogue-admin` and
`005-samples-coming-soon`, made 2026-10-06). It also carries 002 (homepage), because `main` held
only 001 before these merges.

**Previous release**: expected `e6c1ad4` (001 storefront). This is the only release the rollback
was rehearsed against (2a, `specs/003-catalogue-database/quickstart.md` T052, re-checked for
the 2c schema on 2026-10-06, see [Rollback](#rollback)).

**Environment**: one VPS, no staging. Every check that 004 and 005 left for a staging host is
done here on production, in the order and with the guards given below.

## Status: not yet run

Nothing in this document has been run on the server. Fill in the [Run log](#run-log) as you go:
the date, the output you actually saw, and "skipped" with a reason for anything not done. Never
tick a step that did not run.

## What this release changes on the server

| Area | Change | Source |
|---|---|---|
| Database | 2 migrations: `20261003103900_add_catalogue` (additive tables, nullable columns, CHECKs) and `20261005092513_sample_coming_soon_check` (one CHECK) | 003, 005 |
| Database | `catalogue:import` creates the category and the existing product, links `StockLevel 'default'` to it, backfills `productId` on old orders, ledger rows and reviews, and copies the sold-count baseline | 003 |
| Files | Uploaded images live in `UPLOAD_DIR`, outside the release | 004 |
| `.env` | New required `UPLOAD_DIR` (absolute path). `deploy.sh` refuses to start without it | 004 |
| nginx | New `location = /admin/api/uploads` with `client_max_body_size 3m` | 004 |
| `deploy.sh` | Guards `UPLOAD_DIR`, then runs `catalogue:import` after `migrate deploy` | 003, 004 |
| `backup.sh` | Also copies `UPLOAD_DIR` to the rclone remote | 004 |
| Not in deploy | `seed:samples` (10 Coming Soon products) is a separate, later operator step | 005 |

No new npm dependency needs a system package. `cron` entries are unchanged.

## Known hazards: read before starting

1. **The build deletes the files the running site is served from.** PM2 runs
   `.next/standalone/server.js`. `next build` (Next.js 15.5, `cleanDistDir` on by default)
   starts by deleting `.next` except its cache. From the build step until `pm2 startOrReload`,
   the running workers have no files on disk. Pages already loaded in memory keep working, but
   static assets can 404, and a worker that restarts cannot start. If `deploy.sh` stops after
   the build has started, its message "the previous release is still running" does **not** mean
   the site is healthy. Treat any failure after `==> Building` as a [rollback](#rollback). This
   has been true since 001; this release does not change it. The release copy in step P2 is what
   makes the rollback possible.
2. **Rollback is clean only while the existing product is the only one on sale.** The 001
   release reads and writes only `StockLevel 'default'`. Once a second product is ACTIVE or has
   orders, rolling back would put that product's orders on the wrong stock. The check is in R1.
3. **Midtrans settlement casing: fixed.** `interpretNotification` used to accept a settlement
   only when `fraud_status` was upper-case `"ACCEPT"`, while Midtrans sends `accept`, and it
   left payments without `fraud_status` (Indomaret, Alfamart) pending. Fixed on
   `fix/midtrans-fraud-status`, with tests on the docs' own payloads. Still watch the first real
   online payment (step S10).

## Fill these in first

Run every block from a shell on the server as the user that runs PM2, unless a line says
`sudo`. Set these once per shell:

```bash
APP_DIR=/opt/tokoshopee                 # from deploy/crontab.example; confirm with: pm2 describe tokoshopee | grep 'exec cwd'
APP_USER=$(whoami)                      # the user that owns the PM2 process
DOMAIN=REPLACE_ME                       # production domain, no scheme
NGINX_SITE=REPLACE_ME                   # live site file, e.g. /etc/nginx/sites-available/tokoshopee
UPLOAD_DIR=/var/lib/tokoshopee/uploads  # the value you will put in .env
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE=b595aca05255baa30842b08269285ea9eb23e778
```

Pick a low-traffic window that does not overlap the 03:00 cron backup. Allow 60 minutes for
P1 to S9. The build step usually takes a few minutes.

## Prerequisites

- [ ] `main` at `b595aca` is pushed to the remote the server pulls from. The dev repository has
      no remote configured, so this push has not happened yet.
- [ ] The release checklist items that matter on day one hold for this server
      (`docs/release-checklist.md`): production Midtrans keys, regenerated secrets,
      `NEXT_PUBLIC_ALLOW_INDEXING="true"`.
- [ ] Free disk space for one dump plus one full copy of `$APP_DIR`: `df -h "$APP_DIR" /var/backups`
      and `du -sh "$APP_DIR"`.
- [ ] You have the admin password, and `psql` access to the database through `DATABASE_URL`.

## Pre-deploy

### P1. Back up the production database and verify the backup

1. Take the dump in the same format as `deploy/backup.sh`:

   ```bash
   cd "$APP_DIR"
   mkdir -p /var/backups/tokoshopee
   DUMP=/var/backups/tokoshopee/predeploy-phase2-$STAMP.sql.gz
   ( set -a; . ./.env; set +a; pg_dump "$DATABASE_URL" ) | gzip > "$DUMP"
   ls -l "$DUMP"
   ```

2. Check that the file is complete:

   ```bash
   gzip -t "$DUMP" && echo gzip-ok
   gunzip -c "$DUMP" | grep -c '^-- PostgreSQL database dump complete'   # 1
   gunzip -c "$DUMP" | grep -c '^COPY public\.'   # 10 on the 001 schema: 9 tables + _prisma_migrations
   ```

3. Record the live row counts, which the restored copy must match:

   ```bash
   ( set -a; . ./.env; set +a; psql "$DATABASE_URL" -At -F ' ' ) <<'SQL' | tee /var/backups/tokoshopee/predeploy-counts-$STAMP.txt
   SELECT 'Order', count(*) FROM "Order"
   UNION ALL SELECT 'StockChange', count(*) FROM "StockChange"
   UNION ALL SELECT 'Review', count(*) FROM "Review"
   UNION ALL SELECT 'OrderStatusEvent', count(*) FROM "OrderStatusEvent"
   UNION ALL SELECT 'stock_default', quantity FROM "StockLevel" WHERE id = 'default'
   UNION ALL SELECT 'latest_order', max("orderNumber") FROM "Order";
   SQL
   ```

   Orders can arrive between the dump and this query. If the counts differ in the next step,
   re-run both.

4. Restore the dump into a scratch database (never over the live one) and compare:

   ```bash
   sudo -u postgres createdb tokoshopee_predeploy_check
   gunzip -c "$DUMP" | sudo -u postgres psql -q -v ON_ERROR_STOP=1 tokoshopee_predeploy_check
   sudo -u postgres psql -At -F ' ' tokoshopee_predeploy_check <<'SQL'
   SELECT 'Order', count(*) FROM "Order"
   UNION ALL SELECT 'StockChange', count(*) FROM "StockChange"
   UNION ALL SELECT 'Review', count(*) FROM "Review"
   UNION ALL SELECT 'OrderStatusEvent', count(*) FROM "OrderStatusEvent"
   UNION ALL SELECT 'stock_default', quantity FROM "StockLevel" WHERE id = 'default'
   UNION ALL SELECT 'latest_order', max("orderNumber") FROM "Order";
   SQL
   sudo -u postgres dropdb tokoshopee_predeploy_check
   ```

   **Pass**: `ON_ERROR_STOP` raised no error, and every line equals the live counts. If the
   restore fails, stop: there is no usable backup.

5. Copy the dump off the server. The rollback depends on it if the server is lost:

   ```bash
   ( set -a; . ./.env; set +a; rclone copy "$DUMP" "${BACKUP_RCLONE_REMOTE:?no rclone remote configured}" )
   ```

   If no rclone remote is configured yet, copy it to your own machine with `scp` instead, and
   record which you did.

### P2. Copy the current release

```bash
cd "$APP_DIR"
git rev-parse HEAD | tee "$HOME/predeploy-head-$STAMP.txt"   # expected e6c1ad4c0b10de9cba7e609f4ddb6f4deb70a767
git status --short                                         # expected empty
pm2 describe tokoshopee | grep -E 'status|exec cwd|script path'
sudo cp -a "$APP_DIR" "$APP_DIR.pre-phase2"
sudo du -sh "$APP_DIR" "$APP_DIR.pre-phase2"
ls "$APP_DIR.pre-phase2/.next/standalone/server.js"
```

- If `HEAD` is not `e6c1ad4`, **stop**. The rollback was rehearsed only for that release.
- If `git status` shows local edits, note them. The checkout in P5 refuses to overwrite them.
- `cp -a` keeps owners, modes and the built `.next/standalone`, so rolling back needs no build.

### P3. Create `UPLOAD_DIR` with the right owner and permissions

The app serves uploads itself through `/uploads/[file]`, so nginx needs no access. Only
`$APP_USER` (PM2 and the backup cron) reads or writes it.

```bash
sudo install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$(dirname "$UPLOAD_DIR")" "$UPLOAD_DIR"
stat -c '%U:%G %a %n' "$(dirname "$UPLOAD_DIR")" "$UPLOAD_DIR"   # expect $APP_USER:$APP_USER 750, both
touch "$UPLOAD_DIR/.write-test" && rm "$UPLOAD_DIR/.write-test" && echo writable
case "$UPLOAD_DIR" in "$APP_DIR"/*) echo "!! inside the release, choose another path";; *) echo outside-release;; esac
```

### P4. Change nginx and test it

1. Back up the live site file, then add the block from `deploy/nginx.conf` (the
   `location = /admin/api/uploads { … }` block in the 443 server, placed before `location /`)
   to `$NGINX_SITE`. Change nothing else. The server-wide `client_max_body_size 1m;` stays.

   ```bash
   sudo cp -a "$NGINX_SITE" "$NGINX_SITE.pre-phase2-$STAMP"
   sudoedit "$NGINX_SITE"
   sudo diff -u "$NGINX_SITE.pre-phase2-$STAMP" "$NGINX_SITE"   # only the new location block
   ```

2. Test the configuration, and reload only if the test passes:

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   sudo nginx -T 2>/dev/null | grep -n -A2 'location = /admin/api/uploads'
   ```

   Until the deploy, that location proxies to the old release, which has no such route. That is
   harmless. If `nginx -t` fails, restore the `.pre-phase2` file and run `nginx -t` again.

### P5. Check out the release

The running site is unaffected: PM2 serves the built `.next/standalone`, not the source.

```bash
cd "$APP_DIR"
git fetch
git checkout main
git merge --ff-only "$RELEASE"   # the tested merge; later main commits are docs only
git rev-parse HEAD               # must equal $RELEASE
git log --oneline --first-parent -4
```

### P6. Staging check 004 #14 on production: `deploy.sh` refuses without `UPLOAD_DIR`

This runs `deploy.sh` once, before `UPLOAD_DIR` is in `.env`. It must stop at the guard, which
comes right after `source .env` and before anything changes.

```bash
cd "$APP_DIR"
grep -c '^UPLOAD_DIR=' .env      # must print 0; if 1, skip this check and record "skipped: already set"
./deploy/deploy.sh; echo "exit=$?"
```

**Pass**: exactly one line, `!! UPLOAD_DIR must be set to an absolute path in .env — see
.env.example`, then `exit=1`. No `==> Preparing`, no `==> Installing`. If you see
`==> Installing dependencies`, press Ctrl-C at once and record it as a failure. `node_modules`
may be partly replaced, but the running site is unaffected until the build step.

### P7. Add `UPLOAD_DIR` to the server `.env`

```bash
cd "$APP_DIR"
cp -a .env "$HOME/env.pre-phase2-$STAMP"
printf '\n# Uploaded product images (004). Absolute, outside the release.\nUPLOAD_DIR="%s"\n' "$UPLOAD_DIR" >> .env
grep -n '^UPLOAD_DIR=' .env      # exactly one line
stat -c '%a %U' .env             # mode and owner unchanged from before
```

## Deploy

### D1. Run `deploy.sh`

```bash
cd "$APP_DIR"
./deploy/deploy.sh 2>&1 | tee "$HOME/deploy-phase2-$STAMP.log"; echo "exit=${PIPESTATUS[0]}"
```

The script's order, and what to expect at each step:

| # | Step | Expected | If it fails |
|---|---|---|---|
| 1 | `source .env`, `UPLOAD_DIR` guard | silent | nothing changed; fix `.env`, re-run |
| 2 | `mkdir -p` and `chmod 750` on `UPLOAD_DIR` | `==> Preparing the upload directory` | nothing changed; fix the owner (P3), re-run |
| 3 | `npm ci` | `==> Installing dependencies` | the site still serves; fix, re-run |
| 4 | `npm run build` (prebuild runs `check:constitution`, `check:messages`, `check:media`) | `==> Building`, then the route table | **from here the site is degraded (hazard 1)**: go to [Rollback](#rollback) unless the fix is immediate |
| 5 | copy `public`, `.next/static`, `.env` into `.next/standalone` | `==> Copying static assets` | rollback |
| 6 | `npx prisma migrate deploy` | applies `20261003103900_add_catalogue` and `20261005092513_sample_coming_soon_check`, then "All migrations have been successfully applied" | rollback; then `npx prisma migrate status` and record it. Do not run `migrate dev` or `migrate resolve` without a plan |
| 7 | `npm run catalogue:import` | `category created=1`, `product created=1 skipped=0`, `stock link … linked=1`, `backfill orders=N stockChanges=M reviews=K` (N, M, K about the P1 counts), `baseline copied=…`, `catalogue import complete` | exit 1 (error) or 2 (conflict) wrote nothing: rollback, keep the log |
| 8 | `pm2 startOrReload ecosystem.config.js --env production --update-env` | `==> Deploy complete` | `pm2 logs tokoshopee --lines 100`; rollback if it doesn't come up |

The build does not read the database. On 2026-10-06 it was built on the dev machine with
`DATABASE_URL` pointing at a database that does not exist, and it passed. Building before the
migration is therefore safe against the 001 schema.

### D2. Immediately after

```bash
pm2 status tokoshopee                       # 2 instances, online, restarts not climbing
npx prisma migrate status                   # "Database schema is up to date!"
npm run catalogue:import                    # second run: "nothing to do", exit 0
( set -a; . ./.env; set +a; psql "$DATABASE_URL" -At ) <<'SQL'
SELECT count(*) FROM "Order" WHERE "productId" IS NULL;        -- 0
SELECT count(*) FROM "StockChange" WHERE "productId" IS NULL;  -- 0
SELECT count(*) FROM "Review" WHERE "productId" IS NULL;       -- 0
SELECT quantity FROM "StockLevel" WHERE id = 'default';        -- same as P1
SELECT conname FROM pg_constraint WHERE conname = 'Product_sample_coming_soon';
SELECT count(*) FROM "Product" WHERE "isSample";               -- 0 (samples come later)
SQL
```

## Post-deploy smoke checks

Use a private browser window and a phone-width window (375 px) as well as desktop. Record each
result in the run log. `curl` lines run from your own machine, not the server.

- [ ] **S1. Both locales.** `/id` and `/en` load, with the hero, the existing product with its
      price, and no console errors.
      `curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/id https://$DOMAIN/en` gives
      `200 200`.
- [ ] **S2. Product page.** `/id/produk/<slug>` and `/en/product/<slug>` show price, stock state,
      sold count and reviews as before, and the buy button works.
- [ ] **S3. One COD order, then cancel it.** Place an order for quantity 1, paying by COD.
      Use your own phone number and the name "UJI DEPLOY", so it is easy to find later. Note
      the order number and the stock before. Then:
      1. The order shows `COD_PENDING` in `/admin/orders`. Stock is unchanged.
      2. Confirm it in admin: stock goes down by 1.
      3. Cancel it in admin: stock is back to the value from before.
      4. Its two `StockChange` rows, `ORDER_CONFIRMED −1` and `ORDER_CANCELLED +1`, carry the
         product's id:
         `SELECT reason, delta, "productId" FROM "StockChange" WHERE "orderId" = (SELECT id FROM "Order" WHERE "orderNumber" = '<number>');`

      The order stays in the database as `CANCELLED`. Orders are never deleted. Record its number.
- [ ] **S4. Admin login.** `/admin/login` works. `/admin/products` lists the existing product,
      ACTIVE.
- [ ] **S5. A stock edit.** Use the inline stock editor on `/admin/products`: +1 with the note
      "deploy check", save, then −1 with the same note. Stock returns to its value, and two
      `MANUAL_ADJUSTMENT` rows remain in the ledger, which is expected.
- [ ] **S6. One image upload.** Open the existing product's edit page and pick a real
      1200 × 1200 JPEG in the image uploader. The upload happens on pick: the preview loads
      from `/uploads/<16 hex>.jpg`. **Leave the page without saving**, so the product does not
      change. The file stays in `UPLOAD_DIR`; uploads are never deleted. Record the name, then:
      - `curl -sI https://$DOMAIN/uploads/<name>` gives `200`, `content-type: image/jpeg` and
        `cache-control` with `immutable`.
      - `ls -l "$UPLOAD_DIR"` on the server shows the file, owned by `$APP_USER`.
- [ ] **S7. Sitemap.** `curl -s https://$DOMAIN/sitemap.xml` lists both locales and the product
      page, and no draft or sample slug. `robots.txt` allows crawling.
- [ ] **S8. Server logs.**
      `pm2 logs tokoshopee --lines 200 --nostream` shows no errors, no `Invalid environment
      configuration`, and no `StockLevel row … missing`. Also check
      `sudo tail -n 100 /var/log/nginx/error.log`.
- [ ] **S9. Cron still works.** The next expiry job run (every 5 minutes) logs success in
      `/var/log/tokoshopee/expire-orders.log`.
- [ ] **S10. First real online payment (when it happens).** The order must reach `PAID`. If it
      stays `PAYMENT_PENDING`, compare its `ProcessedNotification` row (`transactionStatus`,
      `statusCode`; `fraud_status` is not stored) with the transaction in the Midtrans
      dashboard. Mark it paid by hand only with the dashboard showing settlement.

## Staging checks from 004 and 005, done on production

Each of these was recorded "not yet run: no staging VPS". Run them only after S1–S8 pass.

| Check | When | How on production, safely | Pass |
|---|---|---|---|
| **004 #14** `deploy.sh` without `UPLOAD_DIR` | P6 | done before `UPLOAD_DIR` is in `.env`; the guard runs before any change | one `!!` line, exit 1, nothing else |
| **004 #15** a deploy keeps an uploaded image | at the next deploy, or now | Now: re-run `./deploy/deploy.sh` on the same commit (import prints "nothing to do"). This repeats hazard 1 for a few minutes, so do it only in the same quiet window. Otherwise, do it at the next real deploy. Then `curl -sI https://$DOMAIN/uploads/<S6 name>` | `200`, same bytes (`sha256sum` on the server before and after) |
| **004 #16** nginx limits | after S8 | `nginx -t` was done in P4. Then, from your machine: `head -c 2621440 /dev/urandom > /tmp/big.bin`, then: (a) `curl -s -i -X POST -F file=@/tmp/big.bin https://$DOMAIN/admin/api/uploads`, no cookie. This tests only the body limit; the app checks the session first. (b) `curl -s -i -X POST --data-binary @/tmp/big.bin https://$DOMAIN/id/checkout` | (a) the app's JSON `401 {"error":"unauthorized"}`, which proves nginx let 2.5 MB through to the app. (b) nginx's HTML `413 Request Entity Too Large`; nothing reaches the app |
| **004 #16b** the app's own size limit | optional | in the admin product form, pick a 2.1 MB image, without saving | the form shows the "too large" message, from the app's `413 tooLarge` |
| **004 #17** `backup.sh` copies uploads; restore drill's uploads step | after S6 | `./deploy/backup.sh` by hand; `rclone ls "$BACKUP_RCLONE_REMOTE/uploads"` lists the S6 file. Restore into a **scratch** directory, never into `UPLOAD_DIR`: `rclone copy "$BACKUP_RCLONE_REMOTE/uploads" /tmp/uploads-restore-check`, then `sha256sum` both copies, then `rm -rf /tmp/uploads-restore-check` | listed; hashes equal |
| **004 #20** timings | after S6 | `curl -w '%{time_total}\n'` on `/admin/products` five times with your admin cookie, and the S6 upload time from the browser's network tab | each under 1 s; record the real numbers |
| **005 #6** sample constraint present | D2 | the `pg_constraint` query in D2; do **not** try a violating `UPDATE` on production | one row `Product_sample_coming_soon` |
| **005 #9, #19** sitemap, existing product purchasable by COD | S3, S7 | covered by S3 and S7 | as there |
| **005 #19** Snap purchase | not run | needs a real payment; covered by S10 when the first real online order arrives | `PAID` |
| **005 #7, #8, #10** Coming Soon storefront | after the sample seed | see [Sample seed](#sample-seed-separate-later-step) | as there |
| **Restore drill** (`docs/restore-drill.md`) | within a week | P1 step 4 restored a dump on this server, but the drill wants the copy fetched from the remote onto another machine. Run it and fill in its log | per that document |

## Rollback

Rehearsed in 2a: the 001 release (`e6c1ad4`) ran against the migrated database, took a COD
order and had it confirmed, with no errors. The order and its ledger row were written with
`productId` null. On returning to the new release, `catalogue:import` attributed them
(`backfill orders=1 stockChanges=1`), and a second run printed `nothing to do`. Re-checked on
2026-10-06 for the 2c schema: a scratch database migrated with all four migrations, then
`prisma migrate deploy` run from the 001 tree, gave "No pending migrations to apply", exit 0.
It leaves the new tables, columns and CHECK constraints alone. 001 never writes `Product`, so
the 2c CHECK cannot fire.

**Rollback is a code swap, not a database restore.** The schema change is additive and the
001 release ignores it. Restoring the P1 dump would lose every order placed since. That is the
last resort in R5.

### R1. Decide

Roll back if any of these happens: a failure in `deploy.sh` from the build step on; the site or
checkout broken in S1–S3; errors in S8 that are not understood in 15 minutes. First check that
rollback is still clean (hazard 2):

```sql
SELECT count(*) FROM "Product" WHERE status = 'ACTIVE' AND NOT "isSample";   -- must be 1
SELECT count(*) FROM "Order" o JOIN "Product" p ON p.id = o."productId"
 WHERE p.slug <> '<existing product slug>';                                -- must be 0
```

If either query fails its expectation, do not roll back. Fix forward instead.

### R2. Swap the release back

```bash
sudo mv "$APP_DIR" "$APP_DIR.failed-$STAMP"
sudo cp -a "$APP_DIR.pre-phase2" "$APP_DIR"     # keep .pre-phase2 untouched for a second attempt
cd "$APP_DIR"
git rev-parse HEAD                               # e6c1ad4…
pm2 delete tokoshopee
pm2 start ecosystem.config.js --env production
pm2 save
pm2 status tokoshopee
```

`delete` then `start`, not `reload`. Reload keeps the process's stored settings, while a fresh
start reads them from the restored tree. Expect a few seconds of downtime. Do **not** run the
old `deploy.sh`: the copy is already built. If you must, its `migrate deploy` is harmless (see
above), but its build has hazard 1 again.

The copy has its own pre-P7 `.env`, without `UPLOAD_DIR`, which 001 does not read. Leave the
nginx block, `UPLOAD_DIR` and its files in place: they are harmless to 001.

### R3. Check the old release

`/id` and `/en` load, the product page or homepage of 001 shows the product, `/admin/login`
works, and `pm2 logs` is clean. Place nothing unless needed. Any orders taken now get
`productId` null; the next deploy attributes them.

### R4. Roll forward later

Fix the cause on the dev machine, then repeat from P5 (P1 and P2 again if days have passed).
`catalogue:import` in the next deploy attributes every order and ledger row made under 001 in
the meantime, and prints the counts under `backfill`.

Known limitation (003 spec): a sold-count baseline changed after this deploy is not seen by 001
after a rollback. It is kept on the product and shows again after roll-forward.

### R5. Last resort: restore the database

Use this only if the database itself is damaged, for example a migration failed half-way and
001 errors on it. Everything written after the P1 dump is lost: compare `latest_order` from P1
with the live value first, and write down the orders in between.

```bash
pm2 stop tokoshopee
sudo -u postgres psql -c "ALTER DATABASE tokoshopee RENAME TO tokoshopee_failed_$STAMP"
sudo -u postgres createdb -O tokoshopee tokoshopee
gunzip -c "$DUMP" | sudo -u postgres psql -q -v ON_ERROR_STOP=1 tokoshopee
pm2 start tokoshopee      # the 001 release from R2
```

The database name and owner `tokoshopee` are the `.env.example` defaults; use the ones in the
server's `DATABASE_URL`. The renamed database is kept for investigation. Never drop it during
the incident.

## Sample seed (separate later step)

Not part of the deploy. Run it only after S1–S8 have passed and the release has run cleanly
for at least a day. The samples are 10 COMING_SOON products, with no price, ratings or reviews,
and typographic placeholder images (Constitution VII exception). After the seed, a rollback to
001 still works, because 001 ignores `Product`, but the seed then has to be considered part of
the release.

1. Dry-run first, and read the plan:

   ```bash
   cd "$APP_DIR"
   npm run seed:samples; echo "exit=$?"
   ```

   Expect `mode dry-run`, `create 10 …`, `result would create 10`, `exit=0`. Exit 2 (`refused:
   expected exactly one ACTIVE real product` or `slug … belongs to a real product`) means stop
   and investigate; nothing was written.

2. Apply:

   ```bash
   npm run seed:samples -- --apply; echo "exit=$?"
   npm run seed:samples -- --apply; echo "exit=$?"   # idempotent: "nothing to do", skip 10
   ```

   Expect `result created 10`, `exit=0`, then `result nothing to do`. The command holds a
   table lock on `Product` for its one short transaction. The existing product's `updatedAt`
   does not change (post-check).

3. Check (005 #7, #8, #9, #10):
   - `/id` and `/en`: the existing product first, with its price, then 10 cards with the
     "Segera Hadir" / Coming Soon badge and no price.
   - One sample page: the badge, no price, buy button or reviews, and
     `<meta name="robots" content="noindex…">`.
   - `/sitemap.xml`: no sample slug.
   - `https://$DOMAIN/id/checkout?product=<sample slug>` redirects to the product page.

4. Undo, if wanted: `npm run cleanup:samples` (dry-run, lists what it would delete and what it
   keeps, with reasons), then `npm run cleanup:samples -- --apply`. It deletes only samples
   with no orders, reviews, stock or stock history, and never a real product.

## Run log

| Step | Date (UTC) | Operator | Result / output | Notes |
|---|---|---|---|---|
| P1 backup, verify, off-server copy | | | | |
| P2 release copy, HEAD | | | | |
| P3 `UPLOAD_DIR` | | | | |
| P4 nginx `-t`, reload | | | | |
| P5 checkout `b595aca` | | | | |
| P6 004 #14 | | | | |
| P7 `.env` | | | | |
| D1 `deploy.sh` | | | | |
| D2 migrate status, import re-run, queries | | | | |
| S1–S9 | | | | |
| 004 #15, #16, #17, #20 | | | | |
| Sample seed | | | | |
| Rollback (if used) | | | | |

Once the run is complete, update `docs/restore-drill.md`, `docs/staging-verification.md` and
the "not yet run" rows in `specs/004-catalogue-admin/quickstart.md` with what was actually
observed.
