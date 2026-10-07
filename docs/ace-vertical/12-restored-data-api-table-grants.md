# Revoke restored Data API table grants

**Step DB-2d2.** The restored project has direct `anon` and `authenticated`
privileges on 121 of 127 `public` application tables. The strict RLS gate
finds grants on 63 required tables. `postgres` also has default privileges
that would grant both roles access to future `public` tables. The earlier
lockdown migration used `current_schema()`; its restored history does not
prove that it ran against the source snapshot's `public` tables.

## Decision

The web and mobile clients use the NexSteps API, while the API and workers use
Prisma for application data. Repository Supabase HTTP calls use Storage, not
the table Data API. The new project is not serving application traffic. Revoke
table privileges from `PUBLIC`, `anon`, and `authenticated` in both `public`
and `app`, and remove the current migration role's default table grants to
`anon` and `authenticated` in both schemas. Keep `service_role`, Storage,
Auth, function, sequence, and schema privileges outside this focused change.
Do not alter table ownership, RLS policies, data, or the source project.

The migration checks whether the two Supabase API roles exist so the same
Prisma migration works in disposable Postgres CI databases. External Data API
consumers cannot be established from this repository and must be checked
before traffic is switched to the new project.

## Verification and rollout

- Apply all migrations to a disposable database with `anon` and
  `authenticated` roles, deliberately granted fixture table privileges, and
  default grants. Confirm the new migration removes both, preserves the
  owner/server path, and is safe to apply twice in a disposable rehearsal.
- Recheck the target's application row counts, 74 required forced-RLS tables,
  role policies, direct grants, and `postgres` default table privileges before
  and after applying the merged migration. Run the strict RLS gate using both
  `schema=public` and `schema=app`.
- Keep the target off traffic. Migration-history discrepancies and project
  Auth/configuration checks remain separate cutover gates. A rollback would
  restore only explicitly reviewed grants; it must not broadly reopen the
  Data API.

The local probe passed with both API roles, deliberately granted tables in
both schemas, and default grants. Running the migration twice removed old and
new table access while preserving owner access. Fresh Prisma deployment with
`schema=public` and `schema=app` passed. The target rollback-only probe reduced
1,694 table-privilege entries and 16 `postgres` default-table-privilege
entries to zero inside the transaction, then restored both baselines. Its 28
blog and one organisation rows were unchanged.
