#!/usr/bin/env bash
# Deployment script (research.md R-017). Run from the repository root on the
# VPS, after a `git pull` to the commit being released.
#
# Order matters and is deliberate: build first (so a broken build never
# reaches `pm2 reload`), then `prisma migrate deploy` — NEVER `migrate dev`,
# which can prompt interactively and is meant for local development, and
# NEVER any form of schema auto-sync, which has no migration history to roll
# back — then reload PM2 only if both of those succeeded.
#
# Uploaded product images (004, contracts/deploy.md) live in UPLOAD_DIR, an
# absolute path outside the release, so neither the build nor the
# `cp -r public` below ever touches them: a deploy keeps every upload.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a
source .env
set +a

# Refuse before anything changes: the app fails at boot without an absolute
# UPLOAD_DIR, and a relative one would land inside the release and be lost on
# the next deploy.
case "${UPLOAD_DIR:-}" in /*) ;; *) echo "!! UPLOAD_DIR must be set to an absolute path in .env — see .env.example" >&2; exit 1;; esac

echo "==> Preparing the upload directory ${UPLOAD_DIR}"
mkdir -p "$UPLOAD_DIR"
chmod 750 "$UPLOAD_DIR"

echo "==> Installing dependencies"
npm ci

echo "==> Building"
npm run build

# Next.js's standalone output (next.config.ts: output: "standalone") does not
# copy these itself (documented Next.js behaviour, not an oversight here) —
# without them the server can't serve an image or a page under load.
echo "==> Copying static assets and env into the standalone output"
cp -r public .next/standalone/public
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp .env .next/standalone/.env

echo "==> Running database migrations"
if ! npx prisma migrate deploy; then
  echo "!! Migration failed — the previous release is still running. Nothing reloaded." >&2
  exit 1
fi

# FR-011, ADR-0004: the release reads the catalogue from the database, so the
# import must have run before it serves. Idempotent and all-or-nothing — after
# the first deploy it prints "nothing to do". A non-zero exit (1 error, 2
# conflict) means nothing was written, and the previous release keeps running.
echo "==> Importing the catalogue"
if ! npm run catalogue:import; then
  echo "!! Catalogue import failed — the previous release is still running. Nothing reloaded." >&2
  exit 1
fi

echo "==> Reloading the application"
pm2 startOrReload ecosystem.config.js --env production --update-env

echo "==> Deploy complete"
