# Custom-role assignment cutover

The product now issues platform fixed roles and scoped access tags. Existing
custom assignments continue to affect access until each organisation's
assignments have been compared and retired. Keep that history; do not delete
role definitions or assignment rows.

## Read-only inventory (step 1.2d3a)

Run with a database identity permitted to read the selected organisation.
Set `DATABASE_URL` through the approved secret store. Keep the report outside
the repository with owner-only file permissions:

```sh
umask 077
pnpm --silent --filter @pathway/api access:inventory --org-id <organisation-uuid> > /private/tmp/custom-role-inventory.ndjson
```

The command requires one organisation ID and uses read-only RLS transactions.
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

Run the non-mutating preview with a read-only database identity after freezing
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

For each affected user, compare effective access at every applicable site
before and after a proposed mapping, including existing fixed roles and
tags. Preserve assignment windows. Resolve every uncovered or widened key
without granting additional access. Recheck protected access and the final
Organisation Head invariant. Only then issue approved replacements, revoke
the old assignment through an audited transaction, and verify the resulting
effective access. Retain revoked assignments, role revisions, and audit facts.

No production inventory or retirement is claimed while the source Supabase
project is unavailable. A new-project database move needs its own backup,
Storage-copy, configuration, and cutover verification before this runbook is
used against production.
