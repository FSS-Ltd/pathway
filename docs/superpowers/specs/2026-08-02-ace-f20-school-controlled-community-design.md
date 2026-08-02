# ACE-F20 School-Controlled Community Storage

**Owner:** Technical Agent  
**Status:** Under Review  
**Created:** 2026-08-02  
**Related docs:** `docs/superpowers/plans/2026-07-25-ace-core-foundation-access.md`, `docs/superpowers/plans/2026-07-25-ace-core-learning-faith-trips-reports-community.md`, `docs/NexSteps-ACE-Vertical-Build-Plan.md`

## Problem statement

ACE schools need a moderated Student Community that belongs completely to the school. A school decides whether Community is active, who may create and manage groups, which children belong in each group, which staff participate, and how reported content is handled. NexSteps supplies the software only. It has no Community-content feed, moderation queue, or other access path into a school's Community.

This is distinct from NexSteps Home Community. The two products must not share storage, permissions, participants, moderation, or visibility rules.

## Goals

- Add a tenant-owned, fail-closed Community setting. An absent policy row means Community is disabled.
- Allow schools to define Community groups with one of two administrator-selected membership rules:
  - a fixed, manually maintained child list; or
  - an inclusive age range whose eligible children change automatically as their ages change.
- Permit School Admins and users granted the appropriate typed capability to create and manage groups.
- Make staff participation explicit: an authorised staff member may post only when assigned to that group.
- Allow active student identities to post and reply only in Community groups for which they are currently eligible.
- Store posts, replies, read cursors, reports, moderation actions, and restricted safeguarding references with strict tenant isolation.
- Preserve original reported or hidden content as school-owned moderation evidence without duplicating safeguarding-case detail.
- Make student direct messages structurally impossible.

## Non-goals

- NexSteps Home Community, cross-school communities, public communities, or a shared Community data model.
- A NexSteps platform moderator, a platform-content feed, or a platform escalation queue.
- Any generic participant, conversation, thread-recipient, or direct-message model.
- Community APIs, permission registration, admin UI, student mobile UI, realtime delivery, notifications, or the runtime membership projection. Those belong to ACE-C19 through ACE-C23.
- Parent/guardian participation in ACE Student Community.
- Reusing academic `Group` records as Community groups. Their lifecycle and membership semantics are different.

## Approved product decisions

- Community remains ACE core. This foundation introduces no separately priced Community add-on.
- The school, not NexSteps, controls enablement, group membership, staff participation, moderation, and retention.
- A School Admin or a user granted the standard `ace.community.spaces.manage` capability may create and manage groups. School moderation uses the protected `ace.community.moderate` capability.
- A group has either explicit child membership or an automatically evaluated age range. An age-range group's child membership is not copied into a mutable projection table.
- An authorised staff member may post only after the school assigns that staff member to the group.
- Reports and moderation remain inside the reporting school. NexSteps receives no Community content as a consequence of a report or a guideline breach.

## Recommended design

ACE-F20 introduces the following tenant-owned models. Names use the `AceCommunity` prefix to prevent accidental coupling to NexSteps Home Community.

### Policy and groups

`AceCommunityPolicy` has one optional row per tenant. It contains `communityEnabled`, defaulting to `false`, and standard timestamps. No row is treated exactly like a disabled policy. The later Community feature service will require an enabled policy before exposing any Community route, navigation, notification, or realtime channel.

`AceCommunityGroup` is a tenant-owned Community space with a name, optional description, creator, active state, and `membershipMode`:

- `MANUAL` groups use explicit `AceCommunityGroupChildMember` rows.
- `AGE_RANGE` groups store an inclusive `minimumAge` and `maximumAge`. A child is eligible only while their age, evaluated against the tenant's current local date, is within that range and the child has an active `StudentIdentityLink` in the tenant.

Database checks make the two modes mutually exclusive: manual groups cannot carry an age range and age-range groups cannot carry manual child-member rows. Age ranges must be non-negative and ordered. Administrators retain discretion by choosing the mode and, for manual groups, the named children.

`AceCommunityGroupStaffMember` is a separate explicit staff assignment. It records the staff user, group, tenant, and group role. A staff member must be a current site member and an assigned group member before later commands allow them to post. The record may also support a group-level moderator designation, while final authority remains the school's typed permission system.

### Content and read state

`AceCommunityPost` and `AceCommunityReply` are tenant- and group-scoped. Both record the author, timestamp, body, and content visibility state. The database validates that the author is either:

