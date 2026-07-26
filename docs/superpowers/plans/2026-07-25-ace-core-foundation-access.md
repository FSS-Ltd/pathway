# ACE Core Foundation and Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the typed entitlement, configurable permission, identity, schema, tenancy, audit, and storage foundations required by every ACE workflow.

**Architecture:** Preserve `OrgVertical` and `OrgModule` as commercial truth, then intersect their typed capabilities with platform-owned permission definitions and organisation/site role assignments. Add ACE data through small expand-only migrations with direct tenant keys, RLS, immutable facts, private storage, audit, and outbox support.

**Tech Stack:** TypeScript, `@pathway/platform`, `@pathway/auth`, NestJS, Zod, Prisma, PostgreSQL RLS, Next.js admin, Jest, and existing migration/RLS scripts.

## Global Constraints

- Read the master plan and both governing source documents before each task.
- One PR implements one reviewer-sized behaviour.
- No permission label or database string is executable unless it exists in the compile-time registry.
- A permission never activates a vertical or paid module.
- Parent/student access always needs a relationship check after capability and permission checks.
- Every new table is tenant-scoped, indexed, forced through RLS, and covered by strict assertions.
- Keep Oasis read-only.

---

### Task 1: ACE-F01 - Lock decisions, permission matrix, and route inventory

**Branch:** `docs/ace-source-and-access-matrix`

**Files:**
- Create: `docs/ace-vertical/01-source-and-access-matrix.md`
- Create: `docs/ace-vertical/adrs/001-ace-packaging-and-access-layers.md`
- Create: `scripts/validate-ace-access-matrix.mjs`
- Modify: `docs/NexSteps-ACE-Vertical-Build-Plan.md`
- Test: `scripts/validate-ace-access-matrix.mjs`

**Interfaces:**
- Consumes: the two governing source documents and current route/nav inventory.
- Produces: one row per planned API route with `capability`, `permission`, `persona`, `relationship`, `releasePolicy`, `featureToggle`, and `sensitivity`.

- [x] **Step 1: Write the failing completeness check**

Add a checklist row for every endpoint in source sections 8.2 through 8.5 and assert no cell is blank. Use `none` only where the layer genuinely does not apply.

Preserve the executable completeness assertion in
`scripts/validate-ace-access-matrix.mjs`.

- [x] **Step 2: Verify the inventory is initially incomplete**

Run:

```bash
rg -n '\|[[:space:]]*\|' docs/ace-vertical/01-source-and-access-matrix.md
```

Expected: missing file or incomplete route rows.

- [x] **Step 3: Write the decision artifacts**

Record the access formula exactly:

```text
authenticated
AND active org/site membership
AND active organisation capability
AND effective typed permission
AND included feature enabled, when applicable
AND relationship/domain assignment
AND release/visibility policy
AND tenant/RLS policy
```

Include the updated Clubs and Child Merit Market prices and their Proposed status. Add owners for every open decision from source section 22 without converting an open decision into an assumed product fact.

- [x] **Step 4: Validate, update the semantic graph, and commit completion evidence**

Run:

```bash
node scripts/validate-ace-access-matrix.mjs
rg -n 'TBD|TODO|permission goes here|capability goes here' docs/ace-vertical docs/NexSteps-ACE-Vertical-Build-Plan.md
```

Expected: the deterministic validator passes and the placeholder scan has no
matches. The main agent must then run the curated docs-aware Graphify
`/graphify --update` workflow, verify the matrix and ADR are represented, and
include the required graph artifacts according to repository policy before
marking this step complete.

Completion evidence: the docs-aware semantic update merged 24 document nodes
and 38 relationships into the structural graph. The resulting ignored
`graphify-out/graph.json`, `graphify-out/graph.html`, and
`graphify-out/GRAPH_REPORT.md` contain 2,832 nodes and 3,659 edges and directly
represent this plan, the governing master plan, the source/access matrix, and
ADR 001.

**Acceptance:** Every planned route has an explicit access decision and every unresolved commercial/security decision has an owner and blocking PR.

**Rollback:** Revert the documentation commit. No runtime behaviour changes.

**ACE-F01 decision note (26 July 2026):** The source lock records 68 exact
method/path routes from source sections 8.2 through 8.4. The four section 8.5
add-on families remain unresolved method/path contracts with accountable owners
and blocking PRs; they are not counted as exact routes. The public Faith path
uses the corrected `reflections` spelling. Organisation-head membership
permits selection across sites in the active organisation, while site-scoped
roles still require an active assignment for the selected site. Section 22
approval items remain open until their named owners record substantive
approval. Round 1 adds the committed deterministic validator; the docs-aware
semantic Graphify gate is complete with the evidence recorded in Step 4.

