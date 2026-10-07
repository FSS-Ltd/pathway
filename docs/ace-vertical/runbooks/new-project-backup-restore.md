# New Supabase project backup restore

**Status:** DB-2b target restore on 7 October 2026. Database rows, Storage
bytes, and four pending Prisma migrations are in the new project. Application
traffic and production configuration have not moved.
Follow the [production release and cutover conditions](../production-release-status.md)
before treating the new project as production.

## Candidate snapshot and target

| Item                  | Verified result                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source                | `fkajodqkxysfcnfhizwn`, Ireland `eu-west-1`; Supabase reports `INACTIVE` and a database read times out.                                                                                                |
| Target before restore | `jzofykdzpuslpdyfovxp`, London `eu-west-2`; `ACTIVE_HEALTHY`, with no application tables, Storage buckets or objects, or Supabase migration records.                                                   |
| Database archive      | `db_cluster-07-09-2026@02-40-10.backup.gz`; SHA-256 `2dc22e100b0778d470ccb73f1c668978d604ad87bbcdf596de9617de2e449c6a`; gzip integrity passed; 1,468,015 uncompressed bytes of plain SQL.              |
| Storage archive       | `fkajodqkxysfcnfhizwn.storage.zip`; SHA-256 `699c1303bfe03202b97735aafbb11ba8c8bb4bf1ea8606d64a134cb3c4127756`; ZIP CRC passed; 32 files, no unsafe paths, symlinks, encryption, or duplicate entries. |

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
was updated on 2 September. The owner confirmed these are the latest available
backups. The source remains inaccessible, so later writes cannot be ruled out
by an independent source comparison.

## Local restore rehearsal

On 7 October, a disposable Postgres 17 cluster was started on a private Unix
socket with TCP disabled. A target-scoped replay omitted the archive's global
role and `template1` sections and kept all 166 `COPY` sections. The replay
completed with 13 errors caused by the local cluster lacking Supabase Vault.
Every available table matched the archive row count: 165 of 166 sections and
all 1,820 rows. The remaining section was `vault.secrets`, which has zero
archive rows and is absent locally; the new Supabase project has the extension.
The local server was stopped after this check. No backup data or replay SQL was
added to Git.

A read-only target query confirmed Postgres 17, zero `public` tables, zero
Storage buckets and objects, and no Prisma migration table. The target login
cannot set `session_replication_role`; its existing platform triggers will run
during the restore. The archive creates its application triggers after all
`COPY` data, but target platform trigger effects still require verification.
These checks are rehearsal evidence, not a target restore.

## Target restore evidence — 7 October 2026

The target was rechecked immediately before replay: zero `public` tables, zero
Storage buckets and objects, and no Prisma migration table. The checksum-pinned
helper produced the reviewed 166-section, 1,820-row target-scoped SQL. The
`psql` replay completed, but reported 478 errors while encountering existing or
protected Supabase-managed objects and the two omitted application-owned roles.
The latter roles were created with their source attributes and narrow grants;
`app.publish_approved_ace_report()` was assigned to its source owner. All
application `COPY` sections loaded, and the role-dependent grant and ownership
errors were repaired. The seed role has no password in the logical
backup and still needs a managed secret before seed commands can authenticate.

Every archived application data section matched its target row count: 121 in
`public` and ten in `app`. The other four initial differences were the three
Supabase-managed migration tables, whose target versions differ, and
`storage.objects`, where direct SQL insert was denied. The Storage API then
uploaded all 32 archived files into the two restored buckets and downloaded
each one with matching length and SHA-256. The target now has 31 public and one
private Storage object. Representative counts remain 28 blog posts, one master
organisation, 71 users, six tenants, and 276 attendance rows. Source-side
parity after the snapshot is still unverified.

After data movement, Prisma applied the four pending repository migrations:
access-tag grants, physical PACE inventory, PACE diagnostic facts, and
attendance correction events. There are now 98 finished migration records and
one historical rolled-back attempt. All `app` and `public` tables have RLS
enabled; the new access-tag, PACE, and attendance-event tables force it. All
application constraints are validated. Read-only queries under both `anon` and
`authenticated` returned zero organisation rows.

