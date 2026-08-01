# Technical Note: NexSteps legacy surface, Batch B and C (post ACE-F14 Batch A)

## Problem

ACE-F14 cuts the ACE `/access/*` routes (R01-R14) and NexSteps Batch A
(announcements, attendance) over to typed permissions, deleting the last
route-level authorisation that read a role display name. Eight further
NexSteps controllers still authorise from a role name, a raw Prisma role
lookup, or nothing at all: `children`, `groups` (classes), `parents`,
`lessons`, `orgs`, `staff`, `assignments` (session assignments), and
`learning`. None of the eight can be migrated by adding a decorator alone.
Each is blocked on one of two things: a permission key that does not exist
yet, or a commercial vertical-entitlement decision that is not a security
question and should not be made inside a security cutover.

## Context

`docs/ace-vertical/01-source-and-access-matrix.md`'s 68 exact routes and the
NexSteps Batch A table (N01-N12) are the only routes ACE-F14 brings under
`PermissionGuard`. The product owner chose to include the full legacy
NexSteps surface in ACE-F14's scope; this note is the accounting of what
that scope actually requires before the remaining eight controllers can
follow the same pattern.

## Batch B: entitlement-blocked (children, classes, parents, lessons)

### What's missing

Five registry keys don't exist: `classes.read`, `children.read`,
`parents.manage`, `lessons.read`, `lessons.manage`. Adding them is
mechanical. It is not the blocker.

### The actual blocker

`packages/platform/src/capability-maps.ts` is, by its own header comment,
"the commercial entitlement authority" - it decides which vertical gets which
capability, and that decision has commercial consequences (a vertical that
doesn't hold a capability can't be sold access to the route gated on it).
Today:

- `children.manage` is granted to `NURSERY` only.
- `classes.manage` and `parents.read` are granted to every vertical except
  `CHURCH`, `CHARITY`, and `CLUB`.

But `/children`, `/groups`, and `/parents` are live routes serving `CHURCH`
organisations today (`apps/api/src/children/children.controller.ts`,
`apps/api/src/groups/groups.controller.ts`,
`apps/api/src/parents/parents.controller.ts` - none has any role or
capability check currently). Migrating these controllers to
`@RequirePermission` without first widening their capability grant would
lock out every CHURCH customer using them right now.

## Options

### Option A: Move the four keys into `PLATFORM_CORE_CAPABILITIES`

Treat children/classes/parents/lessons as core NexSteps surfaces available
to every vertical, matching how `attendance.*` and `notices.*` are already
modelled (Batch A used exactly this precedent).

Pros: matches existing precedent; no per-vertical decision to maintain;
simplest to reason about and to test.
Cons: forecloses ever selling these as a paid add-on to a vertical that
doesn't have them today; a de facto pricing decision made via a capability
map edit.

### Option B: Add per-vertical grants for `CHURCH`/`CHARITY`/`CLUB`

Extend `VERTICAL_CAPABILITIES.CHURCH` (and `CHARITY`, `CLUB`) with the four
keys explicitly, leaving the map's existing shape (some verticals get it,
some don't) intact.

Pros: preserves the option to price this differently per vertical later;
smallest capability-map diff.
Cons: does not resolve NURSERY-only `children.manage` for other verticals
that also run children/groups/parents routes (an open question in its own
right - which verticals besides NURSERY and CHURCH currently rely on child
records?); more entries to keep in sync as verticals are added.

### Option C: Leave these controllers on legacy checks

Do not migrate; leave `children`/`groups`/`parents`/`lessons` on their
current relationship-check-only or role-name authorisation. Revisit once the
commercial question is settled on its own timeline.

Pros: zero risk of a lockout regression; no premature entitlement decision
under time pressure.
Cons: `children.controller.ts:88-97` and `:171-173` and
`parents.controller.ts:128-146` keep authorising from a role display name
(`"SITE_ADMIN"` literal, `UserOrgRole.ORG_ADMIN`) indefinitely, which is
exactly what ACE-F14 exists to remove; the acceptance criterion stays
unmet for this slice of the surface.

## Recommendation

Option A for `attendance.*`/`notices.*` parity already set precedent that
NexSteps' baseline CRUD surfaces (as opposed to ACE's paid verticals) are
core capabilities, not add-ons. The same reasoning applies here: children,
classes, parents, and lessons are baseline NexSteps functionality, not an
ACE or paid-module feature. Recommend Option A, with the explicit
acknowledgment that it forecloses selling these as a differentiated add-on
later - if that possibility matters commercially, choose Option B instead
and accept the larger, longer-lived capability map.

## Questions

1. Confirm Option A vs Option B for `classes.read`/`children.read`/
   `parents.manage`/`lessons.read`/`lessons.manage`.
2. Under either option, does `children.manage` also need to widen beyond
   `NURSERY`? `children.controller.ts` is not vertical-gated today, so any
   vertical's organisation can currently create/edit children.
