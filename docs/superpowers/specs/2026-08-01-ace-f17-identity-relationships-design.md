# ACE-F17 Student Identity and Guardian Relationships

**Owner:** Technical Agent  
**Status:** Approved model, pending written-spec review  
**Created:** 2026-08-01  
**Related plans:** `docs/superpowers/plans/2026-07-25-ace-core-foundation-access.md`, `docs/superpowers/plans/2026-07-25-ace-core-family-messaging.md`

## Problem statement

ACE needs authenticated guardians and, where a tenant permits it, authenticated
students. Authentication must not by itself confer access to child data. The
system needs durable, tenant-safe relationships that future family and student
facades can use to derive scope server-side.

The current `UserIdentity` model is the provider abstraction for Auth0 subjects
and maps each subject to a global `User`. It does not express a guardian role,
a student role, a child relationship, a legal-access state, or an invitation
lifecycle.

## Goals

- Reuse `User` and `UserIdentity` as the only authentication-provider link.
- Model guardian and student identities within a tenant without granting a
  `SiteMembership`, staff role, or data access.
- Support two or more guardians for a child and one guardian for multiple
  children.
- Allow one active student identity link for a child when that tenant enables
  the student portal.
- Retain relationship dates, legal-access status, and revocation metadata.
- Make cross-tenant relationship writes and reads impossible through composite
  foreign keys, forced RLS, and strict-RLS coverage.
- Record a delivery-neutral invitation lifecycle without storing a reusable
  invitation token.

## Non-goals

- Family or student portal endpoints, release policy, or UI.
- Creating Auth0 accounts or sending email. `ACE-M15` owns provisioning and
  delivery through the existing identity abstraction.
- Staff permissions, organisation membership, or site membership changes.
- Automatic access grants from an authenticated `User`.

## Approved architecture

```text
Auth0 subject
  -> UserIdentity (global provider link)
  -> User (global account)
  -> GuardianIdentity or StudentIdentity (tenant-scoped role identity)
  -> GuardianChildRelationship or StudentIdentityLink (tenant and child scope)
  -> future family or student facade derives accessible child IDs server-side
```

### Existing authentication boundary

`UserIdentity(provider, providerSubject)` remains globally unique and continues
to resolve an Auth0 subject to a `User`. It is an authentication fact only. F17
does not add a second provider-subject table and does not allow a global user ID
to stand in for a tenant or child relationship.

### New tenant-scoped records

`StudentPortalPolicy`

- One record per tenant.
- `studentPortalEnabled` defaults to `false`.
- The setting controls whether a new active student link may be created. It
  does not create accounts or expose routes.

`GuardianIdentity`

- References one `User` and one `Tenant`.
- Is unique on `(tenantId, userId)`.
- Represents an adult account that can be related to children in that tenant.
- Does not grant access until an active guardian-child relationship exists.

`StudentIdentity`

- References one `User` and one `Tenant`.
- Is unique on `(tenantId, userId)`.
- Represents a student account that can be linked to one child in that tenant.
- Does not grant access until an active student link exists and the portal
  policy permits student access.

`StudentIdentityLink`

- References `StudentIdentity`, `Child`, and `Tenant` through tenant-inclusive
  composite keys.
- Stores `linkedAt`, `endedAt`, `revokedAt`, `revokedByUserId`, and a required
  revocation reason when revoked.
- Uses partial unique indexes for one active link per child and one active link
  per student identity. Ended and revoked links remain as history.

`GuardianChildRelationship`

- References `GuardianIdentity`, `Child`, and `Tenant` through tenant-inclusive
  composite keys.
- Stores the relationship start and end dates, legal-access level, revocation
  fields, and the actor responsible for revocation.
- Supports multiple active guardians per child and multiple active children per
  guardian.
- Legal access is explicit: `FULL`, `LIMITED`, or `NONE`. Future read policies
  must require an active relationship and a level that permits the requested
  resource.

