# 05 - API and Module Map

One NestJS API (`apps/api`) serves every surface. The surface is resolved from the authenticated context, not from a separate backend. This document maps the existing modules to CEE Connect and lists what is reused, extended, or new.

## 1. API boundary conventions

- **Transport:** REST over HTTPS, as today. (Oasis uses tRPC; we stay on the NexSteps NestJS REST surface for consistency with the existing apps and mobile client.)
- **Versioning:** path-versioned (`/v1/...`). New CEE surfaces ship under the same versioned API.
- **Tenant context:** resolved server-side from the authenticated user's membership plus the active site (`User.lastActiveTenantId` already exists for remembering the active site). The client may request a site, but the server validates membership and sets the RLS GUCs (02.3.1). The client never asserts a tenant id that is trusted.
- **Access mode:** every request runs in `tenant`, `aggregate`, or `platform` mode, set by the guard from the resolved roles. This drives RLS and the policy layer (04).
- **Errors:** typed errors, `throw new Error()` subclasses, never string throws (house TypeScript rule). 403 for policy denials with a stable error code; 404 where existence itself is sensitive.
- **Validation:** every input validated with the existing validation approach (Zod/Nest pipes) before it reaches a service.

## 2. Module map

Legend: **R** reuse as-is, **E** extend, **N** new.

| Module (`apps/api/src/...`) | State | CEE role |
|------------------------------|-------|----------|
| `auth` | E | add platform/network role resolution, access-mode selection |
| `orgs` | E | add `orgType`, `networkId`; Network membership |
| `tenants` | E | add `tenantType`; surface resolution |
| `users` | R | identities, profiles |
| `invites` | R | onboarding for schools, TEACH, central |
| `public-signup` | R | parent self-signup (Family Hub onboarding) |
| `children` | E | learner aliasing for TEACH; widen audit |
| `groups` | R | classes / cohorts |
| `sessions` | R | sessions / activities |
| `attendance` | E | partitioning-aware reads (02.4.2) |
| `notes` | E | `PublishedItem` integration for Family Hub |
| `concerns` | E | safeguarding permission split, sealed notes (04.7) |
| `handover` | R | group handover logs |
| `staff` | R | staff scheduling, swaps, preferences |
| `announcements` | R | parent/staff targeting |
| `mailer` | E | notification fan-out via workers (02.4.4) |
| `billing` | E | Network-level rollups; per-`orgType` plans |
| `av30` | R | active-staff metering |
| `audit` | E | wider `AuditEntityType`, view auditing |
| `dsar` | R | subject access requests |
| `exports` | E | per-child `ReportBundle` generation |
| `preferences` | R | user preferences |
| `leads` | R | marketing lead capture |
| `blog` | R | platform-wide content |
| `health` | R | LB / autoscaler probes |
| `tenants`/RLS layer | N | per-request GUC transaction wrapper |
| `network` | N | Network CRUD, reporting grants (04.4) |
| `central` | N | CEE Central aggregate reporting endpoints |
| `learning` | N | `Subject`, `LearningLog`, `Evidence`, `Merit` (TEACH) |
| `reports` | N | `ReportBundle` request + status (worker-backed) |
| `publishing` | N | `PublishedItem` publish/unpublish for Family Hub |
| `platform-billing` | N | internal staff billing API (06), platform-only |

## 3. New modules in detail

- **`network`** - Network entity, Org-to-Network membership, `NetworkReportingGrant` lifecycle. Platform Admin and CEE Owner can manage; child-level grants require a school admin (04.4).
- **`central`** - read-only aggregate endpoints for CEE Central: tenant list, onboarding status, pupil/learner/active-user counts, attendance rates, usage. Served from reporting views and the read replica (02.4.2). Returns no child rows unless a grant is present.
- **`learning`** - TEACH learning logs, subjects, evidence, merits. Parent-supervisor is the primary writer. Evidence upload returns a signed URL; bytes go to object storage.
- **`reports`** - accepts a `ReportBundle` request, enqueues a worker job, returns status; download via `DownloadToken`.
- **`publishing`** - the single place that decides what a Family Hub parent sees, writing `PublishedItem` and auditing it.
- **`platform-billing`** - internal staff billing (06). Mounted behind a platform-only guard, ideally on a separate route prefix and, in production, reachable only from the Platform Admin surface.

## 4. App surfaces

| Surface | Today | Plan |
|---------|-------|------|
| Marketing + signup | `apps/web` (Next.js) | reuse |
| Schools operations | `apps/admin` (Next.js) | reuse as CEE Connect for Schools |
| Parent mobile | `apps/mobile` (Expo) | reuse for Family Hub + TEACH parent |
| Family Hub web | - | route group in `apps/admin` shell or a thin new app, sharing `packages/ui` |
| TEACH Hub web | - | new surface, learner-led language, shares core |
| CEE Central web | - | new surface, aggregate dashboards |
| Platform Admin web | - | new surface, internal staff billing + provisioning + support |

Decision D5 restated: surfaces start as route groups and feature-flagged areas sharing `packages/ui`, and split into separate Next.js apps only when buyer, workflow, and roadmap diverge enough to justify the operational cost. The API and packages are drawn so a split is a deployment change, not a rewrite.

## 5. Shared packages

| Package | CEE use |
|---------|---------|
| `packages/db` | Prisma schema deltas (03), RLS wrapper, read/primary client split |
| `packages/auth` | policy/ABAC module (04), access-mode resolution |
| `packages/pricing` | plan catalog extended for `orgType`-aware plans and Network agreements |
| `packages/types` | shared DTOs and enums for new entities |
| `packages/ui` | shared components + surface label mapping (03.7) |
| `packages/config` | per-surface and per-region config |
| `packages/util` | shared helpers |
| `packages/mobile-core` | shared mobile logic for Family Hub / TEACH |

## 6. Surface resolution flow

```
request
  → authenticate (Auth0 identity → User via UserIdentity)
  → resolve memberships (UserOrgRole, UserTenantRole, OrgMembership,
                         SiteMembership, PlatformRole, Network grants)
  → determine target site/org and validate membership
  → choose access_mode:
        platform   if PlatformRole present and platform route
        aggregate  if CEE_CENTRAL role and no child-level grant
        tenant     otherwise (scoped to one Tenant)
  → open DB transaction, SET LOCAL app.current_tenant / current_org / access_mode
  → policy layer authorizes the specific action
  → handler runs; sensitive reads/writes audited
```

This single flow is what lets one API serve four product surfaces while keeping each tenant, CEE Central, and Platform Admin in its own lane.