### Task 2: ACE-F02 - Replace string capabilities with a compile-time registry

**Branch:** `feat/ace-typed-capability-registry`

**Files:**
- Modify: `packages/platform/src/types.ts`
- Modify: `packages/platform/src/capability-maps.ts`
- Create: `packages/platform/src/capability-definitions.ts`
- Modify: `packages/platform/src/index.ts`
- Test: `packages/platform/src/__tests__/capability-definitions.spec.ts`
- Test: `packages/platform/src/__tests__/capability-maps.spec.ts`

**Interfaces:**
- Produces:

```ts
export type PermissionScope = "organisation" | "site" | "relationship" | "assignment";
export type PermissionSensitivity = "standard" | "sensitive" | "protected";

export interface CapabilityDefinition {
  label: string;
  description: string;
  scope: PermissionScope;
  sensitivity: PermissionSensitivity;
  delegable: boolean;
  requiredModule?: Module;
  requiredVertical?: Vertical;
}

export const CAPABILITY_DEFINITIONS = { /* exhaustive literals */ } as const
  satisfies Record<string, CapabilityDefinition>;
export type Capability = keyof typeof CAPABILITY_DEFINITIONS;
```

- [ ] **Step 1: Write failing registry and map tests**

Assert that every value in `VERTICAL_CAPABILITIES` and `MODULE_CAPABILITIES` exists in `CAPABILITY_DEFINITIONS`, and that every source section 5.2 capability is present. Assert ACE grants the confirmed Learning subset without requiring `Module.LEARNING`.

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pnpm --filter @pathway/platform test:unit -- --runInBand capability-definitions
```

Expected: failure because `Capability` is still `string`.

- [ ] **Step 3: Implement the registry**

Add platform, ACE, school operations, messaging, safeguarding, Clubs, Finance, Merit, and Advanced Reporting literals. Keep capability maps exhaustive with `satisfies Record<Vertical | Module, readonly Capability[]>`.

- [ ] **Step 4: Run verification**

Run:

```bash
pnpm --filter @pathway/platform test:unit
pnpm --filter @pathway/platform typecheck
pnpm --filter @pathway/platform lint
```

Expected: all pass and unknown literals fail TypeScript compilation.

- [ ] **Step 5: Commit**

```bash
git add packages/platform
git commit -m "feat: add typed capability registry"
```

**Acceptance:** No runtime guard, controller decorator, or map can reference an unknown capability.

**Rollback:** Revert registry and restore the previous `Capability` type. Do not proceed to later tasks after rollback.

### Task 3: ACE-F03 - Synchronise permission metadata to the database

**Branch:** `feat/ace-permission-definitions`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_permission_definitions/migration.sql`
- Create: `packages/db/src/permission-definition-sync.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/__tests__/permission-definition-sync.spec.ts`
- Modify: `scripts/launch-preflight.mjs`

**Interfaces:**
- Consumes: `CAPABILITY_DEFINITIONS`.
- Produces:

```ts
export async function syncPermissionDefinitions(
  tx: Prisma.TransactionClient,
): Promise<{ inserted: number; updated: number; deactivated: number }>;
```

- [ ] **Step 1: Write failing drift tests**

Test insert, metadata update, deactivation of removed keys, and rejection when a database key is executable but absent from the registry.

- [ ] **Step 2: Run the failing test**

```bash
pnpm --filter @pathway/db test:unit -- --runInBand permission-definition-sync
```

Expected: module not found.

- [ ] **Step 3: Add the model and synchroniser**

Create `PermissionDefinition` with registry-owned primary key, label, description, scope, sensitivity, delegability, optional required capability metadata, `isActive`, and timestamps. Synchronisation may update metadata but may not create executable keys from database input.

- [ ] **Step 4: Verify migration and preflight**

```bash
pnpm db:generate
pnpm --filter @pathway/db test:unit
pnpm --filter @pathway/db typecheck
node scripts/launch-preflight.mjs
```

Expected: all pass; preflight reports zero registry drift.

- [ ] **Step 5: Commit**

```bash
git add packages/db scripts/launch-preflight.mjs
git commit -m "feat: synchronise permission definitions"
```

**Acceptance:** The database is searchable metadata for the compile-time registry, never a source of executable permission keys.

**Rollback:** Forward-mitigate by leaving the additive table unused; drop only in a reviewed follow-up migration.

### Task 4: ACE-F04 - Add organisation role definitions and permissions

