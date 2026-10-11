# ACE-M15 identity provisioning evidence

**Build step:** 1.3e5u. **Status:** awaiting this step's CI and merge. Mobile
interface work remains paused; ACE-M15 itself is the shared API identity task.

The [ACE-M15 implementation checklist](../superpowers/plans/2026-07-25-ace-core-family-messaging.md)
requires invitation lifecycle and collision tests, provider-safe identity
binding, relationship-gated access, audit coverage, and restartable imports.
The plan's Auth0 wording predates the [Clerk migration](../superpowers/plans/2026-08-02-nexsteps-home-plan08-family-people-permissions.md).
Invitations create a pending internal user, not an external provider account;
acceptance obtains a verified provider email through
`family-verified-email.ts` (Clerk or legacy Auth0). The invitation URL contains
an opaque database ID, and `FamilyIdentityInvite` stores no reusable token.

The checklist maps to current code and tests as follows:

- **Lifecycle and collisions:** `family-invites.e2e.spec.ts`,
  `student-invites.e2e.spec.ts`, `family-identity-import.e2e.spec.ts`, and
  `identity-relationships.rls.e2e.spec.ts` exercise invited, accepted, expired,
  and revoked states; one guardian with two accepted children; one active
  student link; school approval; account reuse; and cross-tenant denial against
  PostgreSQL.
- **Provider identity and token:** `family-verified-email.ts` reads the
  verified Clerk primary email or legacy verified Auth0 claim. The two
  acceptance services require the addressed email and bind the authenticated
  internal user in the acceptance transaction. `FamilyIdentityInvite` has no
  token column.
- **Relationship before access:** The acceptance services create a guardian
  relationship or student link in the same transaction as accepting an invite.
  The HTTP suites assert a pending invite grants no link. The RLS suite checks
  current tenant relationships; guardian child-detail and student
  family-context probes deny unrelated children.
- **Audit:** `family-invite-operations.ts` records create, resend, revoke, and
  accept. Acceptance records relationship or link creation;
  `guardian-access-review.service.ts` and `student-access.service.ts` record
  removal. `staff.service.ts` records platform-authorized global account
  disable. The invitation HTTP tests, guardian access review unit tests, and
  `staff-administration-security.e2e.spec.ts` cover these paths.
- **Restartable import:** `family-identity-import.service.ts` processes bounded
  rows in order. The invitation services lock child and normalized email and
  reuse a matching historical invite on retry. The import HTTP suite tests
  duplicate rows, retry, account reuse, partial failure, and cross-tenant
  email use; no access begins before acceptance.

Step 1.3e5u closes a legal-access gap: the guardian invitation service now
requires confirmation for direct creation, import, and resend. Resend records
the freshly checked evidence basis and does not extend or mail an invitation
when confirmation is missing. The staff child profile asks for that review
before resending. The lifecycle HTTP suite covers expiry and revocation for
both guardian and student invitations.

Deploy the admin web app before the API for this change. The new client sends
the review body to either API version; after the API changes, an older open
staff page receives HTTP 400 on guardian resend until it is refreshed. No
pending invitation is extended or mailed by that denied request.

**Task counting:** The verified ACE master-plan count stays **42/150 (28%)**
until this step passes latest-head CI and merges. If those gates pass, the
shared API scope of ACE-M15 is evidenced as one additional complete task:
**43/150 (28⅔%, or 28.67%)**. ACE-M16 through M20, signed-in end-to-end portal
UAT, and mobile interface work remain separate gates. This record does not
approve a school pilot or claim every family reader has passed the ACE-M20
access matrix.