After [PR #384](https://github.com/FSS-Ltd/pathway/pull/384) merged with all
eight checks passing, the single pending portable ACE fact-trigger migration
was applied to this target. Its diagnostic and attendance functions were
verified in a rollback-only target fixture: valid facts succeeded, invalid
enrollment, tenant, status, origin and actor cases were rejected, and the
fixture schema was absent after rollback. The target has 99 finished Prisma
migration records. This did not switch traffic or resolve the older functions.

After [PR #385](https://github.com/FSS-Ltd/pathway/pull/385) merged with all
eight checks passing, the student portal policy trigger migration was applied.
A rollback-only target fixture accepted an active link under an enabled
same-tenant policy, allowed closure and ended or revoked links after policy
disablement, rejected disabled and missing tenant policies, and left no fixture
schema behind. The target has 100 finished Prisma migration records. Traffic
and deployment configuration remain unchanged.

After [PR #386](https://github.com/FSS-Ltd/pathway/pull/386) merged with all
eight checks passing, the ACE actor-membership trigger migration was applied.
A rollback-only target fixture accepted site membership, legacy tenant role,
and active organisation-role paths; it rejected wrong-tenant, revoked, expired,
inactive-role, inactive-permission, outsider, and missing-actor cases. The
fixture schema was absent after rollback. The target has 101 finished Prisma
migration records. No traffic or deployment configuration changed.

After [PR #387](https://github.com/FSS-Ltd/pathway/pull/387) merged with all
eight checks passing, the message conversation creator trigger migration was
applied. A rollback-only target fixture accepted same-tenant staff and linked
guardians, rejected students, unrelated or missing guardians, and cross-tenant
staff. The fixture schema was absent after rollback. The target has 102
finished Prisma migration records. Traffic and deployment configuration remain
unchanged.

After [PR #388](https://github.com/FSS-Ltd/pathway/pull/388) merged with all
eight checks passing, the message participant trigger migration was applied.
A rollback-only target fixture accepted valid guardian and staff participants,
rejected wrong-tenant, identity, membership, student, and immutable-field
cases, then allowed removal after access ended. The fixture schema was absent
after rollback. The target has 103 finished Prisma migration records. Traffic
and deployment configuration remain unchanged.

After [PR #389](https://github.com/FSS-Ltd/pathway/pull/389) merged with all
eight checks passing, the notice eligibility migration was applied. A
rollback-only target fixture accepted valid guardian and staff recipients,
rejected cross-tenant, identity, membership, student, and ended-relationship
cases, and left no fixture rows. The target has 104 finished Prisma migration
records. Traffic and deployment configuration remain unchanged.

After [PR #390](https://github.com/FSS-Ltd/pathway/pull/390) merged with all
eight checks passing, the strict RLS gate was run against both restored
schemas. It found all 74 required tables exactly once with forced RLS and the
15 reviewed role policies, but correctly failed on grants to `anon` or
`authenticated` on 63 required tables. No target privilege changed. A
rollback-only rehearsal of the proposed DB-2d2 migration reduced 1,694
individual `PUBLIC`/`anon`/`authenticated` table-privilege entries and 16
`postgres` default-table-privilege entries to zero; rollback restored both
counts and preserved the 28 blog and one organisation rows.

After [PR #391](https://github.com/FSS-Ltd/pathway/pull/391) merged with all
eight checks passing, the reviewed grant-removal migration was applied to the
target. Direct `PUBLIC`/`anon`/`authenticated` table-privilege entries in
`public` and `app` fell from 1,694 to zero, and `postgres` default table-grant
entries fell from 16 to zero. The target now has 105 finished Prisma migration
records. Counts remain 28 blog posts, one organisation, 71 users, six sites,
276 attendance rows, and 32 Storage objects. Direct privilege checks deny
`anon` a blog read and `authenticated` an organisation read while retaining
`postgres` access. The strict RLS gate passes with `schema=public`. A
read-only `schema=app` run of the merged gate flags two unchanged
`OrgRolePermission` policies because PostgreSQL renders their referenced
table as `public."OrgRoleDefinition"` under that search path. After
[PR #392](https://github.com/FSS-Ltd/pathway/pull/392) merged with all eight
checks passing, the corrected strict gate passed read-only target runs with
both `schema=public` and `schema=app`, with no acceptance flag. Traffic and
deployment configuration remain unchanged.

**Migration-history audit — 7 October 2026:** The target has 105 finished
Prisma migrations and one rolled-back attempt; Git has 103 migration files.
A read-only comparison of every finished ledger checksum against the local SQL
found 102 exact matches and no pending repository migrations. `prisma migrate
status` exits zero and reports the schema up to date, so that command alone
does not reveal the three history exceptions:

| Migration                                          | Restored ledger           | Repository evidence                                                                        |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `20260613000000_lock_supabase_public_rls`          | Finished checksum differs | The only version in local Git history matches the current file, not the restored checksum. |
| `20260811143000_fix_ace_trigger_schema_references` | Finished                  | No file in the checkout or local Git history.                                              |
| `20260811150000_fix_faith_audience_version_guard`  | Finished                  | No file in the checkout or local Git history.                                              |

The restored lock-migration checksum is
`41d067cc411861425dc07f6a5bb548b0b0782e53eb8a6195b8798ca15f6c5ff3`;
the Git file hashes to
`28145a3b9b5b565ecf25b49337562886656377bd7a49ab531fbb4339ded445e8`.
The two missing migration records have checksums
`4f4ddb816b6b1e5e51f694f723c6ceaae54d4b33e7f31ed35f0caccdf7edb23e`
and `6ba558cc74a4971ef9ce256de4d361bd32e93c65652de3c789edc0321349d25b`,
respectively.

The rolled-back `20260728120000_org_role_revisions` attempt matches its first
Git version; its finished ledger checksum matches the current repository file.
Recover and review the three exceptional original SQL files, or approve a
reviewed forward baseline for repeatable future restores. Do not invent their
contents or edit the restored migration ledger to make checks pass.

The new `NEW_SUPABASE_SERVICE_ROLE_KEY` in the ignored local env file was
validated against the target Storage API: it listed exactly
`pathway-private` (private) and `pathway-public` (public). The target project
reports healthy in London and has no Edge Functions. A security advisor run
found public API-role execution grants on the `public.rls_auto_enable()`
`SECURITY DEFINER` event-trigger function. DB-2e2 removes those grants after
its PR gate; the target rollback-only rehearsal passed. Four separate
mutable-search-path function warnings remain for review.

**Remaining release blockers:** Migration-history provenance, source freshness
and final delta, and project-specific configuration and staging verification
remain unresolved.
No repository Data API table client was found, but external consumers require
review before cutover. A read-only catalog audit found no remaining static
function references to application relations missing from `app` but present
in `public`. Project-specific Auth, encryption, webhook,
deployment-secret, and production smoke checks remain. This target is **not
ready for traffic**.

## Restore gate and procedure

1. Confirm that these are the latest complete database and Storage exports,
   or obtain a later consistent pair. The owner confirmed the supplied pair is
   the latest available, but the source cannot be queried for a delta. Keep the
   source project untouched. The
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
3. On a fresh target only, recheck that it has no application data. Restore
   the downloaded logical SQL with `psql`, following Supabase's
   [dashboard-backup guide](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore).
   This is a cluster-style SQL dump with global role statements and
   `\connect template1` / `\connect postgres` commands. Run
   `node scripts/prepare-supabase-backup-replay.mjs <backup.gz>` and review its
   target-scoped output before using `psql`. The helper requires this archive's
   SHA-256 and 166 sections/1,820 rows, removes global roles and the
   `template1` section, and writes SQL in a private temporary directory.
   Preserve the target's managed roles and settings, and recreate only the two
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
   CLI session. Run
   `node scripts/restore-supabase-storage-archive.mjs <storage.zip>` first to
   validate the exact archive and 32 object paths without uploading. After
   adding `NEW_SUPABASE_SERVICE_ROLE_KEY` to an ignored local env file, run
   `node scripts/restore-supabase-storage-archive.mjs <storage.zip> --apply <env-file>`.
   The command uploads directly to the fixed new-project URL and downloads
   each object to compare its bytes; it requires `unzip` locally and can be
   rerun safely after a partial upload. Do not upload private files to an
   intermediary service. Metadata rows alone are not proof that bytes exist
   in Storage. Supabase's
   [paused-project restore guide](https://supabase.com/docs/guides/troubleshooting/restore-project-after-90-days-pause)
   confirms Storage objects require a separate copy.
6. Review project-specific Auth, Realtime, Storage, webhook, and API-key
   settings. New project keys and URLs differ from the old project. Preserve
   the application's existing PII encryption key through its secret store;
   the database backup cannot reconstruct it. `vault.secrets` is empty in this
   snapshot, but a logical restore does not carry a Supabase Vault root key.
   Verify relevant functions, workers, billing callbacks, and uploads in
   staging before changing any deployment secret or production traffic.

**Exit evidence for cutover:** independent source freshness or an agreed write
freeze and final delta; resolved migration history and schema/RLS blockers;
configuration inventory; staging journeys; and a separately authorised cutover
plan. The target row-count comparison and 32/32 object checks are complete.
Leave traffic on the old configuration until every release blocker is resolved.
