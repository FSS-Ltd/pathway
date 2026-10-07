# ACE core subject setup

## Problem and scope

Oasis lets a school head create, rename, and deactivate subjects in Academic
settings. NexSteps already stores `Subject` by `tenantId`, where a tenant is a
site, but its only subject-management API is under the paid Learning module.
ACE staff need a core subject catalogue to place students into PACE subjects
without purchasing Learning.

This slice adds ACE subject catalogue APIs. The Academic setup screen follows
in the next web slice. Learning logs, evidence, and report bundles keep their
existing paid entitlement. Subject codes in Oasis are display identifiers;
NexSteps uses a unique name per site and stable UUID references, so no code
column or schema migration is needed for the same catalogue outcome.

## Contract and security

- `GET /ace/subjects`: list active and inactive subjects for the trusted active
  site, ordered by `sortOrder` and name; requires `ace.settings.read`.
- `POST /ace/subjects`: create an active subject with a trimmed name and audit
  reason; requires `ace.settings.manage`.
- `PATCH /ace/subjects/:id`: rename an active subject with an audit reason;
  requires `ace.settings.manage`.
- `POST /ace/subjects/:id/deactivate`: deactivate a subject with an audit
  reason; requires `ace.settings.manage`. Existing student placements keep
  their subject references and remain visible; new placements cannot use it.
- All identifiers come from the trusted request context except the validated
  subject ID. Every query runs under tenant RLS and includes `tenantId`; the
  service verifies that the selected site belongs to the active organisation.
  A subject at another site returns not found.
- Writes and their audit event share one database transaction. Duplicate
  names return a conflict; invalid input returns a validation error.

## Rollout and verification

The existing `Subject` table and RLS policy remain unchanged. API and UI can
deploy separately: until the web slice lands, the new endpoints are unused by
the admin app. Verify permitted and denied roles, site switches, duplicate
names, deactivation with existing placements, audit rollback, and expired/absent
Learning add-ons. Stage before production and use the manual release workflow;
disable the ACE screen if a later web release fails. Existing subject and PACE
records are retained.
