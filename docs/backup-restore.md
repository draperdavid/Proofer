# Database backup & restore

Self-managed backups: a scheduled GitHub Action (`.github/workflows/backup.yml`) runs
`pg_dump` against the database and writes a timestamped, gzipped dump to the
`proofer-backups` R2 bucket (versioning enabled, so even an overwrite is recoverable).
There is no paid Supabase backup tier — this pipeline, tested, is the safety net.

**A backup that has never been restored is not a backup.** Run the restore drill below
quarterly (see `project-plan.md` maintenance schedule), and any time you're about to
trust an old dump for real.

## Where dumps live

- Bucket: `proofer-backups` (Cloudflare R2, versioning on)
- Filename: `proofer-<UTC timestamp>.sql.gz`, e.g. `proofer-20260918T080000Z.sql.gz`
- Schedule: daily at 08:00 UTC, plus on-demand via the workflow's "Run workflow" button
  in GitHub Actions

## Restoring a dump (drill or real recovery)

**Never restore into a database you can't afford to overwrite.** For the quarterly
drill, always restore into **staging**, never prod — the point is to prove the dump is
usable, not to touch live data.

1. **Get the dump.** Download the file you want from the `proofer-backups` R2 bucket
   (Cloudflare dashboard → R2 → proofer-backups, or via `aws s3 cp` with the R2
   S3-compatible endpoint — see the credentials the backup workflow uses).

2. **Decompress it:**
   ```bash
   gunzip proofer-20260918T080000Z.sql.gz
   ```

3. **Get the target database's connection string.** Supabase dashboard → the target
   project → Project Settings → Database → Connection string. Use the restore against
   **staging's** connection string for the drill.

4. **Restore:**
   ```bash
   psql "<staging DATABASE_URL>" < proofer-20260918T080000Z.sql
   ```
   This replays the dump's `CREATE TABLE` / `INSERT` statements against the target. If
   the target already has conflicting tables/data, either restore into a fresh Supabase
   project, or `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` first (destructive —
   confirm you're pointed at staging, not prod, before running this).

5. **Verify.** Confirm the expected tables and row counts exist
   (`psql "<DATABASE_URL>" -c "\dt"` and spot-check a few rows), and that the app
   (`/api/health` at minimum) still works against the restored data.

6. **Record the drill.** Note the date, which dump was restored, and the outcome in
   `Proofer/progress.md` (or wherever the team tracks this) so there's a paper trail
   that backups are actually being verified, not just produced.

## Setup (one-time)

Required repository secrets (GitHub → Settings → Secrets and variables → Actions →
Repository secrets — not environment-scoped, since this workflow doesn't use an
`environment:` key):

| Secret | Where to get it |
| --- | --- |
| `SUPABASE_DB_URL` | Supabase dashboard → Project Settings → Database → Connection string (URI). Contains the DB password — treat as fully sensitive. |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → Overview (same account ID used for Workers). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare dashboard → R2 → Manage API tokens → Create API token, scoped to the `proofer-backups` bucket only, Object Read & Write. |

Also required: an R2 bucket named `proofer-backups` with **bucket versioning enabled**
(Cloudflare dashboard → R2 → Create bucket → Settings → Versioning).
