# ACE Advanced Reporting Add-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe cross-site ACE analysis, governed metric definitions, richer exports, dashboard comparison, and scalable aggregate queries beyond core site reporting.

**Architecture:** Advanced Reporting consumes documented ACE operational facts and projections through a governed aggregate layer. It does not bypass domain services or query unrestricted child rows from the browser. Small-group suppression, tenant scope, permission, entitlement, freshness, and export purpose are enforced server-side.

**Price and packaging:** £10/month or £100/year, **Proposed**. Included in Growth and Professional. Eligible for Operations and All Included.

## Global Constraints

- Do not create Stripe Products/Prices while Proposed.
- Core single-site operational reporting remains available without this add-on.
- Advanced Reporting may compare authorised sites but never organisations/tenants.
- Every metric defines calculation, unit, window, denominator, exclusions, correction handling, timezone, freshness, grain, and suppression rule.
- No child-level export is created merely because a user can see an aggregate.
- Do not introduce a warehouse until measured production volume exceeds the documented PostgreSQL projection boundary.

---

### Task 1: ACE-AR01 - Add commercial and entitlement rules

**Branch:** `feat/ace-advanced-reporting-entitlement`

**Files:**
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Test: `apps/api/src/billing/addon-catalog.spec.ts`
- Test: `apps/api/src/advanced-reporting/tests/advanced-reporting-entitlement.e2e.spec.ts`

- [ ] Encode £10/£100 Proposed, Growth/Professional inclusion, and Operations/All Included eligibility.
- [ ] Separate core `site_reporting.read` from add-on cross-site, comparison, scheduled, and export capabilities.
- [ ] Test direct, plan-included, bundle-included, suspended, cancelled, wrong tenant, and duplicate-charge cases.
- [ ] Keep Stripe identifiers absent while Proposed.

**Acceptance:** Core reports remain accessible while add-on-only routes fail closed without entitlement.

**Rollback:** Remove inactive catalogue/capability entries.

### Task 2: ACE-AR02 - Define the governed metric catalogue and privacy policy

**Branch:** `feat/ace-advanced-metric-contracts`

**Files:**
- Create: `packages/ace-domain/src/advanced-metrics.ts`
- Create: `packages/platform/src/reporting/privacy-policy.ts`
- Test: `packages/ace-domain/src/advanced-metrics.spec.ts`
- Create: `docs/adr/ace-advanced-reporting-metrics.md`

```ts
export interface MetricDefinition {
  key: string;
  calculation: string;
  unit: "count" | "percentage" | "days" | "pace";
  grain: "site-day" | "site-week" | "site-term";
  minimumCohortSize: number;
}
```

- [ ] Define cross-site PACE, attendance, behaviour-stage, homework, slip, and report-publication metrics using core contracts.
- [ ] Test empty denominators, late corrections, timezone/term boundaries, cohort filters, small groups, and unsupported dimensions.
- [ ] Suppress or coarsen results below configured cohort thresholds and return an explicit suppressed state.
- [ ] Obtain product/data-owner approval for every first-release metric.

**Acceptance:** A reader can reproduce each metric and understand why a result is absent or suppressed.

**Rollback:** Remove unapproved definitions before projections consume them.

### Task 3: ACE-AR03 - Build aggregate projections and refresh jobs

**Branch:** `feat/ace-advanced-reporting-projections`

