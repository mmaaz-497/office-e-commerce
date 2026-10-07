#!/usr/bin/env bash
# Nightly backup (research.md R-017; docs/restore-drill.md). Runs from cron
# (deploy/crontab.example) as the same user that runs the app, so it can read
# .env for DATABASE_URL.
#
# A dump that only ever lives on this VPS is not a backup: for a one-server
# deployment, losing the server is the single realistic catastrophic scenario,
# and a local-only dump is lost with it. The `rclone copy` step is therefore
# not optional polish — it is the entire point of this script.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
set -a
source .env
set +a

# PLACEHOLDER — the client-owned object storage remote, configured once with
# `rclone config` on this server (never commit its credentials). Must be
# storage the client controls, independent of this VPS and this hosting
# provider account.
RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-PLACEHOLDER_RCLONE_REMOTE:tokoshopee-backups}"

BACKUP_DIR="/var/backups/tokoshopee"
LOCAL_RETENTION_DAYS=7
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="${BACKUP_DIR}/tokoshopee-${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "==> Dumping database to ${DUMP_FILE}"
pg_dump "$DATABASE_URL" | gzip > "$DUMP_FILE"

echo "==> Copying off this server to ${RCLONE_REMOTE}"
rclone copy "$DUMP_FILE" "$RCLONE_REMOTE"

# Uploaded product images (004) exist only in UPLOAD_DIR; the database holds
# their URLs, not their bytes, so a dump alone cannot bring them back.
# `copy` never deletes at the remote, matching uploads that are never deleted.
echo "==> Copying uploads to ${RCLONE_REMOTE}/uploads"
rclone copy "$UPLOAD_DIR" "${RCLONE_REMOTE}/uploads"

echo "==> Pruning local dumps older than ${LOCAL_RETENTION_DAYS} days"
find "$BACKUP_DIR" -name 'tokoshopee-*.sql.gz' -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "==> Backup complete: ${DUMP_FILE}"
