# ACE Access Recovery

## Purpose

Use this runbook when a role or assignment change is rejected with
`LAST_HEAD_PROTECTED` or `SELF_LOCKOUT_PROTECTED`, or when an organisation has
no usable typed access-management assignment because of an earlier data or
provisioning incident.

## Enforced safety boundary

Role updates, role retirement, and assignment revocation take an
organisation-scoped database transaction lock before applying the protected
mutation. The same transaction then verifies both invariants against the
post-mutation state:

- At least one distinct user has an active assignment to the active,
  organisation-scoped system role named `Organisation Head`.
- The actor retains both `platform.access.roles.manage` and
  `platform.access.assignments.manage` through active typed assignments. The
  two permissions may come from different active roles.

Active means the assignment is not revoked, has started, and has no expiry or
an expiry later than the database transaction time. Temporary legacy
`ORG_ADMIN` bootstrap authority does not satisfy either invariant.

A rejected request is rolled back with its audit and outbox writes. No cache
flush is needed for the rejected change because no access mutation commits.

## Safe response codes

- `LAST_HEAD_PROTECTED`: assign another active Organisation Head before
  retrying the revocation.
- `SELF_LOCKOUT_PROTECTED`: give the actor active typed assignments that
  provide both required management permissions, or have another authorised
  manager perform the change.

Do not rename, retire, edit, or recreate the protected system template through
customer role APIs. System-role mutation protection remains authoritative.

## Recovery procedure

1. Confirm the organisation ID, actor ID, request ID, attempted role or
   assignment ID, and response code from application logs.
2. Check that the attempted request did not commit an assignment revocation,
   role revision, audit event, or access-change outbox event.
3. Check current assignment windows using database time. Do not treat a legacy
   `ORG_ADMIN` membership as an active head or typed management grant.
4. If another active head exists, have that user assign the required typed
   role through the normal API, then retry the original change.
5. If no active head exists because of a provisioning or data incident, stop
   custom role mutations and escalate to the platform security owner. Restore
   the protected Organisation Head template through the dedicated system-role
   seed identity and create the replacement assignment through an approved,
   audited operational procedure.
6. After recovery, invalidate affected user access caches and confirm the
   access-change outbox has converged. Verify that role and assignment reads
   remain organisation-scoped under forced RLS.

Never bypass the invariant by editing a system role, counting an inactive
assignment, or granting authority only through the temporary legacy bootstrap.

## MFA and step-up deferral

MFA and sensitive-action step-up enforcement are deferred until Pathway has the
required Auth0 Pro capability. This release does not implement token-claim
parsing, freshness checks, `STEP_UP_REQUIRED`, a feature flag, or a no-op
security boundary.

Until that commercial capability is available, recovery relies on the
transactional last-head and self-lockout controls, typed assignments, system
role protection, forced RLS, audit records, access-change outbox delivery, and
the dedicated system-role seed identity. Step-up must be designed and reviewed
as a separate security change before it can become an enforcement boundary.

## Rollback

If the safety path is unavailable, disable custom role mutations and assignment
writes while keeping role and assignment reads available. Do not disable the
database system-role protection, forced RLS, audit, outbox, or cache expiry
controls.
