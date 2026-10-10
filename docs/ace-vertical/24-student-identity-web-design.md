# Student identity web onboarding

**Build step 1.3e5n.** This is the web and API portion of ACE-M15. Mobile
identity and shell work remains paused.

## Problem and boundary

The student attendance and timetable readers already require an active,
single-child `StudentIdentityLink` and an enabled site policy. No production
command creates that link or enables the policy, so schools cannot onboard a
student through the web. Authentication alone must never create student data
access.

An organisation admin may enable student portal access for an ACE school site
and invite one student email for one non-guest child after confirming that the
school approved the account under its age and safeguarding policy. The
invitation is pending for seven days. It grants no access until the invitee
signs in with the verified invited email and accepts it. An admin can list,
resend, revoke, or end access. The invitation and policy decisions are audited.

**Product decision pending:** the ACE source matrix still marks the student
identity ADR open. The current implementation assumption is per-student school
approval rather than a fixed age threshold. If the product owner specifies a
minimum age, the API must enforce that from the child's recorded birth date
before this PR is merged. The UI confirmation alone is not an age check.

## Data, access, and failure behavior

Use existing `FamilyIdentityInvite`, `StudentIdentity`, `StudentIdentityLink`,
and `StudentPortalPolicy` rows. No migration is required. Lock the invitation
and child before acceptance; database partial unique indexes are the final
one-active-link-per-child and one-active-link-per-identity guard. A student
account cannot also be a guardian in the same site. Invite creation rejects
inactive or ambiguous existing accounts and a child already linked to another
active student account. Acceptance checks current policy, child, account,
verified email, invite lifetime, and active-link uniqueness again inside the
site RLS transaction. A disabled policy immediately hides student contexts and
denies direct student readers; it does not delete identity history.

Staff routes require `students.manage` plus current organisation-admin access
and selected-site context. Recipient routes use authenticated identity and a
fresh verified primary email, not the URL token as authority. Denials disclose
no other child's or account's details. The invitation URL contains only an
opaque database ID, and no reusable token is stored. Email delivery failures
leave a revocable pending invitation and tell staff to resend; no email or
birth date is written to logs.

## Web flow and verification

The child profile shows site policy and invitation controls only to the
organisation admin on ACE schools. It has loading, empty, pending, expired,
accepted, revoked, disabled-policy, error, and retry states. A separate
recipient page supports sign-in, verified-account mismatch, acceptance, and
return to the family landing. No student messaging route is offered.

Verify invitation lifecycle, wrong-account and cross-tenant denial, disabled
policy, duplicate child and identity, guardian overlap, revocation, and
disabled user in database-backed API tests. Verify staff and recipient web
states, focus and keyboard use, narrow layout, typecheck, lint, formatting,
build, and the final diff. Rollback hides the staff and recipient routes and
disables the student portal policy; existing records remain for audit.