**Branch:** `feat/ace-org-role-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_org_role_definitions/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `packages/db/src/__tests__/org-role-schema.spec.ts`
- Test: `apps/api/src/access-control/tests/access-control.rls.e2e.spec.ts`

**Interfaces:**
- Produces: `OrgRoleDefinition`, `OrgRolePermission`, `RoleScope`, role `version`, active/system flags, and organisation/site uniqueness.

- [ ] **Step 1: Write failing schema and cross-tenant tests**

Prove tenant A cannot list, create, update, or delete tenant B role definitions or permission rows. Prove a site-scoped role references a site in the same organisation.

- [ ] **Step 2: Run strict RLS before implementation**

```bash
pnpm supabase:rls:check -- --strict
```

Expected: failure because planned tables are absent from the strict inventory.

- [ ] **Step 3: Add schema, indexes, and policies**

Use direct `orgId` plus nullable `tenantId`. Add unique `(orgId, tenantId, name)` and indexes for active roles and permission lookup. Force RLS and deny cross-org joins.

- [ ] **Step 4: Run migration and RLS verification**

```bash
pnpm db:generate
pnpm --filter @pathway/db test:unit
pnpm --filter @pathway/api test:integration -- --runInBand access-control.rls
pnpm supabase:rls:check -- --strict
```

- [ ] **Step 5: Commit**

```bash
git add packages/db apps/api/src/access-control/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add organisation role definitions"
```

**Acceptance:** Role metadata and permission membership are tenant-isolated and cannot create platform permissions.

**Rollback:** Leave additive tables unused and remove them through a separate reviewed migration after confirming no assignments exist.

### Task 5: ACE-F05 - Add time-bounded user role assignments

**Branch:** `feat/ace-role-assignments-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_user_role_assignments/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/access-control/tests/role-assignment.rls.e2e.spec.ts`

**Interfaces:**
- Produces: `UserRoleAssignment` with organisation, optional site, start, expiry, revocation, assigning/revoking actor, and indexes used by effective-access queries.

- [ ] **Step 1: Write failing assignment isolation tests**

Cover organisation mismatch, site mismatch, user from another organisation, expired assignment, and revoked assignment.

- [ ] **Step 2: Add the model and database constraints**

Enforce organisation and site ownership through composite relations or transaction validation plus RLS. Index `(orgId, userId, revokedAt)` and `(tenantId, userId, revokedAt)`.

- [ ] **Step 3: Verify**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand role-assignment.rls
pnpm supabase:rls:check -- --strict
```

- [ ] **Step 4: Commit**

```bash
git add packages/db apps/api/src/access-control/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add bounded role assignments"
```

**Acceptance:** Active assignment queries exclude not-yet-started, expired, and revoked rows and cannot cross organisation or site boundaries.

**Rollback:** Forward-mitigate by stopping writes and reverting to fixed-role resolution; preserve assignment history for audit.

### Task 6: ACE-F06 - Seed protected system role templates

**Branch:** `feat/ace-system-role-templates`

**Files:**
- Create: `packages/auth/src/access/system-role-templates.ts`
- Create: `packages/db/src/seed-system-roles.ts`
- Modify: `packages/db/prisma/seed.ts`
- Test: `packages/auth/src/access/system-role-templates.spec.ts`
- Test: `packages/db/src/__tests__/seed-system-roles.spec.ts`

**Interfaces:**
- Produces:

```ts
export const SYSTEM_ROLE_TEMPLATES = {
  organisationHead: { scope: "organisation", protected: true, permissions: [] },
  siteLead: { scope: "site", protected: true, permissions: [] },
  staff: { scope: "site", protected: true, permissions: [] },
  safeguardingLead: { scope: "site", protected: true, permissions: [] },
  financeOperator: { scope: "organisation", protected: true, permissions: [] },
  parent: { scope: "relationship", protected: true, permissions: [] },
  student: { scope: "relationship", protected: true, permissions: [] },
} as const;
```

- [ ] **Step 1: Write failing idempotency and protection tests**

Assert reruns create no duplicate role or permission rows and customer mutation cannot edit `isSystem` templates.

- [ ] **Step 2: Implement deterministic seeding**