`FamilyIdentityInvite`

- References the invited global `User`, tenant, target type (`GUARDIAN` or
  `STUDENT`), optional child target, creator, and lifecycle timestamps.
- Stores `createdAt`, `expiresAt`, `acceptedAt`, `revokedAt`, `revokedByUserId`,
  and the accepted identity reference.
- Stores no raw or reusable invite token. The later provisioning workflow owns
  delivery and proof of acceptance through the provider abstraction.
- Reaching an accepted state does not create a guardian-child relationship or
  a student link implicitly. The later command service must create those facts
  explicitly and audit them.

## Integrity and RLS rules

- Every new table has a direct `tenantId`, `@@unique([id, tenantId])`, and
  tenant-inclusive foreign keys to tenant-scoped records.
- Cross-tenant joins are rejected by composite foreign keys before application
  code can interpret them.
- RLS is enabled and forced for each new tenant-owned table. The policy uses
  `current_setting('app.tenant_id', true)` and fails closed when no tenant
  context is present.
- `withTenantRlsContext` remains the production and test transaction path.
- The migration adds all tables to the strict-RLS inventory.
- Student and guardian relationship facts are mutable only for their lifecycle
  fields. F17 does not imply immutable fact history; later commands must audit
  lifecycle changes.

## Failure modes and recovery

| Failure mode | Prevention | Recovery |
| --- | --- | --- |
| An Auth0 user logs in without a family relationship | No relation is derived from `UserIdentity` alone | Return no family or student data. |
| A guardian is linked to a child in another tenant | Tenant-inclusive composite foreign keys and forced RLS | Reject the write with a foreign-key or RLS error. |
| An invitation is expired or revoked | Lifecycle timestamps checked by later commands | Preserve the record and reject acceptance. |
| A student portal is disabled after a link exists | Policy remains server-owned | Future student facade denies access without deleting history. |
| Legal access ends | End or revoke the relationship | Future child-scope lookup excludes the relationship immediately. |

## Security and privacy

- Provider subjects remain solely in `UserIdentity`; F17 does not duplicate
  them into tenant relationship tables.
- No raw invitation token is persisted or logged.
- Relationship access is derived by trusted server code, never from a
  client-supplied child ID alone.
- The schema PR includes cross-tenant, missing-context, expired, revoked, and
  supplied-child attack tests.
- Future invitation delivery that stores an email address must classify and
  protect that value using the repository's PII conventions before it is added.

## Rollout and rollback

The migration is additive. No existing user, child, role, or membership record
changes behaviour. Rollback before live identity data exists is to stop new
identity provisioning and leave the tables unused. After accepted relationships
exist, disable the future portal facade and preserve records for reviewed,
forward-only migration.

## Alternatives considered

| Option | Decision |
| --- | --- |
| Add a second Auth0-subject table for ACE | Rejected. It duplicates `UserIdentity` and risks diverging provider mappings. |
| Treat a `User` or `SiteMembership` as guardian access | Rejected. Neither proves a guardian-child relationship. |
| Allow student accounts globally | Rejected. Student access must be enabled by a tenant-owned policy and active identity link. |

## Success criteria

- A child can have multiple independently authorised guardian relationships.
- A guardian can have active relationships with multiple children.
- A student account has no data scope without an active tenant policy and
  student-child link.
- Authentication never grants family or student data by itself.
- Direct SQL rejects cross-tenant writes and reads for every F17 table.
- Expired and revoked invitations, and ended or revoked relationships, are
  retained but cannot create active access.

## Implementation sequence

1. Add failing RLS and integrity tests for the approved model.
2. Add the Prisma schema, focused migration, PII declarations if delivery data
   is introduced, and strict-RLS inventory entries.
3. Apply the migration, run the focused E2E suite, strict-RLS verifier, full
   workspace checks, independent review, and GitHub checks before merge.
