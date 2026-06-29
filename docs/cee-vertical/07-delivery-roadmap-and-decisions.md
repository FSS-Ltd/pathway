# 07 - Delivery Roadmap, Operations, and Decisions

## 1. Phasing principle

Build the shared core first, then one surface at a time, smallest viable scope each phase (brief risk 1). The internal staff billing subsystem (06) runs as a parallel track so margin visibility exists from day one, not after the engagement is already thin.

The financial reality (research: phased MVP £45k to £65k, price-sensitive client) means each phase has to be shippable and demonstrable on its own. Nothing here assumes a big-bang build.

## 2. Phases

### Phase 0 - Foundations (shared core)
- Schema Phase A additions: `Network`, `OrgType` / `TenantType`, `orgType` / `tenantType` / `networkId` columns, backfill (03.6).
- RLS wrapper and Phase B rollout in staging (02.3.1, 03.6).
- Policy/ABAC module in `packages/auth`; access-mode resolution (04.3, 05.6).
- Platform Admin trust zone and `PlatformRole` split (04.2).
- Read/primary client split; PgBouncer; one read replica (02.4.2).

Acceptance: a user signs in; access is scoped by tenant and role; RLS blocks a deliberately unscoped query in staging; an `INTERNAL` org behaves as today; provisioning a school Org with one Site works.

### Phase 1 - CEE Connect for Schools (reuse `apps/admin`)
- School Org + Site provisioning, staff management, children, groups, sessions, attendance, notes, basic reports, audit.
- Mostly configuration of existing modules; the new work is provisioning and `orgType = SCHOOL` plumbing.

Acceptance: a school onboards, adds children and staff, creates groups, takes attendance, and generates a basic report/export.

### Phase 2 - Family Hub
- Parent login (reuse `public-signup`, `apps/mobile`), child profile view, published notes (`ChildNote.visibleToParents`), attendance summary, shared documents via `PublishedItem`, notifications.
- `publishing` module is the new piece.

Acceptance: a parent securely sees only their own linked child's published information, and nothing else.

### Phase 3 - TEACH Hub
- Household Org/Site setup (`orgType = TEACH_HOUSEHOLD`), learner profile, `Subject`, `LearningLog`, `Evidence`, `Merit`, `ReportBundle` export.
- `learning` and `reports` modules are new; report generation runs on workers.

Acceptance: a home-educating parent records learning activity, uploads evidence, and exports an organised report bundle.

### Phase 4 - CEE Central
- Aggregate dashboards (tenant list, onboarding status, counts, attendance rates, usage), central templates, support notes, `NetworkReportingGrant` for the by-exception child-level access.
- `network` and `central` modules are new; reads from the replica and reporting views.

Acceptance: CEE sees adoption and high-level usage across participating tenants with no child-level exposure by default, and child-level only through a logged, school-granted, time-boxed grant.

### Parallel track - Internal staff billing (06)
- `internal` schema, `platform-billing` module, Platform Admin screens, margin rollup worker, below-floor alert.
- Independent of Phases 1 to 4; ship early so cost-to-serve is tracked from the start.

Acceptance: NexSteps staff log time against engagements; an approved week rolls up into a `MarginSnapshot`; an engagement below 40% raises an alert; cost-to-serve per school is reportable.

### Later (post-MVP)
- Table partitioning (Phase D) once volumes justify it.
- Region pinning for an EU-mainland cohort.
- TEACH curriculum planning, milestone/assessment tracking, tutor collaboration.
- Two-way messaging, event signups, payment links in Family Hub.
- Network-wide analytics and tenant health scoring in CEE Central.

## 3. Infrastructure, deployment, and operations