Seed only permissions present in the registry and available to the organisation. Do not use display names for access.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/auth test:unit
pnpm --filter @pathway/db test:unit
pnpm db:seed
```

- [ ] **Step 4: Commit**

```bash
git add packages/auth packages/db
git commit -m "feat: seed protected access templates"
```

**Acceptance:** Every organisation receives idempotent protected templates, and custom roles remain separate clones.

**Rollback:** Disable the seeder; retain seeded templates because assignments may reference them.

### Task 7: ACE-F07 - Resolve effective permissions across organisation and site scopes

**Branch:** `feat/ace-effective-permissions`

**Files:**
- Create: `apps/api/src/access-control/effective-permissions.service.ts`
- Create: `apps/api/src/access-control/access-decision.types.ts`
- Create: `apps/api/src/access-control/access-control.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/access-control/tests/effective-permissions.service.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface EffectiveAccessRequest {
  userId: string;
  orgId: string;
  tenantId?: string;
  permission: PermissionKey;
  now: Date;
}

export class EffectivePermissionsService {
  resolve(request: EffectiveAccessRequest): Promise<AccessDecision>;
  listForUser(userId: string, orgId: string, tenantId?: string): Promise<PermissionKey[]>;
}
```

- [ ] **Step 1: Write failing resolver tests**

Cover org role, site role, expiry, revocation, inactive role/key, missing required module, missing vertical, feature-disabled permission, and duplicate grants.

- [ ] **Step 2: Implement the minimal resolver**

Intersect active membership, capability, active assignment, active role, and active registry key. Return reason codes and source role IDs without disclosing other users.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/api test:unit -- --runInBand effective-permissions
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/access-control apps/api/src/app.module.ts
git commit -m "feat: resolve effective permissions"
```

**Acceptance:** A permission is effective only when both commercial capability and valid assignment permit it.

**Rollback:** Remove module registration and continue using fixed roles; do not remove schema.

### Task 8: ACE-F08 - Add permission guard and decision telemetry

**Branch:** `feat/ace-permission-guard`

**Files:**
- Create: `apps/api/src/access-control/require-permission.decorator.ts`
- Create: `apps/api/src/access-control/permission.guard.ts`
- Create: `apps/api/src/access-control/access-decision-logger.ts`
- Modify: `apps/api/src/access-control/access-control.module.ts`
- Test: `apps/api/src/access-control/tests/permission.guard.spec.ts`

**Interfaces:**
- Produces:

```ts
export const RequirePermission = (permission: PermissionKey) =>
  SetMetadata(REQUIRED_PERMISSION, permission);
```

- [ ] **Step 1: Write failing guard tests**

Prove absent metadata allows, missing context denies, unknown metadata cannot compile, allowed decision continues, denied decision returns safe 403, and logs omit sensitive record data.

- [ ] **Step 2: Implement guard and structured telemetry**

Log org/site, actor reference, capability, permission, decision reason, source role IDs, request ID, and route. Do not log message bodies, behaviour notes, report narratives, or child PII.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/api test:unit -- --runInBand permission.guard
pnpm --filter @pathway/api typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/access-control
git commit -m "feat: enforce typed permissions"
```

**Acceptance:** Routes can require a compile-time permission and emit a safe, explainable decision.

**Rollback:** Remove the guard from routes before removing its provider.

### Task 9: ACE-F09 - Shadow-compare fixed roles and effective permissions

**Branch:** `feat/ace-access-shadow-mode`

**Files:**
- Create: `apps/api/src/access-control/access-shadow.service.ts`
- Modify: `apps/api/src/auth/user-roles.service.ts`
- Create: `apps/api/src/access-control/tests/access-shadow.service.spec.ts`
- Modify: `docs/ace-vertical/01-source-and-access-matrix.md`

**Interfaces:**
- Produces:

```ts
export interface AccessShadowDrift {
  route: string;
  legacyAllowed: boolean;
  permissionAllowed: boolean;
  permission: PermissionKey;
  reason: AccessDecision["reason"];
}
```

- [ ] **Step 1: Write failing drift tests**

Assert agreement emits no drift, disagreement emits one redacted metric/event, and shadow results never change the live decision.

- [ ] **Step 2: Implement bounded shadow mode**

Use an environment/config flag and allow-listed routes from the access matrix. Add metrics for drift count by route and reason.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @pathway/api test:unit -- --runInBand access-shadow
pnpm --filter @pathway/api typecheck
git add apps/api docs/ace-vertical
git commit -m "feat: compare legacy and typed access"
```

**Acceptance:** The team can measure permission migration drift without changing existing production access.

**Rollback:** Disable the flag; no data migration is needed.

### Task 10: ACE-F10 - Expose role-definition APIs with optimistic concurrency

**Branch:** `feat/ace-role-definition-api`

