# Owner email on every new order

Every time a customer places an order (COD, or online once its Midtrans payment session exists),
the store emails the owner a short summary with a link to the order in the admin. The email is
sent through [Resend](https://resend.com) on its free plan (100 emails a day, 3,000 a month,
checked 2026-11-08).

## What the email contains

Order number, time (WIB), product, size, quantity, total, payment method and city, plus a
"Lihat pesanan" link to `/admin/orders/<order number>`. It never contains the buyer's name, phone,
email or street address: those stay in the admin. Online orders say "Online, menunggu pembayaran";
the admin order page shows whether they were later paid or expired.

## How it works

1. Placing an order writes an `OwnerNotification` row in the same transaction, so a placed order
   always has one.
2. Right after the customer's response, the app sends it (Next.js `after()`); the customer never
   waits for it, and a failure never affects the order.
3. The expiry job (`/api/jobs/expire-orders`, every 5 minutes from cron) sends anything still
   pending. Its JSON response reports `ownerEmails`: `{ sent, failed }`, `"off"` or `"error"`.
4. Each order is emailed once: rows are claimed before sending, and Resend's idempotency key
   (`owner-new-order/<order number>`) drops repeats. After 12 failed attempts (about an hour), a
   row is marked `FAILED` and the error is logged.

Orders placed before this feature have no row and are never emailed.

## One-time setup

1. Sign up at resend.com **with the address that should receive the emails**, the owner's
   asadaliblogger0266@gmail.com (chosen 2026-11-08). Without your own verified domain, Resend
   only delivers to the account's own address.
2. In Resend → API Keys, create a key with "Sending access" and copy it (shown once).
3. Add both lines to the server's `.env` (and your local `.env` if you want emails in
   development):
   ```
   RESEND_API_KEY="re_..."
   ORDER_NOTIFY_EMAIL="asadaliblogger0266@gmail.com"
   ```
   Without `ORDER_NOTIFY_EMAIL` the email goes to the store contact address
   (blooginga@gmail.com). Optional: `EMAIL_FROM` (default: `Tokoshopee <onboarding@resend.dev>`).
4. Restart the app: `pm2 restart tokoshopee`.
5. Place a test order. If the email is in Spam, mark it "Not spam"; optionally add a Gmail filter
   that labels it "Pesanan baru".

## Deploy

The release adds one migration (`20261108120000_owner_notification`, a new table only). The usual
`deploy.sh` runs `prisma migrate deploy`. Rollback: redeploy the previous release; the new table
can stay, or be dropped with
`DROP TABLE "OwnerNotification"; DROP TYPE "OwnerNotificationStatus";`.

## Troubleshooting

- **No email, job reports `"off"`:** `RESEND_API_KEY` is not set in the app's environment; set it
  and restart.
- **No email, rows stay `PENDING` with `lastError` 401 or 403:** the key is wrong, or the recipient
  is not the Resend account's address. Fix it in `.env` and restart; the next job run sends the
  pending ones.
- **`lastError` 403 "You can only send testing emails to your own email address (…)":** the API
  key belongs to a Resend account registered with a different address than `ORDER_NOTIFY_EMAIL`.
  Either create the Resend account (and key) with the recipient's address, or verify a domain in
  Resend and set `EMAIL_FROM` to an address on it (seen 2026-11-09).
- **`lastError` "Resend unreachable: … timeout":** the connection to Resend stalled. Each send
  already tries 3 times; the next job run tries again.
- **Row `FAILED`:** check the log line `Owner email for TKS-... failed`. To retry it, set it back:
  `UPDATE "OwnerNotification" SET status = 'PENDING', attempts = 0 WHERE "orderId" = '...';`
- **Daily limit reached (100 on the free plan):** orders still work; the rest are retried and go
  out once the limit resets, unless they have reached 12 attempts.

## Privacy

The email provider sees the order summary above (no name, phone or address). The privacy policy
does not yet mention an email provider; update `privacy.*` in `src/messages` when the owner
approves the wording.