- **Region:** UK / EU only (London primary). Postgres, object storage, and backups all in-region. This is a hard requirement because of children's data residency.
- **Compute:** stateless API behind a load balancer with autoscaling; `apps/workers` as a separate scalable worker pool; `apps/web` / Next surfaces on the edge/CDN.
- **Data:** managed Postgres with primary + replica, PgBouncer, encryption at rest; Redis for cache, queues, and rate limiting; S3-compatible storage (Supabase/S3) with signed URLs.
- **Secrets:** no secrets in code or committed env files; managed secret store; the repo already separates `.env.example` from real env. The Nexus secure store convention (`~/.secrets/nexus/`) holds operator secrets.
- **CI/CD:** GitHub Actions (already present), per-PR checks, migration gating, preview deploys; production promotion is a deliberate step with rollback.
- **Backups / DR:** continuous backup, point-in-time recovery, RPO ≤ 15 min, RTO ≤ 1h, with a tested restore drill before go-live.
- **Observability:** structured logs, request tracing, metrics, and per-tenant usage counters; alerting on error rate, latency, queue depth, replica lag, and (06) margin floor.
- **Tenant lifecycle:** provisioning, suspension, export, and deletion runbooks; deletion honours retention policy and writes `OrgDeletedUser`.

## 4. Success metrics

| Area | Metric | Target |
|------|--------|--------|
| Adoption | schools onboarded; TEACH households active | tracked in CEE Central |
| Reliability | API p95 latency; availability | < 300 ms reads; 99.9% |
| Isolation | cross-tenant exposure incidents | zero |
| Safeguarding | sensitive records with full audit trail | 100% |
| Compliance | DSAR turnaround; restore drill pass | within statutory window; pass |
| Commercial | engagement margin (06) | at or above 40% |
| Cost-to-serve | cost per school served (06) | trending down with scale |

## 5. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Scope sprawl across four surfaces | High | High | Phase by surface; ship core first (brief risk 1) |
| R2 | "Unlimited sites" weakens pricing | Med | High | Org = billing boundary; custom/multi-site scope wording (brief risk 2) |
| R3 | CEE Central data-protection exposure | Med | High | Aggregate by default; `NetworkReportingGrant`, default deny (04.4, brief risk 3) |
| R4 | TEACH feels like renamed school system | Med | Med | TEACH-specific learning entities and language (03, brief risk 4) |
| R5 | Codebase duplication | Med | Med | One API, shared packages, surfaces as route groups (01, 05, brief risk 5) |
| R6 | RLS retrofit risk | Med | High | RLS from day one, phased per table, staged validation (02.3, 03.6) |
| R7 | Thin client margin erosion | High | Med | Internal staff billing + 40% floor alert (06) |
| R8 | Children's data residency breach | Low | High | UK/EU region pinning; storage and DB in-region (02.4.7, 03) |
| R9 | Low CEE budget cannot fund full build | High | Med | Phased MVP; each phase demonstrable; scale-up gate on margin/turnover (research) |

## 6. Open decisions (needed before coding)

1. ~~**Internal billing interpretation (D7).**~~ **Resolved 2026-06-28:** confirmed as full-scope cost-to-serve / margin tracking, as specified in `06`. The `internal` schema and all of its entities are in scope and built.
2. **TEACH tenancy shape.** One TEACH Org with many household Sites, or one lightweight Org per household. Affects billing granularity and onboarding. Recommendation: one TEACH Org per household for clean billing, grouped under the CEE Network, unless CEE wants to fund TEACH centrally (then one Org, many Sites).
3. **Surface split timing.** Confirm surfaces start as route groups (D5) rather than four separate Next.js apps. Recommendation: route groups first.
4. **Commercial model per school.** School-paid, CEE-funded network, or hybrid (brief 4.4). Determines where `Subscription` sits and how `06` attributes revenue.
5. **Auth provider.** Stay on Auth0 (already integrated via `UserIdentity`) for the CEE vertical, confirmed.
6. **Folder home for these docs.** Currently `docs/cee-vertical/` in this repo. Confirm, or move to the CEE vault folder if these should sit with the commercial material instead.
7. **Design-doc sign-off.** Per the FSS "no code without a design doc" rule, this package is the design doc. It needs human sign-off before any implementation phase starts.

## 7. What to do next

- Get sign-off on this package and the open decisions above.
- If green, start Phase 0 (foundations) and the internal billing track in parallel.
- Keep the CEE Context Pack and this folder in sync as decisions land.