3. Once the entitlement question is settled: `children.controller.ts`'s
   `assertCanEditChild`/`assertCanInviteParent` (guardian-relationship
   checks in `children.service.ts`) are the relationship layer of the
   matrix formula and must be preserved, not replaced, when the permission
   guard is added on top.

## Timeline

Not a blocker for ACE-F14 shipping; Batch A (already merged) and R01-R14
(already merged) satisfy the acceptance criterion for the ACE and
access-administration surface. This batch can land whenever the commercial
decision is made.

---

# Technical Note: NexSteps legacy surface, Batch C (per-controller blockers)

## Problem

Four further controllers - `orgs`, `staff`, `assignments` (session
assignments), and `learning` - each have a distinct, controller-specific
blocker that a commercial decision alone won't resolve.

## `orgs.controller.ts`

- `POST /orgs/register` is deliberately public (no guard at all - new
  organisation signup). Any future migration of this controller must apply
  `@RequirePermission` per handler, never at the class level, or it would
  accidentally gate the public signup route.
- The remaining routes (`GET /orgs/export`, `POST /orgs/deactivate`,
  `PATCH /orgs/current`, etc.) are gated by a private `ensureOrgAdmin()`
  method that does a raw Prisma lookup and throws `UnauthorizedException`
  (401), not `ForbiddenException` (403) - inconsistent with every other
  guard in the codebase. The exact same method is duplicated verbatim in
  `platform.controller.ts`.
- No permission key exists for "manage organisation settings" today.

**Needed before migration:** a `platform.org.settings.manage`-shaped key
(name TBD), a decision on which persona holds it (organisation-head only,
per the existing `ORG_ADMIN`-only gate), and a fix to the 401→403 and
duplicated-method issues as part of the same change (they're pre-existing
defects independent of ACE-F14, but touching this controller is the moment
to fix them).

## `staff.controller.ts`

- `hr.staff` exists in the registry but is gated by `requiredModule: HR`
  and held by no system role template - using it here would deny every
  organisation head by default until `pnpm db:seed` re-runs and someone
  decides HR-module organisations are the only ones that can administer
  staff, which is almost certainly not the intended scope (every vertical
  has staff to administer, not just HR-module subscribers).
- `PATCH /staff/:userId` needs a distinct "site staff administration" key,
  separate from `hr.staff`.
- The privilege-escalation defect in this controller (any user could set
  their own `role` field via this endpoint) was fixed independently in
  `fix/staff-role-escalation` - unrelated to and not blocked by this note.

**Needed before migration:** a new key (e.g. `staff.manage`, name TBD) added
to the registry and to `organisationHead`/`siteLead` templates.

## `assignments.controller.ts` (session/class assignments - distinct from
the access-control `/access/assignments` routes)

- No permission key exists for session-assignment read/manage today.
- Current authorisation is `self-only unless SiteRole.SITE_ADMIN`
  (`assignments.service.ts`) - a role-name check that predates the typed
  system.

**Needed before migration:** a read/manage key pair (e.g.
`sessions.assignments.read`/`.manage`, name TBD), added to the registry and
templates.

## `learning.controller.ts`

- Already uses `@RequireCapability` (org-level module entitlement via
  `CapabilityGuard`), which answers "did the org buy Learning", not "may
  this user do this" - the two guards are not equivalent, and Batch A's
  precedent of using `PermissionGuard` alone (since it already subsumes the
  capability check for `platform.access.*`-style keys) does not apply here
  cleanly, because `learning.*` keys have `requiredModule: LEARNING` set
  explicitly, unlike the Batch A keys.
- The five `learning.*` keys (`learning.log.read`, `learning.log.write`,
  `learning.evidence.read`, `learning.evidence.write`,
  `learning.reports.generate`) are in **no** system role template today.
  Adding `@RequirePermission` alongside the existing `@RequireCapability`
  today would deny every organisation head, since none of them hold these
  keys via any active assignment.

**Needed before migration:** add the five keys to
`organisationHead`/`siteLead`/`staff` templates (matching the plan's
guidance from the admin nav gap analysis, which already flagged that
Learning's admin nav item is capability-gated only, with no permission
layer). Requires `pnpm db:seed` to re-run for every existing org before the
decorators land, or every org head loses Learning access on deploy.

## Recommendation

All four are small, independent changes (one or two registry keys plus a
template update each) with no shared dependency on each other or on the
Batch B decision above. Recommend picking these up as their own follow-on
PRs once a registry-key owner confirms names, rather than bundling with
Batch B - the `orgs`/`staff`/`assignments` gaps are pure additions
(no entitlement question), and `learning` only needs its existing keys
added to templates, not new keys invented.

## Timeline

Same as Batch B: not a blocker for ACE-F14's acceptance criterion, which is
already satisfied for R01-R14 and NexSteps Batch A.
