# Restrict restored RLS event-trigger execution

**Step DB-2e2.** On the restored London project, `public.rls_auto_enable()`
is a `SECURITY DEFINER` event-trigger function owned by `postgres`. The enabled
`ensure_rls` event trigger calls it after DDL to enable RLS on newly created
`public` tables. Its current ACL also grants `EXECUTE` to `PUBLIC`, `anon`, and
`authenticated`. Supabase's security advisor flags both API roles as able to
execute the function ([linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)).

## Decision

Revoke `EXECUTE` on this one function from `PUBLIC`, `anon`, and
`authenticated`. Preserve its owner, definition, search path, event trigger,
and `service_role` grant. Do not change table privileges, RLS policies, data,
or deployment configuration. The migration skips the function and API roles
when absent in a disposable non-Supabase Postgres database.

This closes the observed public-role grant without assuming the Data API can
successfully invoke an `event_trigger` return type. It does not change the four
separate mutable-search-path warnings; those functions need their own review.

## Verification and rollout

- On a disposable database, grant the fixture function to the API roles,
  apply the migration twice, and confirm both roles lose `EXECUTE` while the
  owner retains it and the event trigger still enables RLS on a new table.
- In a rollback-only target transaction, confirm the same grant change without
  retaining any database modification. After the PR passes CI and merges,
  deploy the migration to the off-traffic target and rerun the security advisor
  and strict RLS gate.
- Retain the source backup and target audit evidence. Regranting this function
  to public API roles is not a general rollback; any exceptional caller would
  need a reviewed, narrower access path.

The local fixture started with both API roles able to execute the function.
After two applications, both were denied, the owner retained execution, and
`ensure_rls` remained enabled and set RLS on a new `public` table. A full fresh
Prisma migration replay passed with the function absent. The target
rollback-only probe changed both API roles and `PUBLIC` to denied inside its
transaction, retained owner access and the event trigger, and restored its
initial grants on rollback. The target remains off traffic.
