# Phase 4 — Learning module

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.3.0` (tag `v2.3.0`)
**Depends on:** Phase 1 (`Module` enum + capability maps), Phase 2 (capability-driven nav — this is its first real consumer), Phase 3 (module purchase/activation).
**Blocks:** Phase 7 (NexSteps Home reuses this module as-is for home-education families).
**Companion:** [`04a-phase4-build-plan.md`](04a-phase4-build-plan.md) — the executable build plan. It supersedes this doc wherever the two differ; grounding the codebase corrected four claims below (`DownloadToken` reuse, the worker's rendering stack, the missing billing step, and the PR ordering).

---

## Goal

Ship the platform's first real module — Learning — as both a working feature and the reference implementation for "how a module gets built" that every module after it follows. Reuse the CEE vertical's already-designed Learning domain model rather than redesigning it.

## Scope boundary (stated up front to avoid overlap with Phase 7)

This phase builds the **data model, capabilities, API, and a staff/admin surface** for logging and reporting on learning. It does **not** build the parent-facing household view — that's Phase 7's "family surface" (`07-nexsteps-home.md`), which consumes this module's capabilities and data rather than duplicating them. Building the admin side first and the family side in Phase 7 also matches the actual dependency order: Phase 7's family surface needs something to display, and this phase is what creates it.

**Deliberately omitted: `Merit`.** The CEE domain model's Merit/rewards entity (`docs/cee-vertical/03-domain-model.md:132-145`) is a self-contained model with no other model depending on it as a required FK — grounded in the source doc directly, not assumed. Confirmed omittable without touching `Subject`/`LearningLog`/`Evidence`/`ReportBundle`. Matches decision D2 (CEE features adopted are Learning + Community only).

## Current state (grounded, R/E/N)

| File / model                                                    | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                            | R/E/N                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `docs/cee-vertical/03-domain-model.md:68-82` (`Subject`)        | Fully specified in the CEE doc as a schema delta against this repo's actual Prisma model                                                                                                                                                                                                                                                                                                                                                                                 | R (design), N (implementation) |
| `docs/cee-vertical/03-domain-model.md:84-104` (`LearningLog`)   | FKs to `Child`, `Subject`, and `User` as `loggedByUserId`                                                                                                                                                                                                                                                                                                                                                                                                                | R (design), N (implementation) |
| `docs/cee-vertical/03-domain-model.md:106-124` (`Evidence`)     | FK to `Child`, optional `LearningLog`, storage-backed (photo/document evidence of work)                                                                                                                                                                                                                                                                                                                                                                                  | R (design), N (implementation) |
| `docs/cee-vertical/03-domain-model.md:154-170` (`ReportBundle`) | FK to `Tenant`, optional `childId`, `status: ReportBundleStatus`, `storageKey`. **Correction:** the CEE doc's `downloadTokenId` is dropped — `DownloadToken` is `Lead`-scoped (required `leadId` FK, `onDelete: Cascade`) and cannot carry a report bundle. The build plan uses the repo's real private-file mechanism, an authenticated API proxy                                                                                                            | R (design), N (implementation) |
| `packages/db/prisma/schema.prisma:577` (`Child`)                | Existing model — `LearningLog`/`Evidence` FK onto this, no changes needed to `Child` itself                                                                                                                                                                                                                                                                                                                                                                              | R                              |
| `packages/db/prisma/schema.prisma:1111` (`DownloadToken`)       | Existing model — **not reusable.** `leadId` is a required FK to `Lead` with `onDelete: Cascade`; it is the marketing-funnel toolkit-PDF token, not a general facility. Its `usedAt` column is declared and never written anywhere, so it grants no single-use semantics either                                                                                                                                                                                            | R (finding)                    |
| `docs/cee-vertical/03-domain-model.md:4`                        | Notes the doc's own schema-line-count reference is slightly stale (says 1,034 lines; the schema is 1,065 today) — doesn't affect the model design itself, just a footnote for whoever re-reads that doc                                                                                                                                                                                                                                                                  | —                              |
| `apps/workers/`                                                 | Confirmed: **plain `tsx` CLI scripts, no BullMQ.** `src/av30/compute-av30.cli.ts` pattern: read env-var input, instantiate a job class, `.run()`, log, close Prisma. `package.json` scripts (`compute:av30`, `retention:run`, `guests:cleanup`) each a standalone `tsx` invocation. **The CEE docs' architecture diagram showing "apps/workers (BullMQ)" is aspirational, not implemented** — this phase follows the real, current CLI pattern, not the aspirational one | R (pattern), N (new script)    |
| `docs/cee-vertical/03-domain-model.md:173`                      | States "Generation of `ReportBundle` runs on `apps/workers`... not inline" — correct instinct, just needs translating from "BullMQ job" (as the CEE docs elsewhere imply) to "CLI script following the existing pattern"                                                                                                                                                                                                                                                 | R                              |
| `apps/api/src/children/tests/children.service.spec.ts`          | Reference test pattern for a new domain model + service (`jest.mock("@pathway/db")`, per-model mocks)                                                                                                                                                                                                                                                                                                                                                                    | R (template)                   |
| `packages/platform/src/capability-maps.ts` (Phase 1)            | Empty of Learning capabilities until this phase                                                                                                                                                                                                                                                                                                                                                                                                                          | E                              |
| `apps/admin/app/admin-shell.tsx` (Phase 2 PR 2.1)               | Nav items can carry a `capability` field, unused until this phase                                                                                                                                                                                                                                                                                                                                                                                                        | E                              |

---

## PR breakdown

### PR 4.1 — Learning domain model

**Scope:** Add `Subject`, `LearningLog`, `Evidence`, `ReportBundle` models and their enums (`ReportBundleStatus`) to the schema, per the CEE doc's spec, adapted only where this repo's actual conventions require it (e.g. `orgId`/`tenantId` FK naming, matching the Phase 1 finding rather than reintroducing an `organisationId`-style mismatch).

**Key files:**

- `packages/db/prisma/schema.prisma` (E) — the four models + `ReportBundleStatus` enum, adapted from `docs/cee-vertical/03-domain-model.md:68-170`.
- New migration (N).

**Failing test first:** migration test confirming each model's required FKs and the `ReportBundleStatus` enum values; a test confirming `Evidence.learningLogId` is genuinely optional (evidence can exist without a specific logged lesson, e.g. a general work sample).

**Rollback:** roll back the migration; nothing references these tables until PR 4.2+.

---

### PR 4.2 — Learning capabilities

**Scope:** Add `learning.*` capabilities (e.g. `learning.log.read`, `learning.log.write`, `learning.reports.generate`) to the `Module → Capability` map for `Module.LEARNING`. **Open decision:** the dev doc's original 8-module catalogue (§4) does not include Learning — it's a net-new module this doc set adds (D1/D2 in the README). Confirm `Module` enum (Phase 1 PR 1.1) gets a 9th value, `LEARNING`, before this PR starts; the phase docs assumed this but it's worth stating explicitly since Phase 1's doc was written against the dev doc's original 8.

**Key files:**

- `packages/db/prisma/schema.prisma` (E) — add `LEARNING` to the `Module` enum (technically a Phase 1 change; flagged here since this is the phase that actually needs it — sequence PR 4.2 to land the enum value if Phase 1 shipped without anticipating it).
- `packages/platform/src/capability-maps.ts` (E) — `Module.LEARNING → ["learning.log.read", "learning.log.write", "learning.evidence.read", "learning.evidence.write", "learning.reports.generate"]`.

**Failing test first:** the Phase 1 completeness test (every `Module` value has a mapping) now covers `LEARNING` too — extends existing coverage rather than a new test concept.

**Rollback:** revert the map entry and enum value together (same migration).

---

### PR 4.3 — API module

**Scope:** NestJS module for `Subject`/`LearningLog`/`Evidence` CRUD, capability-guarded (Phase 2 PR 2.2's guard, first real consumer).

**Key files:**

- `apps/api/src/learning/` (N) — `learning.module.ts`, `learning.controller.ts`, `learning.service.ts`, following the shape of `apps/api/src/children/` (its `.controller.ts`/`.service.ts`/`tests/` split is the closest existing analogue: another child-scoped domain with a controller/service/e2e test trio).
- `apps/api/src/learning/tests/learning.service.spec.ts` (N) — same `jest.mock("@pathway/db")` pattern as `children.service.spec.ts`.

**Failing test first:** service test covering create/read for `Subject`/`LearningLog`/`Evidence`, plus a guard test confirming a request without `learning.log.write` is rejected.

**Rollback:** revert the new module directory; nothing else in `apps/api` imports it yet.

---

### PR 4.4 — `ReportBundle` generation (workers)

**Scope:** A CLI script generating a `ReportBundle` for a child/tenant, following the exact pattern of `compute-av30.cli.ts` — not a new BullMQ integration.

**Key files:**

- `apps/workers/src/learning/generate-report-bundle.cli.ts` (N) — reads target IDs (env var or CLI arg, matching `AV30_TENANT_IDS`'s pattern), instantiates a `GenerateReportBundleJob`, `.run()`, logs, closes Prisma.
- `apps/workers/src/learning/generate-report-bundle.service.ts` (N) — the actual bundle-assembly logic: gather `LearningLog`/`Evidence` for the period, render/store the bundle, write `storageKey`, set `ReportBundleStatus = READY` (or `FAILED` on error). **No token is minted** — the bundle is served through an authenticated API route, the same private-file mechanism child photos and lesson resources already use (see the companion plan's Decision A).
- `apps/workers/package.json` (E) — add a `generate:report-bundle` script entry, matching `compute:av30`'s shape.
- `apps/workers/src/learning/tests/*.spec.ts` (N) — matching the existing per-domain `tests/` convention in this app.

**Failing test first:** a test asserting a `ReportBundle` moves `PENDING → GENERATING → READY` with a valid `storageKey` and `downloadTokenId` on success, and `→ FAILED` on a simulated storage error.

**Rollback:** revert the new files; no scheduled trigger exists yet to remove (this PR doesn't wire up a cron/scheduler — that's a deployment-config step, flagged as an open decision below, matching how `compute:av30` etc. are "presumably externally scheduled" per this repo's existing pattern).

---

### PR 4.5 — Admin surface

**Scope:** Staff-facing UI for logging lessons, viewing subjects, and triggering report generation. First real nav item with a `capability` value (Phase 2 PR 2.1's mechanism, previously unconsumed).

**Key files:**

- New admin route(s) in `apps/admin/app/` (N) — following the existing route/page conventions in that app (confirm exact shape against a comparable existing feature, e.g. `apps/admin/app/children` or `apps/admin/app/attendance`, at implementation time).
- `apps/admin/app/admin-shell.tsx` (E) — new nav entry: `{ label: "Learning", href: "/learning", capability: "learning.log.read", group: "Teaching" }`, grouped alongside the existing `Lessons`/`Classes` entries (line 46-47) since it's conceptually adjacent.

**Failing test first:** extends `admin-shell.nav.test.ts` (already extended in Phase 2 PR 2.1 with the capability-filter mechanism) with a case: the Learning nav item is visible only for orgs with the module active.

**Rollback:** revert the route + nav entry; no other nav item is affected (Phase 2's filter is additive per-item).

---

## Acceptance criteria

- [ ] `Subject`, `LearningLog`, `Evidence`, `ReportBundle` models exist, migrated, tested.
- [ ] `Module.LEARNING` exists with a correct capability mapping; the Phase 1 completeness test covers it.
- [ ] API endpoints for logging/reading learning data are capability-guarded and reject requests without `learning.*` grants.
- [ ] A `ReportBundle` can be generated end-to-end via the new workers CLI script, landing in `READY` with a valid `storageKey` and downloading through the capability-guarded API route.
- [ ] The admin Learning nav entry is visible only to orgs with the Learning module active — the first real proof that Phase 2's capability-driven nav mechanism works outside its own unit tests.
- [ ] No `Merit` model, table, or capability exists — confirmed absent, not just unused.

## Open decisions

1. **`Module.LEARNING` as a 9th enum value** — the dev doc's original module catalogue (§4) has 8, none named Learning. Confirm this addition lands in Phase 1 (if that phase is replanned) or as a small addendum migration at the start of this phase (as scoped above in PR 4.2).
2. **Report-bundle generation trigger** — on-demand (staff clicks "generate" in the admin UI, which shells out to the worker synchronously or via a job record the UI polls) vs. scheduled (a cron entry, matching how `compute:av30`/`retention:run` are presumably invoked externally). The dev doc doesn't specify; recommend on-demand for the reference implementation's first cut, since scheduled generation can be layered on without changing the CLI script itself.
3. **Exact admin route structure** for the new Learning screens — deferred to implementation time, follow whatever the closest existing feature (`children` or `attendance`) does today rather than inventing a new convention.
