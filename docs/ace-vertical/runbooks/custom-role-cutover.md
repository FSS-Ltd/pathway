# Custom-role assignment cutover

The product now issues platform fixed roles and scoped access tags. Existing
custom assignments continue to affect access until each organisation's
assignments have been compared and retired. Keep that history; do not delete
role definitions or assignment rows.

## Read-only inventory (step 1.2d3a)

Run with an approved maintenance database identity that has RLS bypass. The
current tenant and role-definition policies hide other sites from ordinary RLS
identities; the command rejects that identity rather than returning an
incomplete inventory. Use a direct or session-pooler connection, never the
transaction pooler, because the scan uses transactions and session context.
Set `DATABASE_URL` through the approved secret store. Keep the report outside
the repository with owner-only file permissions:

```sh
umask 077
pnpm --silent --filter @pathway/api access:inventory --org-id <organisation-uuid> > /private/tmp/custom-role-inventory.ndjson
```

The command requires one organisation ID and uses read-only transactions with
organisation context.
It lists assignments active at its capture time, including assignments to
inactive custom roles. Each row contains the assignment and user IDs, role
scope, validity window, raw role permissions, and candidate fixed roles and
available tags. A candidate's raw permission keys are a subset of that
custom role's keys at the same scope and site; `uncoveredPermissionKeys`
flags keys with no such candidate. A final `complete` row confirms the scan
finished. Do not use a report without that row.

This is a **candidate inventory**, not proof of effective-access parity or
permission to grant a tag. The normal grant endpoint must still validate the
actor, recipient membership, delegation ceiling, entitlements, site scope,
and validity window. Reports can become stale if assignments change during
the paged scan. Run a fresh inventory under the cutover write freeze before
the eventual migration.

## Parity preview (step 1.2d3b1)

Create a proposed mapping file outside the repository. Name every active
custom assignment from a fresh inventory exactly once. Select only fixed-role
IDs and tag keys shown as candidates for that assignment. An empty choice is
allowed, but uncovered raw keys fail parity. Example:

```json
{
  "orgId": "00000000-0000-4000-8000-000000000000",
  "mappings": [
    {
      "assignmentId": "00000000-0000-4000-8000-000000000001",
      "fixedRoleIds": [],
      "tagKeys": ["attendance-recorder"]
    }
  ]
}
```

Run the non-mutating preview with the same maintenance identity after freezing
role, tag, membership, entitlement and site changes:

```sh
umask 077
pnpm --silent --filter @pathway/api access:parity --plan /private/tmp/custom-role-plan.json > /private/tmp/custom-role-parity.ndjson
```

The preview validates same-scope candidates, organisation and site membership,
and raw permission coverage. Scheduled future custom assignments block the
preview until resolved. It compares effective permission keys for each
affected user at organisation scope and every site. Existing fixed roles and
tags remain in the projected result. A final `complete` row with
`parityMatched: true` means current-state parity only; a nonzero exit or a
missing `complete` row blocks retirement. Preserve the source assignment's
validity window when creating replacements.

The preview does not grant or revoke access. It does not prove that the chosen
actor can delegate every tag, that a replacement avoids grant conflicts, or
that future role definitions and entitlements remain unchanged. Recheck these
conditions and parity in the audited retirement transaction.

## Audited retirement (steps 1.2d3b2a and 1.2d3b2b)

The retirement command must compare access inside its own write transaction.
The transaction-aware read uses the same entitlement, role, tag, membership,
and feature rules as normal effective access, but bypasses the shared assignment
cache so a comparison after mutation sees uncommitted changes. It sets the
organisation and selected site RLS context for every read. This read path alone
does not mutate assignments (step 1.2d3b2a).

After a verified backup and write freeze, run a fresh inventory and parity
preview. Review every mapping and exception, then run the maintenance command
with an active fixed Organisation Head as the audit actor:

```sh
umask 077
pnpm --silent --filter @pathway/api access:retire --plan /private/tmp/custom-role-plan.json --actor-user-id <fixed-head-uuid> > /private/tmp/custom-role-retirement.ndjson
```

For each affected user, the command re-reads the assignments, checks the
actor's delegation ceiling and the Organisation Head invariant, and compares
effective access at organisation scope and every site. It preserves replacement
validity windows, writes grants and revocations with audit and outbox facts,
and commits that user's transaction only when effective permission keys match.
Revoked assignments and historical role definitions remain in place. A
`user-committed` row confirms one committed user; only a final `complete` row
and zero exit status confirm that all active custom assignments were retired.

If the command stops after committed users, retain its report and do not replay
the old plan. Investigate the error, run a fresh inventory, resolve exceptions,
and preview a new plan for the remaining assignments under the write freeze.
The command rejects scheduled custom assignments and a partial site inventory.
Keep the backup, freeze, and post-run parity evidence with the release record.

No production inventory or retirement is claimed while the source Supabase
project is unavailable. The planned move to a new project in a new Supabase
organisation needs its own source recovery or export, database backup/restore,
Storage copy, Auth and secrets configuration, and cutover verification before
this runbook is used against production.