**Files:**
- Create: `apps/api/src/access-control/roles.controller.ts`
- Create: `apps/api/src/access-control/roles.service.ts`
- Create: `apps/api/src/access-control/dto/role.dto.ts`
- Modify: `apps/api/src/access-control/access-control.module.ts`
- Test: `apps/api/src/access-control/tests/roles.controller.spec.ts`
- Test: `apps/api/src/access-control/tests/roles.service.spec.ts`

**Interfaces:**
- Produces REST endpoints from source section 8.2 and:

```ts
export interface UpdateRoleCommand {
  roleId: string;
  expectedVersion: number;
  name: string;
  description?: string;
  permissionKeys: PermissionKey[];
}
```

- [ ] **Step 1: Write failing API/service tests**

Cover create, clone, update, retire, unknown key, non-delegable key, illegal scope, inactive capability, actor cannot delegate, system-role mutation, and `ROLE_VERSION_CONFLICT`.

- [ ] **Step 2: Implement Zod DTOs, thin controller, and transaction service**

Increment `version` atomically and write role revision plus audit in one transaction.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/api test:unit -- --runInBand roles
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/access-control
git commit -m "feat: add versioned role APIs"
```

**Acceptance:** Organisation heads can manage custom roles only from permissions they can delegate.

**Rollback:** Disable controller routes; preserve revisions and audit.

### Task 11: ACE-F11 - Expose assignment APIs and access-cache invalidation

**Branch:** `feat/ace-role-assignment-api`

**Files:**
- Create: `apps/api/src/access-control/assignments.controller.ts`
- Create: `apps/api/src/access-control/assignments.service.ts`
- Create: `apps/api/src/access-control/access-cache.service.ts`
- Modify: `apps/api/src/access-control/access-control.module.ts`
- Test: `apps/api/src/access-control/tests/assignments.service.spec.ts`
- Test: `apps/api/src/access-control/tests/access-cache.service.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface AssignRoleCommand {
  userId: string;
  roleDefinitionId: string;
  orgId: string;
  tenantId?: string;
  startsAt: Date;
  expiresAt?: Date;
}

export interface AccessCache {
  invalidateUser(userId: string, orgId: string): Promise<void>;
}
```

- [ ] **Step 1: Write failing tests**

Cover assign, revoke, expiry, bulk assignment, cross-site denial, immediate invalidation, and maximum 60-second fallback TTL.

- [ ] **Step 2: Implement transactional assignment and invalidation**

Write assignment/revocation, audit, and outbox invalidation intent in one transaction.

- [ ] **Step 3: Verify and commit**

```bash
pnpm --filter @pathway/api test:unit -- --runInBand assignments access-cache
pnpm --filter @pathway/api typecheck
git add apps/api/src/access-control
git commit -m "feat: manage role assignments"
```

**Acceptance:** Access changes take effect immediately when invalidation succeeds and within 60 seconds otherwise.

**Rollback:** Stop assignment writes and flush cache; fixed-role access remains available until cutover.

### Task 12: ACE-F12 - Protect sensitive delegation, last head, and self-lockout

**Branch:** `security/ace-role-safety`

**Files:**
- Create: `apps/api/src/access-control/role-safety.service.ts`
- Modify: `apps/api/src/access-control/roles.service.ts`
- Modify: `apps/api/src/access-control/assignments.service.ts`
- Test: `apps/api/src/access-control/tests/role-safety.concurrent.spec.ts`
- Modify: `docs/ace-vertical/runbooks/access-recovery.md`

**Interfaces:**
- Produces:

```ts
export class RoleSafetyService {
  assertSensitiveStepUp(actorUserId: string): Promise<void>;
  assertHeadAndSelfLockoutSafe(command: RoleMutationCommand): Promise<void>;
}
```

- [ ] **Step 1: Write failing concurrent tests**

Run two simultaneous last-head removals and prove exactly one succeeds. Cover same-request self-lockout, protected ownership, stale step-up, and non-sensitive changes.

- [ ] **Step 2: Implement serialised safety checks**

Use a database transaction and row/advisory lock around active organisation-head count. Return safe codes `STEP_UP_REQUIRED`, `LAST_HEAD_PROTECTED`, and `SELF_LOCKOUT_PROTECTED`.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/api test:integration -- --runInBand role-safety.concurrent
pnpm --filter @pathway/api test:unit -- --runInBand role-safety
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/access-control docs/ace-vertical/runbooks/access-recovery.md
git commit -m "fix: prevent ACE access lockout"
```

**Acceptance:** Concurrent changes cannot remove the final active organisation head or lock the actor out in the same request.

**Rollback:** Disable custom role mutations while keeping reads available.

### Task 13: ACE-F13 - Build the roles and permissions admin surface

**Branch:** `feat/ace-role-admin-ui`

**Files:**
- Create: `apps/admin/app/settings/access/page.tsx`
- Create: `apps/admin/app/settings/access/role-list.tsx`
- Create: `apps/admin/app/settings/access/role-editor.tsx`
- Create: `apps/admin/app/settings/access/assignment-panel.tsx`
- Create: `apps/admin/app/settings/access/effective-access-preview.tsx`
- Modify: `apps/admin/lib/api-client.ts`
- Modify: `apps/admin/app/admin-shell.tsx`
- Test: `apps/admin/app/settings/access/access-page.test.tsx`

**Interfaces:**
- Consumes: role, permission, assignment, access-summary, and audit endpoints.

- [ ] **Step 1: Write failing component tests**

Cover capability-aware disabled permissions, sensitivity warning, step-up prompt, scope selector, version conflict reload, expiry, last-head message, effective-access source, loading, empty, error, and retry.

- [ ] **Step 2: Implement focused components**

Use permission labels only for presentation; submit registry keys. Keep role list, editor, assignment, and preview in separate files.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @pathway/admin test:unit -- --runInBand access-page
pnpm --filter @pathway/admin typecheck
pnpm --filter @pathway/admin lint
pnpm --filter @pathway/admin build
```

- [ ] **Step 4: Commit**

```bash
git add apps/admin
git commit -m "feat: add configurable role administration"
```

**Acceptance:** An authorised head can create, assign, preview, revise, and retire roles without seeing or selecting invalid keys.

**Rollback:** Remove nav exposure and keep APIs active for support recovery.

### Task 14: ACE-F14 - Migrate route and navigation checks to typed permissions

**Branch:** `feat/ace-permission-cutover`

**Files:**
- Modify: `apps/api/src/announcements/announcements.controller.ts`
- Modify: `apps/api/src/assignments/assignments.controller.ts`
- Modify: `apps/api/src/attendance/attendance.controller.ts`
- Modify: `apps/api/src/children/children.controller.ts`
- Modify: `apps/api/src/groups/groups.controller.ts`
- Modify: `apps/api/src/learning/learning.controller.ts`
- Modify: `apps/api/src/lessons/lessons.controller.ts`
- Modify: `apps/api/src/orgs/orgs.controller.ts`
- Modify: `apps/api/src/parents/parents.controller.ts`
- Modify: `apps/api/src/staff/staff.controller.ts`
- Modify: `apps/admin/lib/access.ts`
- Modify: `apps/admin/lib/permissions.ts`
- Modify: `apps/admin/app/admin-shell.tsx`
- Test: `apps/api/src/access-control/tests/access-matrix.e2e.spec.ts`
- Test: `apps/admin/lib/access.test.ts`

**Interfaces:**
- Consumes: `@RequireCapability` and `@RequirePermission`.

- [ ] **Step 1: Write failing matrix tests**

Generate cases from the committed route matrix and prove every protected route denies missing membership, capability, and permission independently.

- [ ] **Step 2: Migrate bounded route groups**

Apply typed checks only to routes present in the matrix. Preserve relationship and safeguarding guards. Navigation requires both capability and permission.

- [ ] **Step 3: Observe shadow agreement**

Run the shadow suite and record zero unexplained drift before switching each route group to typed decisions.

- [ ] **Step 4: Verify and commit**

```bash
pnpm --filter @pathway/api test:integration -- --runInBand access-matrix
pnpm --filter @pathway/admin test:unit -- --runInBand access
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/admin typecheck
git add apps/api apps/admin
git commit -m "feat: cut routes over to typed permissions"
```

**Acceptance:** No migrated route or nav item authorises from a role display name.

**Rollback:** Restore legacy live decisions while retaining shadow telemetry.

### Task 15: ACE-F15 - Add academic calendar and subject-enrolment storage

**Branch:** `feat/ace-academic-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_academic_foundation/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/ace-settings/tests/academic-foundation.rls.e2e.spec.ts`

**Interfaces:**
- Produces: `AcademicYear`, `AcademicPeriod`, and `StudentSubjectEnrollment` with direct tenant and child keys, active-enrolment uniqueness, target/current/starting PACE, dates, actor, and reason.

- [ ] **Step 1: Write failing schema, constraint, and RLS tests**

Cover overlapping active periods, duplicate active child/subject enrolment, tenant swaps, and child from another tenant.

- [ ] **Step 2: Add migration and constraints**

Store local-business period dates as dates and timestamps in UTC. Index roster access by tenant, status, subject, and child.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand academic-foundation.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/ace-settings/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE academic foundation"
```

**Acceptance:** Academic periods and enrolments are tenant-safe and support one active placement per child and subject.

**Rollback:** Keep additive tables unused; remove only after confirming no ACE pilot data.

### Task 16: ACE-F16 - Add immutable PACE and behaviour storage

**Branch:** `feat/ace-pace-behaviour-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_pace_behaviour/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/pace/tests/pace-behaviour.rls.e2e.spec.ts`

**Interfaces:**
- Produces: `PaceAssessment`, `PaceProgress`, `PacePolicy`, `PacePolicyOverride`, `BehaviourEntry`, `DemeritPolicy`, and `DemeritStageOverride`.

- [ ] **Step 1: Write failing immutability, correction, and RLS tests**

Prove published facts cannot be updated in place, corrections reference original facts, override reasons and expiry are required, and tenant swaps fail.

- [ ] **Step 2: Add models and constraints**

Use immutable assessment/behaviour facts, linked correction records, rebuildable projections, integer scores, actor/reason fields, encrypted sensitive free text, and direct tenant/child indexes.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand pace-behaviour.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/pace/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add immutable PACE and behaviour facts"
```

**Acceptance:** Current state can be rebuilt from facts and no correction erases history.

**Rollback:** Stop writes and preserve facts; projection tables may be rebuilt or dropped independently.

### Task 17: ACE-F17 - Add student identity and guardian relationship storage

**Branch:** `feat/ace-identity-relationship-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_identity_relationships/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts`

**Interfaces:**
- Produces tenant-scoped student identities, guardian identities, student-identity links, guardian-child relationships, invite lifecycle, legal access status, relationship dates, and revocation metadata.

- [ ] **Step 1: Write failing identity and relationship tests**

Cover one active student identity per configured policy, shared guardian across children, ended relationship, invitation expiry/revocation, cross-tenant identity collision, supplied-child attacks, and missing tenant context.

- [ ] **Step 2: Add the focused migration**

Store identity-provider subjects through the existing identity abstraction. Keep authentication identity separate from data relationship and require direct tenant keys on every join.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand identity-relationships.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/identity/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE identity relationship schema"
```

**Acceptance:** Authentication alone grants no child data, and relationship joins cannot escape the tenant.

**Rollback:** Stop new identity provisioning and preserve accepted relationships for reviewed forward migration.

### Task 18: ACE-F18 - Add report and Faith content storage

**Branch:** `feat/ace-report-faith-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_reports_faith/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/reports/tests/reports-faith.rls.e2e.spec.ts`

**Interfaces:**
- Produces report compilation/source snapshots, review state, immutable published versions, private document keys, Faith content versions, audiences, reads, and explicitly scoped reflections.

- [ ] **Step 1: Write failing version and RLS tests**

Cover immutable published report/Faith versions, supersession, release state, child/guardian reads, reflection visibility, cross-tenant joins, private storage key shape, and missing tenant context.

- [ ] **Step 2: Add the focused migration**

Keep staff-only notes separate from family/student payloads. Store encrypted sensitive text where classified and private object keys rather than document bytes or public URLs.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand reports-faith.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/reports/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE report and Faith schema"
```

**Acceptance:** Published report/Faith content is versioned, tenant-safe, and releasable without exposing staff-only data.

**Rollback:** Keep additive tables unused and feature capabilities disabled.

### Task 19: ACE-F19 - Add trip and permission-slip storage

**Branch:** `feat/ace-trip-slip-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_trips_slips/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/trips/tests/trips-slips.rls.e2e.spec.ts`

**Interfaces:**
- Produces trips, recipient snapshots, immutable permission-slip versions, material-change classification, guardian responses, physical/telephone exceptions, reminders, and cancellation state.

- [ ] **Step 1: Write failing consent and RLS tests**

Cover immutable published wording, version hash, supersession, reconsent requirement, guardian-child scope, duplicate response key, exception actor/reason/witness, cross-tenant joins, and missing tenant context.

- [ ] **Step 2: Add the focused migration**

Bind every response to the exact published version and relationship. Store encrypted sensitive response content and server-generated private object keys only.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand trips-slips.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/trips/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE trip and permission slip schema"
```

**Acceptance:** Consent wording and responses are reproducible, version-bound, and relationship-safe.

**Rollback:** Disable publication/response capabilities and preserve existing versions.

### Task 20: ACE-F20 - Add toggleable Community storage

**Branch:** `feat/ace-community-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_community/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/community/tests/community.rls.e2e.spec.ts`

