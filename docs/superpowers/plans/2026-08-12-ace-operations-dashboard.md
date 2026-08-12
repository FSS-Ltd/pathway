# ACE Operations Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ACE site leaders one privacy-safe daily overview of attendance, PACE, and behaviour attention counts.

**Architecture:** `GET /ace/dashboard` returns one site-scoped aggregate DTO. It obtains the local date from the active site IANA timezone unless `date=YYYY-MM-DD` is supplied, uses bounded aggregate queries under tenant RLS, and contains no child, family, category, reason, note, or outbox-recipient data. The admin `/ace` page renders the returned counts only.

**Tech Stack:** strict TypeScript, NestJS, Prisma/PostgreSQL, Next.js, React, Jest, Graphify.

## Global Constraints

- Add R70: `GET /ace/dashboard`, capability and permission `ace.dashboard.read`, site scope, standard sensitivity, `ACE_SCHOOL` vertical, active selected-site context, and tenant-scoped RLS.
- Grant `ace.dashboard.read` only to Organisation Head and Site Lead system templates. Dashboard access must not derive from a broader child/family permission.
- The response contains only site-level counts and status labels. It never selects child names/IDs, family data, behaviour categories, reasons, notes, encrypted fields, or add-on data.
- Attendance uses Present/Absent/Late and counts the requested site-local date. PACE uses persisted current `PaceProgress.trackStatus` and `blockCode`. Behaviour review counts use only `OutboxEvent.eventType = behaviour.review-requested` for the requested site-local date.
- The route must return a valid zero-count payload for an empty site and reject malformed dates or an invalid/missing site timezone.
- Bound each aggregate by tenant/date/status and use a fixed, documented query budget; do not hydrate per-child records or run N+1 queries.
- The pilot dashboard aggregate p95 target is under 500ms. Tests must make latency observable but must not use timing sleeps.
- No schema migration is required for the dashboard itself. Permission registry and system-template changes use the existing definition-sync path.

---

### Task 1: Register the least-privilege dashboard capability and route contract

**Files:**
- Modify: `docs/ace-vertical/01-source-and-access-matrix.md`
- Modify: `packages/platform/src/capability-definitions.ts`
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `packages/auth/src/access/system-role-templates.ts`
- Modify: `apps/api/src/access-control/tests/access-matrix.spec.ts`
- Modify: `packages/platform/src/__tests__/capability-definitions.spec.ts`
- Modify: `packages/auth/src/access/system-role-templates.spec.ts`

**Interfaces:**

```ts
"ace.dashboard.read": CapabilityDefinition
// scope: "site", sensitivity: "standard", requiredVertical: Vertical.ACE_SCHOOL
```

- [ ] **Step 1: Write failing contract tests**

```ts
expect(CAPABILITY_DEFINITIONS["ace.dashboard.read"]).toMatchObject({
  scope: "site",
  sensitivity: "standard",
  requiredVertical: Vertical.ACE_SCHOOL,
});
expect(SYSTEM_ROLE_TEMPLATES.organisationHead.permissions).toContain("ace.dashboard.read");
expect(SYSTEM_ROLE_TEMPLATES.siteLead.permissions).toContain("ace.dashboard.read");
expect(SYSTEM_ROLE_TEMPLATES.staff.permissions).not.toContain("ace.dashboard.read");
```

- [ ] **Step 2: Run the focused tests and verify the missing permission fails.**

Run: `pnpm --filter @pathway/platform test:unit -- capability-definitions.spec.ts`.

- [ ] **Step 3: Implement the registry, templates, map, and R70 matrix row.**

```md
| R70 | GET | `/ace/dashboard` | `ace.dashboard.read` | `ace.dashboard.read` | organisation-head, site-lead | active selected-site context | active-site aggregate domain | staff-only | none | standard | trusted organisation/site context; tenant-scoped RLS |
```

- [ ] **Step 4: Run platform/auth contract checks and definition-sync checks.**

- [ ] **Step 5: Commit the contract change.**

```bash
git commit -m "feat: register ACE dashboard access"
```

### Task 2: Build the bounded API aggregate and its security tests

**Files:**
- Create: `apps/api/src/ace-dashboard/ace-dashboard.module.ts`
- Create: `apps/api/src/ace-dashboard/ace-dashboard.controller.ts`
- Create: `apps/api/src/ace-dashboard/ace-dashboard.service.ts`
- Create: `apps/api/src/ace-dashboard/dto/ace-dashboard.dto.ts`
- Create: `apps/api/src/ace-dashboard/tests/ace-dashboard.service.spec.ts`
- Create: `apps/api/src/ace-dashboard/tests/ace-dashboard.rls.e2e.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

```ts
export interface AceDashboardResponse {
  localDate: string;
  timezone: string;
  attendance: { present: number; absent: number; late: number; unmarked: number };
  pace: { ahead: number; onTrack: number; atRisk: number; behind: number; blocked: number; stale: number };
  behaviour: { siteReview: number; headReview: number };
}

