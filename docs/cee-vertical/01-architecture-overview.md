# 01 - Architecture Overview

## 1. Problem statement

CEE runs a fragmented operation: independent member schools on a free, US-hosted record system (aceconnect), a 1,000+ child home-education arm (TEACH) coordinated by spreadsheets and email, and a central office with no consolidated view. The data sits on US servers, which is a residency and safeguarding problem for UK children's records. CEE has modest reserves and is highly price-sensitive, so the platform has to be one shared asset that compounds across schools and families, not a per-school custom build.

The product answer, already decided in the brief, is **CEE Connect**: one platform core, four branded surfaces.

- **CEE Connect for Schools** - the school operating system (attendance, children, groups, sessions, notes, documents, reporting).
- **Family Hub** - the parent visibility layer connected to a school or programme.
- **TEACH Hub** - the parent-led home-education operating system.
- **CEE Central** - central oversight across the network, aggregate by default.

The engineering answer is the subject of this package: evolve the NexSteps core in this repo into that ecosystem, scalable from the first deployment, without forking four codebases.

## 2. Why build on the NexSteps core

Both candidate codebases were reviewed.

**NexSteps (`pathway`, this repo)** is a production-grade pnpm + Turborepo monorepo:

- `apps/api` - NestJS 10, 30+ feature modules including `auth`, `orgs`, `tenants`, `children`, `groups`, `sessions`, `attendance`, `concerns`, `notes`, `handover`, `staff`, `invites`, `public-signup`, `billing`, `av30`, `audit`, `dsar`, `exports`.
- `apps/admin` - Next.js 14 operations dashboard.
- `apps/web` - Next.js 14 marketing and public signup.
- `apps/mobile` - Expo 54 React Native app.
- `apps/workers` - background job runner.
- `packages` - `auth`, `db` (Prisma/Postgres), `pricing` (plan catalog), `types`, `ui`, `config`, `util`, `mobile-core`.

Its data model already carries the exact concepts CEE needs: a two-level tenancy (`Org` as billing owner, `Tenant` as the isolation boundary), `UserOrgRole` / `UserTenantRole` / `OrgMembership` / `SiteMembership` RBAC, a full billing and entitlements engine (`Subscription`, `OrgEntitlementSnapshot`, `UsageCounters`, `BillingEvent`, `PendingOrder`), audit (`AuditEvent`), retention and DSAR (`OrgRetentionPolicy`, `OrgDeletedUser`, `DownloadToken`), safeguarding (`Concern`, `ChildNote` with parent-visibility approval), and an internal-org concept (`isMasterOrg`) for non-billable NexSteps use.

**Oasis (`oasis-portal.zip`)** is a lighter tRPC monorepo (`apps/web`, `apps/mobile`, `apps/api`, `packages/{ui,config,db,domain}`) with `invoices`, `students`, `incidents`, and `services` modules. It is useful as a reference for invoice modelling, which we harvest into the internal staff billing subsystem in `06`. It is less complete than NexSteps for multi-tenant operations.

**Decision (D1):** build CEE Connect on the NexSteps core. Reuse the tenancy, RBAC, billing, audit, and safeguarding foundations as-is. Harvest Oasis invoice patterns where useful. This matches the brief's instruction to reuse working code, avoid forks, and not over-scope.

## 3. The mapping from CEE concepts to existing code

| CEE Connect concept | Existing NexSteps model / module | Gap to close |
|---------------------|----------------------------------|--------------|
| Network / CEE oversight | none | **New** `Network` layer above `Org` (02, 03) |
| School (per-tenant) | `Org` + `Tenant` (Site) | Add `orgType = SCHOOL` |
| TEACH household | `Org` + `Tenant` | Add `orgType = TEACH_HOUSEHOLD`; lighter surface |
| CEE Central | `isMasterOrg` pattern + aggregate views | Add `orgType = CEE_CENTRAL`; aggregate-only access policy |
| Platform / FSS admin | `User.superUser`, master org | Promote to a clear Platform Admin trust zone |
| Child / learner | `Child` | Add learner-language aliases for TEACH |
| Guardian relationship | `User` ↔ `Child` (`ParentChildren`), `ChildGuardianContact` | Reuse |
| Staff relationship | `UserTenantRole`, `SiteMembership`, `Assignment` | Reuse |
| Class / group / cohort | `Group` | Reuse |
| Session / activity | `Session`, `Lesson`, `Assignment` | Reuse |
| Attendance | `Attendance`, `SessionStaffAttendance` | Reuse |
| Note / progress | `ChildNote` (parent-visible, approvable) | Reuse for Family Hub |
| Safeguarding concern | `Concern` (soft-delete) | Extend access controls (04) |
| Document / evidence | `Lesson.fileKey`, `Child.photoKey`, Supabase storage | **New** `Evidence` for TEACH |
| Learning log | none | **New** `LearningLog`, `Subject` for TEACH |
| Merit / reward | none | **New** `Merit` for TEACH |
| Report / export | `exports` module, `DownloadToken` | **New** `ReportBundle` generator for TEACH |
| Notification / message | `mailer`, `announcements` | Reuse, extend |
| Audit log | `AuditEvent` | Widen `AuditEntityType` coverage (04) |
| Billing / subscription | `billing` module, `Subscription`, `UsageCounters` | Reuse; add Network-level rollups |
| Usage meter | `UsageCounters`, `av30` | Reuse |
| Internal staff billing | none | **New** subsystem (06) |

