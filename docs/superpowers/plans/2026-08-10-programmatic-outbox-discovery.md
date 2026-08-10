# Programmatic Outbox Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically dispatch due outbox events for every organisation without a manually maintained organisation-ID secret.

**Architecture:** A narrow `SECURITY DEFINER` PostgreSQL function discovers only distinct organisation IDs with due or expired-lease outbox rows. The worker consumes those IDs and keeps existing event claims, reads, and writes inside a separate transaction with organisation RLS context.

**Tech Stack:** PostgreSQL migrations, Prisma raw query, TypeScript, Jest, GitHub Actions.

## Global Constraints

- Discover all organisations with due outbox work, not only ACE organisations.
- Do not expose organisation metadata or outbox payloads during discovery.
- Retain forced RLS for all event reads and lifecycle writes.
- Remove `OUTBOX_ORG_IDS`; retain deployment-level endpoint authentication.
- Use TDD: demonstrate each new behaviour fails before implementation.

---

### Task 1: Database-backed due-organisation discovery

**Files:**

- Create: `packages/db/prisma/migrations/<timestamp>_programmatic_outbox_discovery/migration.sql`
- Test: `apps/api/src/access-control/tests/outbox-organisation.rls.e2e.spec.ts`

**Interfaces:**

- Produces: `app.list_due_outbox_org_ids() RETURNS TABLE ("orgId" TEXT)`.
- Consumes: `OutboxEvent.status`, `nextAttemptAt`, and `claimedAt`.

- [x] **Step 1: Write the failing database contract test**

Add a test that invokes the function with one due `PENDING` row, one expired
`PROCESSING` row, and one future `PENDING` row. Assert the function yields the
first two organisations only and returns no payload columns.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `E2E_USE_GLOBAL_SETUP=true E2E_ALLOW_RESET=false pnpm --filter @pathway/api test:integration -- outbox-organisation`

Expected: FAIL because `app.list_due_outbox_org_ids()` does not exist.

- [x] **Step 3: Add the narrow migration function**

Create the function with a fixed empty search path, fully qualified table name,
no arguments, and `DISTINCT` organisation IDs. Revoke `PUBLIC` execution.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `E2E_USE_GLOBAL_SETUP=true E2E_ALLOW_RESET=false pnpm --filter @pathway/api test:integration -- outbox-organisation`

Expected: PASS and future/empty organisations absent from discovery.

### Task 2: Worker discovery and schedule configuration

**Files:**

- Modify: `apps/workers/src/outbox/dispatch-outbox.job.ts`
- Modify: `apps/workers/src/outbox/tests/dispatch-outbox.job.spec.ts`
- Modify: `.github/workflows/workers-scheduled.yml`

**Interfaces:**

- Consumes: `app.list_due_outbox_org_ids()`.
- Produces: automatic dispatch without `OUTBOX_ORG_IDS`.

- [x] **Step 1: Write the failing worker test**

Replace the manual-scope configuration assertion with a test that supplies
discovered organisation IDs and verifies each is processed under a separate
`runForOrg` boundary. Include an empty result assertion that makes no scoped
dispatch calls.

- [x] **Step 2: Run the focused worker test to verify it fails**

Run: `pnpm --filter @pathway/workers test -- dispatch-outbox`

Expected: FAIL because the worker parses `OUTBOX_ORG_IDS`.

- [x] **Step 3: Implement the minimal automatic discovery client**

Use a `runTransaction` query selecting the function's `orgId` rows, validate
the returned shape as strings, and pass them unchanged to existing `runForOrg`.
Remove the environment parser and the secret/workflow validation.

- [x] **Step 4: Run focused worker tests to verify they pass**

Run: `pnpm --filter @pathway/workers test -- dispatch-outbox`

Expected: PASS, including duplicate claims and dead-letter paths.

### Task 3: Verification and handoff

**Files:**

- Modify: `docs/superpowers/specs/2026-08-10-programmatic-outbox-discovery-design.md`
- Modify: `docs/superpowers/plans/2026-08-10-programmatic-outbox-discovery.md`

- [ ] **Step 1: Generate Prisma client and run tests**

Run: `pnpm db:generate`, `pnpm --filter @pathway/db test -- outbox-schema`,
and `pnpm --filter @pathway/workers test -- dispatch-outbox`.

- [ ] **Step 2: Run static checks**

Run: `pnpm --filter @pathway/db typecheck`, `pnpm --filter @pathway/workers typecheck`, and `pnpm lint`.

- [ ] **Step 3: Update Graphify and inspect the diff**

Run: `graphify update .` and `git diff --check`.

- [ ] **Step 4: Commit and create a pull request**

Commit the migration, worker, workflow, tests, design, and plan with a message
that explains the removal of manual organisation configuration.
