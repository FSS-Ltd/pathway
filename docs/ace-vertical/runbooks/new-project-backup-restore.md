# New Supabase project backup restore

**Status:** DB-2a preflight on 7 October 2026. No database rows, Storage bytes,
secrets, application traffic, or production configuration have been moved.
Follow the [production release and cutover conditions](../production-release-status.md)
before treating the new project as production.

## Candidate snapshot and target

| Item             | Verified result                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source           | `fkajodqkxysfcnfhizwn`, Ireland `eu-west-1`; Supabase reports `INACTIVE` and a database read times out.                                                                                                |
| Target           | `jzofykdzpuslpdyfovxp`, London `eu-west-2`; `ACTIVE_HEALTHY`, with no application tables, Storage buckets or objects, or Supabase migration records.                                                   |
| Database archive | `db_cluster-07-09-2026@02-40-10.backup.gz`; SHA-256 `2dc22e100b0778d470ccb73f1c668978d604ad87bbcdf596de9617de2e449c6a`; gzip integrity passed; 1,468,015 uncompressed bytes of plain SQL.              |
| Storage archive  | `fkajodqkxysfcnfhizwn.storage.zip`; SHA-256 `699c1303bfe03202b97735aafbb11ba8c8bb4bf1ea8606d64a134cb3c4127756`; ZIP CRC passed; 32 files, no unsafe paths, symlinks, encryption, or duplicate entries. |

The SQL contains 166 `COPY` sections and 1,820 data rows, including 121
`public` table sections, 95 `public._prisma_migrations` rows, 28
published `BlogPost` rows with content, one `Org` named Victorious Kids with
`isMasterOrg = true`, 71 `User` rows, six `Tenant` rows, and 276 session
`Attendance` rows. It contains two `storage.buckets` and 32
`storage.objects` rows; `auth.users` and `vault.secrets` have zero rows. The
source and target both report zero deployed Edge Functions. The backup's four
declared extensions are already installed on the target.

All 32 ZIP files map uniquely to a database Storage object by bucket and
path. Every file matches the recorded size and MD5 ETag. This proves the two
provided archives agree with each other; it does **not** prove that the SQL
snapshot includes all writes made before the source became inactive. The
filename suggests 7 September in UK date notation, and the newest blog row
was updated on 2 September. The actual snapshot time and whether later writes
exist require confirmation. Do not describe this as a complete current-data
migration until that is resolved.

## Restore gate and procedure

1. Confirm that these are the latest complete database and Storage exports,
   or obtain a later consistent pair. Keep the source project untouched. The
   supplied backup files and any extracted data stay outside Git and in an
   approved secret location. Confirm that moving from Ireland to London meets
   the organisation's data residency decision.
2. The target's Postgres session-pooler URL is now stored as
   `NEW_DATABASE_URL` in the ignored, untracked root `.env`. Its project ref,
   port 5432, and `postgres` database were checked; a read-only `psql` query
   connected and confirmed the application `Org` table is absent. The URL has
   Prisma-only `pgbouncer` and `connection_limit` query parameters. Remove
   those parameters in memory for `psql`, leaving the secret file unchanged.
   Do not paste the URL or password into a PR, log, or chat.
3. Recheck that the target has no application data. Restore the downloaded
   logical SQL with `psql`, following Supabase's
   [dashboard-backup guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore).
   This is a cluster-style SQL dump with global role statements and
   `\connect template1` / `\connect postgres` commands. Prepare and review a
   target-scoped replay before using `psql`: preserve the target's managed
   roles and settings, omit the `template1` section, and recreate only the two
   application-owned roles and their required grants after checking their
   intended privileges. Do not pipe the unmodified archive into the managed
   target. Keep the replay and transcript in a permission-restricted temporary
   location; classify managed-object collisions separately from failed
   application DDL, `COPY`, constraints, or grants. Do not infer success from
   `psql` exiting zero when it continued after SQL errors.
4. Compare every application-table row count with the archive manifest, then
   verify representative tenant, user, master-org, blog, attendance, access,
   and migration records; sequence values; foreign keys; and tenant RLS.
   Reconcile the 95 restored Prisma migrations with repository migrations
   before running only genuinely pending migrations, as the product owner has
   deferred migrations and fixes until after data movement.
5. Copy the 32 Storage files directly from the local archive into the two
   restored target buckets using the target's approved Storage credentials or
   CLI session. Do not upload private files to an intermediary service. Fetch
   each target object and compare its size and MD5 to the source archive;
   metadata rows alone are not proof that bytes exist in Storage. Supabase's
   [paused-project restore guide](https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause)
   confirms Storage objects require a separate copy.
6. Review project-specific Auth, Realtime, Storage, webhook, and API-key
   settings. New project keys and URLs differ from the old project. Preserve
   the application's existing PII encryption key through its secret store;
   the database backup cannot reconstruct it. `vault.secrets` is empty in this
   snapshot, but a logical restore does not carry a Supabase Vault root key.
   Verify relevant functions, workers, billing callbacks, and uploads in
   staging before changing any deployment secret or production traffic.

**Exit evidence:** confirmed snapshot freshness; target row-count and sample
parity; 32/32 object downloads with matching hashes; migration baseline and
RLS checks; configuration inventory; and a separate authorised cutover plan.
If any comparison fails, leave traffic on the old configuration and preserve
the target for diagnosis. This preflight alone does not satisfy the exit gate.