**Files:**
- Create: `apps/workers/src/reporting/refresh-ace-analytics.job.ts`
- Create: `apps/api/src/advanced-reporting/analytics-projection.repository.ts`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_ace_analytics/migration.sql`
- Test: `apps/workers/src/reporting/refresh-ace-analytics.job.spec.ts`

- [ ] Store tenant/site/period aggregate rows only at approved grain with strict RLS and freshness/source-version metadata.
- [ ] Test initial build, incremental correction, late event, deleted projection, duplicate job, multi-site tenant, and rebuild determinism.
- [ ] Add unique grain keys and indexes for tenant, site, metric, period, and filter dimensions.
- [ ] Record refresh duration, lag, row count, correction count, and failure.

**Acceptance:** Aggregate rebuilds are deterministic and never create cross-tenant rows.

**Rollback:** Drop/rebuild projections from core facts; never modify core data.

### Task 4: ACE-AR04 - Implement comparison, trend, drill, and export APIs

**Branch:** `feat/ace-advanced-reporting-api`

**Files:**
- Create: `apps/api/src/advanced-reporting/advanced-reporting.controller.ts`
- Create: `apps/api/src/advanced-reporting/advanced-reporting.service.ts`
- Create: `apps/api/src/advanced-reporting/advanced-reporting-export.service.ts`
- Test: `apps/api/src/advanced-reporting/tests/advanced-reporting.e2e.spec.ts`

- [ ] Test site comparison, trend, authorised filters, suppression, stale projection, entitlement revocation, site-scope permission, and ID guessing.
- [ ] Enforce an allowlist of metric/dimension/filter combinations; clients cannot submit SQL or arbitrary field names.
- [ ] Return freshness, definition version, suppression reason, and stable cursor where relevant.
- [ ] Stream formula-safe CSV only under export permission, purpose capture, row limit, audit, and tenant/site scope.

**Acceptance:** APIs expose governed aggregates, not unrestricted analytics queries.

**Rollback:** Disable export and add-on routes; core site reporting remains.

### Task 5: ACE-AR05 - Build the advanced reporting dashboard

**Branch:** `feat/ace-advanced-reporting-ui`

**Files:**
- Create: `apps/admin/app/advanced-reporting/page.tsx`
- Create: `apps/admin/app/advanced-reporting/advanced-reporting-dashboard.tsx`
- Create: `apps/admin/app/advanced-reporting/metric-definition-panel.tsx`
- Test: `apps/admin/e2e/advanced-reporting.spec.ts`

- [ ] Build entitlement lock, site selector, period selector, metric cards, trends, comparisons, suppression, freshness, definition, and export states.
- [ ] Use neutral chart titles and provide accessible table equivalents, keyboard controls, and visible focus.
- [ ] Handle loading, no eligible sites, empty period, partial/stale data, suppressed cohort, permission revoked, export pending, failure, and retry.
- [ ] Never rank sites with shame language or imply causation from correlation.

**Acceptance:** An authorised leader can compare sites and inspect definitions without exposing small cohorts.

**Rollback:** Hide add-on navigation and preserve core reports.

### Task 6: ACE-AR06 - Establish performance, cache, and warehouse boundaries

**Branch:** `perf/ace-advanced-reporting`

**Files:**
- Create: `apps/api/src/advanced-reporting/analytics-cache.service.ts`
- Create: `apps/api/src/advanced-reporting/tests/advanced-reporting-performance.e2e.spec.ts`
- Create: `docs/adr/ace-reporting-scale-boundary.md`

- [ ] Benchmark representative 1, 10, and maximum-supported site tenants with production-like periods and corrections.
- [ ] Set p95 API, refresh lag, export size/time, cache TTL, invalidation, memory, and query-cost budgets.
- [ ] Cache only tenant/permission/scope-safe aggregate keys; revoke or version keys after entitlement or access changes.
- [ ] Define measurable triggers for a warehouse, migration prerequisites, data contracts, reconciliation, cost, and rollback.

**Acceptance:** PostgreSQL projections meet explicit budgets or a reviewed scale ADR blocks release.

**Rollback:** Disable cache and use bounded aggregate queries.

### Task 7: ACE-AR07 - Add approved Stripe billing

**Branch:** `feat/ace-advanced-reporting-billing`

**Files:**
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Modify: `apps/api/src/billing/stripe-webhook.service.ts`
- Test: `apps/api/src/advanced-reporting/tests/advanced-reporting-billing.e2e.spec.ts`

- [ ] Stop while the row remains Proposed.
- [ ] After Approved, link £10/£100 Prices exactly once.
- [ ] Test direct purchase, Growth/Professional inclusion, Operations/All Included, upgrade, annual switch, suspend, cancel, and webhook replay.
- [ ] Prove included organisations receive no duplicate subscription item.

**Acceptance:** Approved billing activates add-on capabilities without changing core site reporting.

**Rollback:** Stop checkout and revoke add-on-only capabilities under cancellation policy.

### Task 8: ACE-AR08 - Complete privacy, export, performance, and release gates

**Branch:** `security/ace-advanced-reporting-release`

**Files:**
- Create: `apps/api/src/advanced-reporting/tests/advanced-reporting-access-matrix.e2e.spec.ts`
- Create: `apps/api/src/advanced-reporting/tests/advanced-reporting-privacy.e2e.spec.ts`
- Create: `docs/runbooks/advanced-reporting-addon.md`
- Create: `docs/evidence/advanced-reporting-release-gate.md`

- [ ] Run entitlement, permission, tenant, site, RLS, suppression, export, cache, IDOR, correction, retention, and restore matrices.
- [ ] Verify a user losing one site cannot retrieve it from cached comparisons, exports, cursors, or saved URLs.
- [ ] Run accessibility and performance budgets with approved maximum fixtures.
- [ ] Record commercial approval before checkout enablement and metric-owner approval before dashboard enablement.

**Acceptance:** Advanced Reporting is privacy-safe, reproducible, performant, and independently revocable.

**Rollback:** Revoke add-on routes and retain/rebuild governed aggregates under retention policy.

## Completion Evidence

- £10/month and £100/year Proposed pricing is exact.
- Growth, Professional, Operations, and All Included rules pass without duplicate billing.
- Core site reporting remains available without the add-on.
- Metric definitions, suppression, exports, and cache keys are governed and tested.
- Stripe work remains blocked until commercial approval.