// GET /ace/dashboard?date=YYYY-MM-DD
// @RequirePermission("ace.dashboard.read")
```

- [ ] **Step 1: Write failing service tests.**

```ts
await expect(service.get({}, actor)).resolves.toEqual({
  localDate: "2026-08-12",
  timezone: "Europe/London",
  attendance: { present: 0, absent: 0, late: 0, unmarked: 0 },
  pace: { ahead: 0, onTrack: 0, atRisk: 0, behind: 0, blocked: 0, stale: 0 },
  behaviour: { siteReview: 0, headReview: 0 },
});
expect(selects).not.toContain("reason");
expect(selects).not.toContain("note");
expect(queryCount).toBeLessThanOrEqual(6);
```

- [ ] **Step 2: Run the focused test and verify it fails because the module/service does not exist.**

- [ ] **Step 3: Implement strict query DTO parsing, controller access, and service.**

```ts
const requestedDate = dashboardDateSchema.parse(query.date ?? localDateAt(now, site.timezone));
return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) =>
  buildDashboard(tx, actor.tenantId, requestedDate, site.timezone),
);
```

Use fixed `groupBy`/`count` queries, terminal/current facts only, and explicit date bounds. Map every absent aggregate bucket to zero.

- [ ] **Step 4: Add restricted-role E2E coverage.**

```ts
await requestAsTenantA.get("/ace/dashboard").expect(200);
expect(response.body).not.toHaveProperty("children");
expect(JSON.stringify(response.body)).not.toContain("Sensitive behaviour narrative");
await requestAsTenantB.get("/ace/dashboard").expect(200);
```

Cover tenant/site isolation, site timezone/DST boundary, empty and partial data, malformed date, no sensitive text, query budget, and the recorded-pilot p95 assertion.

- [ ] **Step 5: Run API unit, restricted-RLS E2E, typecheck, lint, build, and Graphify.**

- [ ] **Step 6: Commit the API aggregate.**

```bash
git commit -m "feat: add ACE operations dashboard API"
```

### Task 3: Render the accessible admin overview and prove the daily workflow

**Files:**
- Create: `apps/admin/app/ace/page.tsx`
- Create: `apps/admin/components/ace/overview/attention-cards.tsx`
- Create: `apps/admin/components/ace/overview/pace-status-table.tsx`
- Create: `apps/admin/components/ace/overview/ace-overview.test.tsx`
- Modify: `apps/admin/lib/api-client.ts`
- Modify: `apps/admin/app/admin-navigation.ts`
- Create: `apps/api/src/ace-dashboard/tests/ace-daily-operations.e2e.spec.ts`

**Interfaces:**

```ts
export async function fetchAceDashboard(input?: { date?: string }): Promise<AceDashboardResponse>;

type AttentionCardsProps = {
  attendance: AceDashboardResponse["attendance"];
  behaviour: AceDashboardResponse["behaviour"];
};

type PaceStatusTableProps = { pace: AceDashboardResponse["pace"] };
```

- [ ] **Step 1: Write failing rendered tests.**

```tsx
render(<AceOverview dashboard={fixture} />);
expect(screen.getByRole("heading", { name: "ACE overview" })).toBeVisible();
expect(screen.getByText("Late: 2")).toBeVisible();
expect(screen.queryByText(/reason|note|guardian/i)).toBeNull();
```

Test permission-hidden navigation, loading, empty, retryable error, cards with non-colour status labels, keyboard-visible table labels, and a compact 320pt/200% text layout.

- [ ] **Step 2: Run the focused admin test and verify it fails before the page/components exist.**

- [ ] **Step 3: Implement the typed client, page, and focused components.**

```tsx
if (!canReadDashboard) return <NoAccessCard title="ACE overview" message="You do not have permission to view the ACE overview." />;
return <AceOverview dashboard={dashboard} onRetry={() => void load()} />;
```

Do not calculate policy, status, or totals in the client. Route visibility remains advisory; the API is authoritative.

- [ ] **Step 4: Write and run the daily E2E.**

```ts
// configure period -> enrol child -> record LATE -> record/correct PACE
// -> record/correct behaviour -> GET /ace/dashboard -> assert aggregate deltas only
```

Assert the correction successor, rather than both predecessor and successor, determines PACE/behaviour totals.

- [ ] **Step 5: Run admin/API full relevant tests, typechecks, lints, builds, E2E, and `graphify update .`.**

- [ ] **Step 6: Commit the UI and end-to-end gate.**

```bash
git commit -m "feat: deliver ACE daily operations dashboard"
```

## Self-Review

- The plan covers every ACE-O20 deliverable: site aggregates, metrics, cards/table, tenant isolation, timezone, empty/partial data, sensitive-data exclusion, bounded query evidence, pilot p95, and the full daily workflow.
- The plan contains no unresolved implementation placeholders.
- Every UI field maps to `AceDashboardResponse`; no UI code receives behaviour narrative or per-child results.

## Task 3 delivery report (2026-08-13)

### R70 access-matrix governance repair

- Corrected R70 from a stale pending lifecycle classification to `migrated`.
- Added a regression assertion that classifies the guarded `GET /ace/dashboard` route as migrated. The route uses `AuthUserGuard`, `PermissionGuard`, and `@RequirePermission("ace.dashboard.read")`; this repair does not change route or product code.

### Evidence

- **RED:** `pnpm --filter @pathway/api test -- src/access-control/tests/access-matrix.spec.ts` failed the new assertion with `Expected: "migrated"` and `Received: {"pending":"ACE operations dashboard route not built"}`.
- **GREEN:** `pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects unit --runTestsByPath src/access-control/tests/access-matrix.spec.ts` passed, 1 suite and 7 tests.
- `pnpm --filter @pathway/api typecheck` passed.
- `pnpm --filter @pathway/api lint` passed.