The conclusion: most of CEE Connect is configuration and surface work on top of existing models. The genuinely new build is the `Network` layer, tenant typing, TEACH learning entities, Postgres RLS, and the internal staff billing subsystem.

## 4. Target architecture (high level)

```
                         ┌─────────────────────────────────────────────┐
   Public Web            │  Trust zones (detailed in 04)               │
   (marketing, leads)    │                                             │
        │                │  [Public]        [Tenant apps]              │
        ▼                │   marketing       schools / family / teach   │
 ┌──────────────┐        │                                             │
 │  apps/web    │        │  [CEE Central]   [Platform Admin / FSS]      │
 │  (Next.js)   │        │   aggregate       internal billing, support  │
 └──────────────┘        └─────────────────────────────────────────────┘
        │
        ▼
 ┌───────────────────────────────────────────────────────────────────┐
 │  Edge / CDN  →  Load balancer                                       │
 └───────────────────────────────────────────────────────────────────┘
        │
        ▼
 ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
 │ apps/admin   │   │ family surf. │   │ teach surf.  │   │ central surf.│
 │ schools ops  │   │ (Family Hub) │   │ (TEACH Hub)  │   │ (CEE Central)│
 │  Next.js     │   │  Next.js     │   │  Next.js     │   │  Next.js     │
 └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
        │                  │                  │                  │
        └──────────────────┴────────┬─────────┴──────────────────┘
                                     ▼
                        ┌────────────────────────────┐
                        │  apps/api  (NestJS)         │
                        │  surface-aware modules      │
                        │  RBAC + tenant guard + RLS  │
                        └─────┬───────────┬───────────┘
                              │           │
              ┌───────────────┘           └───────────────┐
              ▼                                            ▼
   ┌────────────────────┐                      ┌────────────────────────┐
   │ Postgres (London)  │                      │ apps/workers (BullMQ)  │
   │ primary + replicas │                      │ exports, reports,      │
   │ RLS, partitioning  │◄────── Redis ───────►│ notifications, usage,  │
   └─────────┬──────────┘    cache / queues    │ retention, margin roll │
             │                                 └────────────────────────┘
             ▼
   ┌────────────────────┐        ┌────────────────────┐
   │ Object storage     │        │ Stripe / GoCardless │
   │ (Supabase / S3 EU) │        │ subscription billing │
   │ docs, evidence,    │        └────────────────────┘
   │ photos, bundles    │
   └────────────────────┘
```

Principles:

- **One API, many surfaces.** A single NestJS API serves all four product surfaces. The surface is a property of the request context (derived from `orgType` / `tenantType` and the authenticated membership), not a separate backend. This is how we avoid forking four codebases while still giving each audience a tailored experience.
- **Surfaces start as route groups, not separate apps.** `apps/admin` already hosts the schools operations UI. Family Hub, TEACH Hub, and CEE Central begin as route groups and feature-flagged areas that share `packages/ui`, splitting into separate Next.js apps only when divergence in buyer, workflow, and roadmap justifies it (brief 3.2: "do not fork too early"). The API and package boundaries are drawn so a later split is a deployment change, not a rewrite.
- **The tenant boundary is the `Tenant` (Site).** Every tenant-owned row carries `tenantId`. Row-Level Security enforces it in the database; the application enforces it again in the guard layer. Defense in depth.
- **CEE Central reads aggregates, not raw child rows.** Oversight is served from aggregate views and reporting tables, never from unrestricted cross-tenant queries. Child-level access is an explicit, logged grant (04, D6).
- **Internal staff billing is a separate trust zone.** NexSteps cost, time, and margin data lives in a platform-scoped namespace that no tenant or CEE user can reach (06).

## 5. Surface responsibilities

| Surface | App today | Primary users | Reads | Writes |
|---------|-----------|---------------|-------|--------|
| CEE Connect for Schools | `apps/admin` | school staff, leaders | own tenant | own tenant |
| Family Hub | route group / mobile | parents, guardians | own children, published items only | preferences, consents, messages |
| TEACH Hub | new surface | home-ed parents (supervisors) | own household | learning logs, evidence, reports |
| CEE Central | new surface | CEE central team | aggregate across network | central config, templates, support notes |
| Platform Admin | new surface | NexSteps / FSS staff | all (provisioning, support, billing) | provisioning, internal billing |

## 6. Non-functional targets

These set the bar for "scalable from day one" and are expanded in `02` and `07`.

- **Availability:** 99.9% for authenticated tenant apps.
- **Latency:** p95 API < 300 ms for read endpoints under normal load.
- **Tenant scale:** design for 500 tenants and 100k learners without re-architecting; first deployment runs comfortably at CEE's real scale (tens of schools, ~2k pupils, 1k TEACH households).
- **Data residency:** UK / EU only.
- **Recovery:** RPO ≤ 15 min, RTO ≤ 1 hour, with tested restore drills.
- **Isolation:** zero cross-tenant data exposure, enforced at database and application layers.

## 7. What this buys CEE and FSS

For CEE: one auditable, UK-resident operating platform that replaces spreadsheets and US-hosted records, with parent transparency and central oversight, priced as a membership add-on rather than an enterprise MIS.

For FSS / NexSteps: one asset that compounds across schools and TEACH families instead of being rebuilt per school, plus internal visibility into cost-to-serve and margin (06) so the engagement stays above the 40% margin floor.