- an active student identity linked to a child currently eligible for that group; or
- an explicitly assigned staff member in that group.

The schema contains no recipient, participant, conversation, or one-to-one relation. Every post and reply belongs to exactly one Community group.

`AceCommunityReadCursor` records a user’s latest read position for one group. It is group-scoped rather than conversation-scoped, so it cannot be repurposed as direct-message read state.

### School moderation and safeguarding references

`AceCommunityReport` targets exactly one post or reply, enforced by a one-of database constraint, and records the reporting actor, reason category, and timestamp. `AceCommunityModerationAction` records the school moderator, action, rationale, and evidence snapshot. Actions and original evidence are immutable; hiding or removing content changes ordinary Community visibility without deleting the evidence needed by the school.

`AceCommunitySafeguardingReference` links exactly one moderation action or report to a restricted `Concern` ID. It stores no case summary, case notes, or copied safeguarding payload. A database trigger verifies that the referenced concern belongs to a child in the same tenant, because the existing `Concern` record reaches its tenant through `Child`.

Only the school's Community moderators and safeguarding workflow will receive these records in later application slices. The Community tables and their RLS policies include no NexSteps platform-access exception.

## Access and data flow

1. A school administrator creates the optional policy and enables Community.
2. An authorised staff member creates a manual or age-range group and assigns participating staff.
3. For a manual group, the administrator adds or removes children explicitly. For an age-range group, eligibility updates automatically whenever a child enters or leaves the configured range.
4. An eligible student, or an assigned staff member, creates a post or reply in that group. A later API derives the actor and rechecks policy, tenant, membership, and typed capability before every action.
5. A school member reports content. School moderators can hide, restore, remove, or otherwise act on the content while preserving the underlying report and evidence.
6. If the school escalates a matter to safeguarding, the Community domain stores only a same-tenant restricted `Concern` reference. Community never reads safeguarding case detail.

## Security and privacy

- Every Community table includes `tenantId`, uses composite same-tenant foreign keys where possible, and has forced tenant RLS. Missing tenant context and cross-tenant access fail closed.
- Tenant RLS establishes the storage boundary in ACE-F20. ACE-C19 will add the runtime feature, active-membership, and typed-permission checks needed for individual user access. It must fail closed when the policy is absent or disabled.
- The only automatic child audience is an administrator-defined age range. It is evaluated from tenant-owned child and active student-identity data, not from external or cross-school information.
- No new table may have a foreign key shape that can represent a direct student-to-student conversation or recipient list.
- Community reports, moderation actions, and safeguarding references are school data. NexSteps has neither a normal read policy nor a privileged content-copy model.
- Sensitive safeguarding text remains in the existing safeguarding domain. Community stores restricted identifiers only.

## Failure modes and recovery

- A missing or disabled policy leaves Community inaccessible when ACE-C19 adds the runtime gate.
- An age-range group cannot accidentally become a manual group, and its eligibility updates without a stale membership job.
- A manual membership or staff assignment from another tenant is rejected by composite foreign keys and RLS.
- A student whose identity link is ended or revoked immediately ceases to be eligible for posting and reading when runtime membership checks are introduced.
- Hidden or removed content remains available to authorised school moderation workflows as immutable evidence; it is not deleted by the visibility action.
- A cross-tenant or malformed safeguarding reference is rejected, and no safeguarding details are copied into Community.
- The migration is additive. Rollback consists of disabling the school's policy and retaining Community records privately for school audit and retention needs.

## Verification

The ACE-F20 integration tests will prove that:

- absent and disabled policies fail closed;
- manual groups admit only their selected children;
- age-range eligibility is automatic and inclusive, including the point at which a child enters or leaves the range;
- staff must be explicit members of a group before they can be accepted as a Community author;
- student authors require an active tenant-scoped student identity and current group eligibility;
- reports and hidden content are preserved, and moderation evidence cannot be altered;
- safeguarding references contain no case detail and cannot point across tenants;
- all Community tables fail closed across tenant contexts and with no tenant context; and
- the Prisma schema exposes no direct-message participant, recipient, or one-to-one Community model.

## Implementation boundary

ACE-F20 changes only the Prisma schema, additive migration, strict RLS inventory, and Community storage integration tests. It deliberately does not add the API or user experience that exposes this data. The immediately following Community slices must use this model and enforce school-owned enablement, typed capabilities, group eligibility, moderation, and the absence of student DMs.

