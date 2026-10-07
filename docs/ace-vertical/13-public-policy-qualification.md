# Review public-qualified role policies under an app search path

**Step DB-2d3.** After DB-2d2 removed the target's direct table grants, the
strict RLS gate passed with `schema=public` but flagged
`OrgRolePermission_rls` and `OrgRolePermission_system_role_seed` with
`schema=app`. Both policies are on the restored `public` tables. PostgreSQL's
`pg_get_expr` renders their referenced relation as
`public."OrgRoleDefinition"` when `app` is the connection's search path. The
gate's reviewed text uses the unqualified name. Its existing canonicalizer
already accepts `app."OrgRoleDefinition"` in the reverse layout.

## Decision

Canonicalize only the exact `public."OrgRoleDefinition"` reference alongside
the existing `app` spelling. Keep the full reviewed predicate, command, roles,
permissiveness, and `USING` / `WITH CHECK` comparisons. The gate already
rejects multiple physical copies of every required table, including
`OrgRoleDefinition`, so either qualified spelling resolves to its unique
required table. Do not change database policies, privileges, or data.

## Verification

- Accept the complete reviewed policy set when its two role-permission
  policies use the `public` qualification in both predicates.
- Reject a widened predicate even with the `public` qualification.
- Run unit tests and the strict gate against fresh `app` and `public` layouts,
  then against both URL schemas on the restored target without the acceptance
  flag. The target remains off application traffic.

The 22 policy-gate unit tests pass, including acceptance of both
public-qualified reviewed policies and rejection of a widened predicate. Both
fresh local layouts pass through their existing acceptance path for unrelated
tables with disabled RLS. The restored target passes the strict gate with
both URL schemas and no acceptance flag using this change.
