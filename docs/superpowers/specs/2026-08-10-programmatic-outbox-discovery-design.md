# Programmatic Outbox Discovery Design

## Problem

The scheduled outbox dispatcher requires a manually maintained `OUTBOX_ORG_IDS`
secret. A new organisation can therefore accumulate events until an operator
updates deployment configuration. Discovering organisations with a normal
`Org` query would bypass the intended organisation RLS boundary.

## Decision

Dispatch due events for every Pathway organisation, not only ACE schools.
The existing producer is the platform-wide `access.assignment.changed` event.

Add a database function, `app.list_due_outbox_org_ids()`, which returns only
distinct organisation IDs with a due `PENDING` event or an expired
`PROCESSING` lease. It is `SECURITY DEFINER`, fixes the search path, and reads
only `OutboxEvent`; it returns neither organisation metadata nor event payloads.

The worker calls that function once, then retains the existing per-organisation
transaction and `applyTenantContext(tx, "", orgId)` before claiming and reading
events. It never receives cross-organisation event rows in the discovery step.

`OUTBOX_ORG_IDS` is removed from the scheduled workflow. The dispatch endpoint
URL and optional bearer token remain normal deployment-level integration
configuration, rather than school-specific setup.

## Alternatives Considered

1. Query every `Org` directly. Rejected because forced RLS intentionally makes
   this unavailable to the worker's normal runtime identity.
2. Add an `outboxDispatchEnabled` flag to every organisation. Rejected because
   it reintroduces manual lifecycle administration and can strand events.
3. Retain a GitHub secret list. Rejected because it does not meet automatic
   provisioning and is operationally fragile.

## Security and Failure Behaviour

- Discovery reveals an identifier only when dispatch work already exists.
- The function has no parameters, dynamic SQL, or caller-provided scope.
- The function's executable privilege is revoked from `PUBLIC`. The migration
  grants its deploying role for local/CI operation, and the production database
  deployment workflow and local production command programmatically grant the
  role encoded by the scheduled worker's `DATABASE_URL`; no organisation-specific
  configuration is involved.
- Each subsequent read and state transition stays under the discovered
  organisation's transaction-local RLS context.
- If the endpoint is unavailable, the established retry/dead-letter lifecycle
  remains responsible for the event. No event is silently dropped.

## Success Criteria

- No `OUTBOX_ORG_IDS` environment variable or validation remains.
- A due event causes its organisation to be discovered automatically.
- An organisation with no due events is not returned.
- Discovery returns only IDs, and event reads occur only after per-org RLS is
  applied.
- Existing duplicate-claim, retry, and dead-letter behaviour remains green.
