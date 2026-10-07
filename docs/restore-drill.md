# Restore Drill (T130)

**Satisfies**: research.md R-017; release-checklist item "Backup has been restored once into a
scratch database."

## Status: not yet performed

**This drill has not actually been run.** The environment this document was written in has no
running PostgreSQL instance and no real `deploy/backup.sh` dump to restore (Docker was not
running; see `docs/mobile-verification.md` for the same constraint affecting other Phase 8
tasks). Writing down "restored successfully" without having run a single command would be
exactly the fabricated-verification problem Constitution Principle VII exists to prevent
applied to ops documentation instead of customer-facing content — an unperformed drill recorded
as performed is a false safety net, worse than an honestly-marked gap.

**This is a release blocker.** The procedure below must be run for real, against a real dump
produced by `deploy/backup.sh`, and this document updated with the actual date, operator, and
outcome — before `docs/release-checklist.md`'s "backup restored once" item can be checked off.

## Procedure

1. **Produce a real dump.** Either wait for `deploy/backup.sh` to run via cron, or run it by
   hand: `./deploy/backup.sh`. Confirm the `.sql.gz` file exists both locally
   (`/var/backups/tokoshopee/`) and at the `rclone` remote (`rclone ls <remote>`) — a drill that
   only proves the local copy works hasn't tested the actual disaster scenario, which is losing
   the server the local copy lives on.

2. **Fetch the dump from off-server storage**, not from the local disk, onto a separate machine
   or a scratch VM — pulling from the remote is the part of the test that matters; restoring the
   local file only proves `pg_dump` produced valid SQL, not that the off-server copy is real.

   ```bash
   rclone copy <remote>/tokoshopee-<timestamp>.sql.gz .
   ```

3. **Create a scratch database** — never restore over the real one:

   ```bash
   createdb tokoshopee_restore_drill
   ```

4. **Restore into it:**

   ```bash
   gunzip -c tokoshopee-<timestamp>.sql.gz | psql tokoshopee_restore_drill
   ```

5. **Verify the restored data is real, not just present.** At minimum:
   - Row counts on `"Order"`, `"StockLevel"`, `"StockChange"`, and `"Review"` are non-zero and
     plausible against what the admin dashboard showed at dump time.
   - One specific known order (by order number) round-trips with the same `totalIDR` and status
     it had live — this is the price-snapshot immutability guarantee (T135) surviving a
     dump/restore cycle, not just a live read.
   - `StockLevel.quantity` matches what the dump-time admin stock page showed.

6. **Restore the uploaded product images** (004, contracts/deploy.md). The dump holds only
   their `/uploads/<name>` URLs; the files come from the remote's `uploads` folder. On the
   scratch machine, with an absolute `UPLOAD_DIR` set in its `.env`:

   ```bash
   rclone copy <remote>/uploads "$UPLOAD_DIR"
   ```

   Then pick one stored name (`SELECT url FROM "ProductImage" WHERE url LIKE '/uploads/%'
   LIMIT 1;`) and check that the app started against the restored database and `UPLOAD_DIR`
   serves it: `curl -sI https://<host>/uploads/<name>` returns `200`.

7. **Tear down the scratch database:**

   ```bash
   dropdb tokoshopee_restore_drill
   ```

8. **Record the outcome below** — date, who ran it, which dump (timestamp) was used, what was
   verified, and how long the whole drill took wall-clock (this is the number that matters if
   this is ever done for real under pressure, not as a drill).

## Drill log

| Date | Operator | Dump used | Verified | Wall-clock time | Notes |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |
