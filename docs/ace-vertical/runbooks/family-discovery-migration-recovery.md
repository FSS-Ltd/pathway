# ACE family discovery migration recovery

**Target:** restored London Supabase project `jzofykdzpuslpdyfovxp`.

**Failed migration:** `20261008020000_ace_family_context_discovery`.

The 8 October master-push deployment stopped with Prisma P3018 while trying
to create a policy on `app."StudentIdentity"`. That relation is a view. The
actual `StudentIdentity` and `GuardianIdentity` tables are in `public`, with
forced RLS. A read-only target audit found one unfinished, unrolled-back
migration record and no `*_self_discovery` policies. PostgreSQL rolled back
the migration's single `DO` statement, so there is no partial policy to
remove. The next automatic run at merge `70cc5350` stopped with P3009 on that
failed record. API, admin, and web deployment jobs were skipped in both runs.

The corrected migration inspects `pg_class.relkind`, ignores compatibility
views, requires forced RLS, and creates policies on the underlying base
tables. It also works when both identities are tables in `app`. This is an
exception to the usual rule against editing an applied migration: the target
attempt failed, and the same source migration must replay safely in both
layouts. Environments that already applied the old file retain their recorded
checksum; operators must not reset or rewrite those databases to reconcile
it. The two migration results have the same policy intent on their base
tables.

## Recovery after the fix is merged

1. Confirm the PR's exact-head CI and merge, no concurrent production migration,
   the new project's connection identity, the failed migration record, the
   `public` base tables, and absence of self-discovery policies. Keep the
   connection string in the approved secret store; do not paste it into logs.
2. With `DATABASE_URL` pointed only at the verified target, run
   `pnpm --filter @pathway/db prisma migrate resolve --rolled-back 20261008020000_ace_family_context_discovery`.
   This changes only Prisma's failed-migration record. Confirm the old attempt
   has `rolled_back_at` set before continuing.
3. Rerun the production deploy workflow on the **merged fix commit**. Its
   migration job must replay the corrected file and finish all later pending
   migrations before API, admin, and web jobs proceed. Do not rerun the older
   failing commit.
4. Read back Prisma migration status, the self-discovery policies on the two
   `public` base tables and none on the compatibility view, the three deployed
   commit IDs, and authenticated family context API behavior. Then smoke-test
   API health, admin, and configurator and check release errors.

If migration replay fails, stop the app release, inspect the new failure and
catalog state, and use an audited forward correction. Do not mark a partly
applied migration successful or delete family identities. The last READY app
deployments continue serving until the new release jobs complete.