**Interfaces:**
- Produces organisation/site feature settings, derived group spaces, group posts/replies, read cursors, reports, moderation actions, and safeguarding reference links.

- [ ] **Step 1: Write failing feature, membership, and RLS tests**

Cover absent/disabled toggle, derived enrolment membership, removed student, moderator scope, preserved hidden content, cross-tenant joins, and explicit proof that no direct-message participant model exists.

- [ ] **Step 2: Add the focused migration**

Keep membership derivable from enrolment/group records. Store moderation evidence immutably and safeguarding case IDs as restricted references without duplicated case details.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand community.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/community/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE Community schema"
```

**Acceptance:** Community data is tenant/group scoped, fail-closed, moderated, and structurally unable to create student DMs.

**Rollback:** Disable Community settings and retain content privately for audit/retention.

### Task 21: ACE-F21 - Add parent/staff messaging and notices storage

**Branch:** `feat/ace-messaging-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_ace_messaging_notices/migration.sql`
- Modify: `scripts/check-supabase-rls.mjs`
- Test: `apps/api/src/messaging/tests/messaging-notices.rls.e2e.spec.ts`

**Interfaces:**
- Produces `MessageConversation`, `MessageParticipant`, `Message`, monotonic read cursors, delivery state, content-free realtime/outbox references, notices, frozen notice audiences, and receipt state. `MessageDraft` stays client-local.

- [ ] **Step 1: Write failing participant, cursor, notice, and RLS tests**

Cover parent-staff/staff-direct/staffroom kinds, explicit `StudentDirect` rejection, participant membership, removed participant, message idempotency, cursor ordering, frozen notice audience, guardian relationship, cross-tenant joins, and missing tenant context.

- [ ] **Step 2: Add the focused migration**

Encrypt classified message text, index participant inbox/history queries, use direct tenant keys on all joins, and store private attachment keys. Do not persist typing state or mobile drafts.

- [ ] **Step 3: Verify and commit**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:integration -- --runInBand messaging-notices.rls
pnpm supabase:rls:check -- --strict
git add packages/db apps/api/src/messaging/tests scripts/check-supabase-rls.mjs
git commit -m "feat: add ACE messaging and notices schema"
```

**Acceptance:** Every conversation/message/notice row is tenant-scoped, participant-safe, and excludes student direct messaging.

**Rollback:** Disable new messaging/notices writes and preserve history.

### Task 22: ACE-F22 - Complete retention, export, audit, outbox, storage, and strict preflight

**Branch:** `security/ace-foundation-preflight`

**Files:**
- Modify: `apps/api/src/audit/audit.types.ts`
- Modify: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/common/outbox/outbox.module.ts`
- Create: `apps/api/src/common/outbox/outbox.service.ts`
- Create: `apps/workers/src/outbox/dispatch-outbox.job.ts`
- Modify: `apps/workers/src/retention/retention-config.service.ts`
- Modify: `apps/api/src/common/storage/storage-key.util.ts`
- Modify: `scripts/launch-preflight.mjs`
- Test: `apps/api/src/common/outbox/tests/outbox.service.spec.ts`
- Test: `apps/workers/src/retention/tests/ace-retention.spec.ts`
- Test: `apps/api/src/ace-foundation/tests/ace-strict-preflight.e2e.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface OutboxIntent {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}

export class OutboxService {
  enqueue(tx: Prisma.TransactionClient, intent: OutboxIntent): Promise<void>;
}
```

- [ ] **Step 1: Write failing outbox, retention, export, and preflight tests**

Prove transaction rollback removes outbox intent, duplicate keys dispatch once, every ACE model has retention/export classification, every private storage class is allow-listed, and every table appears in strict RLS inventory.

- [ ] **Step 2: Implement shared infrastructure**

Add transactional outbox and worker retry/dead-letter state, extend audit action/entity enums, add ACE storage namespaces, and update retention/export inventories. Payloads contain identifiers, not decrypted sensitive text.

- [ ] **Step 3: Run the full foundation gate**

```bash
pnpm db:generate
pnpm --filter @pathway/api test:unit
pnpm --filter @pathway/api test:integration
pnpm --filter @pathway/workers test:unit
pnpm typecheck
pnpm lint
pnpm supabase:rls:check -- --strict
node scripts/launch-preflight.mjs
graphify update .
```

Expected: every command passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api apps/workers scripts graphify-out
git commit -m "security: complete ACE foundation preflight"
```

**Acceptance:** Foundation completion is mechanically blocked by missing RLS, retention, export, audit, storage, or outbox coverage.

**Rollback:** Disable ACE capability grants and workers; preserve audit and outbox history.
