# NexSteps Home — Plan 09: Regulations data + API foundations (slice H6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend foundations for Regulations & Evidence (H6 slice): 7 new Prisma
models split into global reference content and tenant-owned household data, 2 new
capabilities, and 12 mobile-facing endpoints under `/family/regulations/*`. **Zero screens.**
Plan 10 (H7) builds the 17 `regulations-*` screens against this contract.

**Architecture:** Two data planes with deliberately different security treatments.
`Jurisdiction`, `RegulatoryAuthority`, `RegulatorySource`, `Requirement`, `RequirementVersion`
are **global reference/content** — no `tenantId`, no tenant policy, mirroring
`PermissionDefinition`'s treatment (`ENABLE`+`FORCE` RLS with a `FOR SELECT USING (true)`
global-read policy and `REVOKE` from `PUBLIC`, `packages/db/prisma/migrations/20260726090000_permission_definitions/migration.sql:41-67`).
`HouseholdRequirement`, `EvidenceLink`, `Correspondence` are **tenant-owned** — full tenant
RLS policy plus the `app.require_learning_actor_membership` trigger, exactly as
`20260805090000_add_privacy_data_requests/migration.sql:55-85` does. The API module follows
`apps/api/src/family-planner/` verbatim (`CapabilityGuard` + `@RequireCapability` +
`@CurrentTenant` + manual zod, no `ValidationPipe`), because regulations is capability-gated
household *domain* data, not household config.

**Tech Stack:** NestJS (`apps/api`), Prisma + hand-written SQL migrations (`packages/db`),
zod, `@pathway/platform` capability registry. No new dependencies. No worker, no queue, no
scheduler.

## Global Constraints

- **Migrations are separate from consumers** (`implementation-map.md:148`, H6 row). Sub-plan
  09a ships schema + migration + RLS + capabilities with **no API module source at all** —
  only an RLS e2e spec. This is a real, established shape in this repo:
  `apps/api/src/{identity,pace,trips,ace-settings,reports,community}/` each contain *only*
  RLS e2e specs and no source, and none is registered in `app.module.ts`. That is not a trap
  to avoid; it is the pattern 09a copies.
- **No plain-English legal or requirement summaries are written by this plan.**
  `Requirement`/`RequirementVersion` ship with **zero rows**. §12
  (`regulations-and-evidence.md:551-553`) forbids publishing a legal summary without human
  review, and content-review workflow/staffing/SLA is a later plan
  (`product-contract.md:155` lists it as an open decision blocking this slice — proceeding
  on schema + household APIs, deferring the workflow). Every household endpoint must treat
  an empty requirement set as a **first-class supported state**, not an error —
  `GET /requirements` returns `[]`, `GET /overview` returns a populated envelope whose counts
  are all zero.
- **Never label a household compliant.** No field, enum value, DTO key or response string in
  this plan may contain `compliant`, `violation`, `legal`, `satisfied` or `guaranteed`.
  Statuses are exactly `NOT_REVIEWED | IN_PROGRESS | PREPARED | NEEDS_REVIEW` (§6.1,
  `product-contract.md:104`).
- **Evidence is linked, never copied** (decision #8, `acceptance-criteria.md:63`).
  `EvidenceLink` references the existing `Evidence` model
  (`packages/db/prisma/schema.prisma:2535`, Plan 07's *learning* evidence) by
  `(evidenceId, tenantId)` composite FK. No new file-storage model, no `storageKey` column
  anywhere in this plan.
- **No Home capability is added to an ACE vertical grant map; no ACE capability is renamed**
  (`implementation-map.md:130-131`). Only `VERTICAL_CAPABILITIES.HOME_EDUCATION`
  (`packages/platform/src/capability-maps.ts:107-121`) is touched.
- **Tenant is never client-supplied.** `@CurrentTenant("tenantId")` only; no tenant in a path
  param or body. Actor from `request.authUserId` via the private `actorId()` guard that
  throws `BadRequestException` when absent
  (`apps/api/src/family-planner/family-planner.controller.ts:104-109`).
- Cross-model links use composite `(id, tenantId)` FKs backed by
  `CREATE UNIQUE INDEX "X_id_tenantId_key"` so a row can never reference another tenant's
  data (`20260720100000_add_learning_models/migration.sql:100-134`).
- Single-record reads use `findFirst({ where: { id, tenantId } })` + `NotFoundException`.
  **Never `findUnique`.**
- Migration SQL is hand-written and validated with the throwaway-container technique
  (`PROGRESS.md:1161-1173`): fresh `postgres:16-alpine` on an unused port → apply the
  *entire* migration history → `prisma migrate diff` against `schema.prisma` → expect zero
  drift → tear down. **Never migrate-diff against the shared local `pathway` (5433) or
  `pathway_test_e2e` databases.**
- `graphify update .` after any code/doc change (project `CLAUDE.md` gate). Update
  `docs/NexStepsV2/nexsteps-home/build-plans/PROGRESS.md` after every sub-plan lands, per
  that file's own convention.
- Every PR states approved screen IDs (or the non-visual platform contract that enables
  them), owning phase/slice, exact production paths and the data/permission boundary
  (`implementation-map.md:155-187`).

## Locked scoping decisions (recorded here, not re-litigated per sub-plan)

1. **Scope follows the implementation map.** The map splits H6 = "Regulations content and
   household data foundations" from H7 = "Regulations mobile flow **and evidence packs**"
   (`implementation-map.md`, merge-safe delivery sequence). `EvidencePack`,
   `EvidencePackItem`, `EvidencePackShare` and their 4 endpoints (`POST /evidence-packs`,
   `POST /evidence-packs/:id/finalise`, `POST /evidence-packs/:id/shares`,
   `DELETE /evidence-packs/:id/shares/:shareId`) are **out** of Plan 09, owned by Plan 10.
2. **Content-review workflow is deferred, schema is not.** The schema carries reviewer
   identity, approval timestamps, verification state and review-window fields from day one
   so nothing needs re-migrating. The content-review APIs/tooling/staffing/SLA are a later
   plan.
3. **Seed structure only, no legal summaries.** Seed `Jurisdiction` rows (UK +
   England/Wales/Scotland/NI) and `RegulatoryAuthority` + `RegulatorySource` records pointing
   at the 5 real official URLs in spec §24. Zero plain-English legal/requirement summaries.
   `Requirement`/`RequirementVersion` ship with **no published rows**. Consequence: the
   household APIs legitimately return an empty requirement set until content ops publishes;
   that empty state is a first-class supported state.
4. **Sub-plans, migration first**, honouring the H6 merge-safety note "Migrations separate
   from consumers".
5. **The household jurisdiction write endpoint lives in the regulations module**
   (`GET|PATCH /family/regulations/jurisdiction`), capability-gated with
   `family.regulations.*`. This is an addition beyond spec §14's literal endpoint list — see
   Sub-plan 09b's rationale. Without it the feature is permanently unreachable: §14 has no
   jurisdiction write path, yet §9.2 requires a jurisdiction-setup screen and §17 defines a
   `No location` state, and Plan 10 is defined as 0-backend so it cannot add one itself.
6. **Encrypt `notes` fields only.** `Correspondence.notes` and `HouseholdRequirement.notes`
   go into `ENCRYPTED_STRING_FIELDS` (`packages/db/src/pii-encryption.ts`).
   `Correspondence.senderName`/`subject` stay plaintext so the correspondence list can sort
   and filter — matching this file's own documented convention (`pii-encryption.ts:6-11`:
   "lookup/identity fields... are intentionally excluded; encrypting those would require a
   blind-index strategy, which is out of scope for this pass").

## File Structure

**Created by 09a (schema + migration + capabilities, no consumers):**
- `packages/db/prisma/migrations/20260810090000_add_regulations_foundation/migration.sql`
- `apps/api/src/regulations/tests/regulations.rls.e2e.spec.ts` *(spec only — no module
  source in this sub-plan)*

**Modified by 09a:**
- `packages/db/prisma/schema.prisma` — 7 new models, 12 new enums, 3 new `Tenant` fields,
  `@@unique([id, tenantId])` added to `Evidence` and `Task`
- `packages/db/src/pii-encryption.ts` — 2 entries in `ENCRYPTED_STRING_FIELDS`
- `packages/platform/src/capability-definitions.ts`
- `packages/platform/src/capability-maps.ts`
- `packages/platform/src/__tests__/capability-definitions.spec.ts`
- `scripts/check-supabase-rls.mjs` — `REQUIRED_RLS_TABLES`

**Created by 09b (jurisdiction scope + content reads):**
- `apps/api/src/regulations/regulations.controller.ts`
- `apps/api/src/regulations/regulations.service.ts`
- `apps/api/src/regulations/regulations.module.ts`
- `apps/api/src/regulations/dto/index.ts`
- `apps/api/src/regulations/tests/regulations.service.spec.ts`
- `apps/api/src/regulations/tests/regulations.controller.spec.ts`

**Modified by 09b:** `apps/api/src/app.module.ts`

**Created by 09c (household preparedness, evidence links, correspondence, overview):**
- `apps/api/src/regulations/regulations-household.service.ts`
- `apps/api/src/regulations/tests/regulations-household.service.spec.ts`

**Modified by 09c:** `apps/api/src/regulations/{regulations.controller.ts,regulations.module.ts,dto/index.ts,tests/regulations.controller.spec.ts}`

## Sub-plan decomposition and why these boundaries

| Sub-plan | Surface | Endpoints | New models | Risk |
| --- | --- | --- | --- | --- |
| 09a | Schema, migration, RLS, capabilities | 0 | 7 + Tenant fields | high (irreversible shape) |
| 09b | Jurisdiction scope + content reads | 6 | 0 | low |
| 09c | Household state + overview | 6 | 0 | medium |

**Why 09a is alone.** The H6 merge-safety boundary is literally "Migrations separate from
consumers". 09a changes zero runtime behaviour: no controller, no route, no module in
`app.module.ts`. It is revertible by dropping tables. It is also where the entire security
surface lives (RLS policies, actor triggers, composite FKs, CHECK constraints), so a
reviewer reads security in one place instead of hunting it across three PRs.

**Why capabilities are in 09a, not with the controllers.** The capability registry is itself
migration-shaped: it writes the `PermissionDefinition` table via
`pnpm permission-definitions:sync` and has its own CI drift gate. A registered capability
with no route grants nothing — verified: `capability-definitions.spec.ts:183-198` only
asserts *granted ⊆ defined*, never the reverse, so there is no "unused capability" failure.
Keeping the 5-file capability dance (including the hand-maintained count assertion at
`capability-definitions.spec.ts:168-174`) in one reviewable PR beats splitting it.

**Why 09b comes before 09c.** Every household endpoint needs a jurisdiction to scope
against and a requirement to attach to. 09b establishes the jurisdiction scope and the
content projection (source provenance, verification state, staleness) that 09c's
preparedness and overview responses reuse.

**Why `GET /overview` is folded into 09c rather than a fourth sub-plan.** Overview is a
read-only composition of the two services already built. It introduces no model, no guard,
no new DTO surface and no new capability. A separate PR for one composing endpoint is
process, not risk reduction.

## Endpoint scope

**In scope (12):**

```
GET    /family/regulations/jurisdiction                    09b   family.regulations.read
PATCH  /family/regulations/jurisdiction                     09b   family.regulations.write
GET    /family/regulations/requirements                     09b   family.regulations.read
GET    /family/regulations/requirements/:id                 09b   family.regulations.read
GET    /family/regulations/updates                          09b   family.regulations.read
GET    /family/regulations/updates/:id                      09b   family.regulations.read
PATCH  /family/regulations/requirements/:id/preparedness    09c   family.regulations.write
GET    /family/regulations/evidence                         09c   family.regulations.read
POST   /family/regulations/evidence-links                   09c   family.regulations.write
POST   /family/regulations/correspondence                   09c   family.regulations.write
PATCH  /family/regulations/correspondence/:id                09c   family.regulations.write
GET    /family/regulations/overview                          09c   family.regulations.read
```

`@Controller("family/regulations")` produces these paths exactly; slashed controller
prefixes are precedented (`apps/api/src/auth/active-site.controller.ts:42` uses
`"auth/active-site"`) and there is no global prefix in `apps/api/src/main.ts`.

**The two `jurisdiction` endpoints are an addition to the §14 list** (locked decision 5) —
spec §14 (`regulations-and-evidence.md:657-671`) has no jurisdiction write endpoint, yet
§9.2 requires a jurisdiction-setup screen and §17 defines a `No location` state.

**Out of scope (4), owned by H7/Plan 10:** `POST /evidence-packs`,
`POST /evidence-packs/:id/finalise`, `POST /evidence-packs/:id/shares`,
`DELETE /evidence-packs/:id/shares/:shareId`, and the
`EvidencePack`/`EvidencePackItem`/`EvidencePackShare` models.

---

# Sub-plan 09a: Schema, migration, RLS and capabilities

**Approved screens:** none. This is the non-visual platform contract enabling
`regulations-jurisdiction`, `regulations-overview`, `regulations-requirements`,
`regulations-requirement-detail`, `regulations-evidence`, `regulations-updates`,
`regulations-update-detail`, `regulations-correspondence*` (H7/Plan 10).

**Data and permission boundary:** 5 global content tables (no tenant, global read policy,
no runtime writer); 3 tenant-owned tables (tenant RLS + FORCE + actor-membership trigger +
composite `(id, tenantId)` FKs to `Child`, `Evidence`, `Task`).

**Files:**
- Create: `packages/db/prisma/migrations/20260810090000_add_regulations_foundation/migration.sql`
- Create: `apps/api/src/regulations/tests/regulations.rls.e2e.spec.ts`
- Modify: `packages/db/prisma/schema.prisma`, `packages/db/src/pii-encryption.ts`,
  `packages/platform/src/capability-definitions.ts`,
  `packages/platform/src/capability-maps.ts`,
  `packages/platform/src/__tests__/capability-definitions.spec.ts`,
  `scripts/check-supabase-rls.mjs`

**Interfaces:**
- Consumes: `Tenant`, `Child(id, tenantId)`, `Evidence`, `Task`, `User`,
  `app.require_learning_actor_membership`
  (`20260720100000_add_learning_models/migration.sql:137-160`), `app.current_tenant_id()`.
- Produces: 7 Prisma models + 3 `Tenant` columns + 12 enums; capabilities
  `family.regulations.read` / `family.regulations.write`.

- [ ] **Step 1: Read the three precedent migrations end to end before writing any SQL**

  Run: `cat packages/db/prisma/migrations/20260720100000_add_learning_models/migration.sql packages/db/prisma/migrations/20260805090000_add_privacy_data_requests/migration.sql packages/db/prisma/migrations/20260726090000_permission_definitions/migration.sql`

  You need three distinct templates from these: the composite-FK + actor-trigger block, the
  tenant-RLS `DO $$ ... FOREACH` loop, and the global-reference-table RLS treatment. Do not
  paraphrase them from this plan — copy the real SQL.

- [ ] **Step 2: Add the enums to `schema.prisma`**

  Follow the existing UPPER_SNAKE value convention (`ReportBundleStatus`, `schema.prisma:179`).

```prisma
enum JurisdictionLevel { COUNTRY NATION REGION LOCAL_AUTHORITY }
enum JurisdictionContentStatus { NOT_CONFIGURED IN_PREPARATION PUBLISHED WITHDRAWN }
enum RegulatoryAuthorityType { NATIONAL_GOVERNMENT DEVOLVED_GOVERNMENT GOVERNMENT_DEPARTMENT LOCAL_AUTHORITY }
enum RegulatorySourceType { GUIDANCE LEGISLATION FORM LOCAL_PROCESS }
enum SourceVerificationState { UNVERIFIED VERIFIED NEEDS_REVERIFICATION UNAVAILABLE WITHDRAWN }
enum RequirementVersionStatus { DRAFT IN_REVIEW PUBLISHED SUPERSEDED WITHDRAWN }
enum RequirementImpactLevel { ROUTINE NOTABLE HIGH }
enum RequirementChangeKind { NEW CHANGED CORRECTION WITHDRAWN }
enum RequirementAppliesTo { HOUSEHOLD CHILD }
enum HouseholdPreparednessStatus { NOT_REVIEWED IN_PROGRESS PREPARED NEEDS_REVIEW }
enum EvidenceLinkPurpose { REQUIREMENT_EVIDENCE CORRESPONDENCE_ATTACHMENT RESPONSE_EVIDENCE }
enum CorrespondenceStatus { RECEIVED REVIEWING PREPARING_RESPONSE RESPONDED CLOSED }
```

  `HouseholdPreparednessStatus` values are §6.1's four words and nothing else.
  `RequirementChangeKind` covers §9.8's card labels; `Effective soon` is derived from
  `effectiveFrom`, not stored (see the §13 field-mapping table below — there is no `Update`
  entity in the spec).

- [ ] **Step 3: Add the 5 global content models — no `tenantId` on any of them**

```prisma
model Jurisdiction {
  id                   String                    @id @default(uuid())
  countryCode          String                    @db.Char(2)   // ISO 3166-1 alpha-2
  subdivisionCode      String?                                  // ISO 3166-2, null at COUNTRY level
  name                 String
  level                JurisdictionLevel
  parentJurisdictionId String?
  parent               Jurisdiction?             @relation("JurisdictionTree", fields: [parentJurisdictionId], references: [id], onDelete: Restrict)
  children             Jurisdiction[]            @relation("JurisdictionTree")
  contentStatus        JurisdictionContentStatus @default(NOT_CONFIGURED)
  authorities          RegulatoryAuthority[]
  requirements         Requirement[]
  @@index([countryCode, subdivisionCode])
  @@index([parentJurisdictionId])
  @@index([level, contentStatus])
}

model RegulatoryAuthority {
  id             String                  @id @default(uuid())
  jurisdictionId String
  jurisdiction   Jurisdiction            @relation(fields: [jurisdictionId], references: [id], onDelete: Restrict)
  name           String
  authorityType  RegulatoryAuthorityType
  officialDomain String
  @@index([jurisdictionId])
}

model RegulatorySource {
  id                String                  @id @default(uuid())
  authorityId       String
  authority         RegulatoryAuthority     @relation(fields: [authorityId], references: [id], onDelete: Restrict)
  title             String
  canonicalUrl      String
  sourceType        RegulatorySourceType
  publishedAt       DateTime?
  effectiveAt       DateTime?
  lastCheckedAt     DateTime?
  lastVerifiedAt    DateTime?
  verifiedByUserId  String?
  reviewWindowDays  Int                     @default(90)
  verificationState SourceVerificationState @default(UNVERIFIED)
  contentHash       String?
  @@index([authorityId])
  @@index([verificationState, lastVerifiedAt])
}

model Requirement {
  id             String               @id @default(uuid())
  jurisdictionId String
  jurisdiction   Jurisdiction         @relation(fields: [jurisdictionId], references: [id], onDelete: Restrict)
  sortOrder      Int                  @default(0)
  versions       RequirementVersion[]
  @@index([jurisdictionId, sortOrder])
}

model RequirementVersion {
  id                     String                   @id @default(uuid())
  requirementId          String
  requirement            Requirement              @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  versionNumber          Int
  status                 RequirementVersionStatus @default(DRAFT)
  title                  String
  summary                String                   @db.Text
  preparationSuggestions String[]                 @default([])
  appliesTo              RequirementAppliesTo     @default(HOUSEHOLD)
  applicabilityNote      String?                  @db.Text
  primarySourceId        String
  primarySource          RegulatorySource         @relation(fields: [primarySourceId], references: [id], onDelete: Restrict)
  effectiveFrom          DateTime?
  effectiveTo            DateTime?
  impactLevel            RequirementImpactLevel   @default(ROUTINE)
  changeKind             RequirementChangeKind    @default(NEW)
  changeSummary          String?                  @db.Text
  previousWording        String?                  @db.Text
  reviewedByUserId       String?
  reviewedAt             DateTime?
  secondReviewerUserId   String?
  secondReviewedAt       DateTime?
  publishedAt            DateTime?
  supersedesVersionId    String?
  @@unique([requirementId, versionNumber])
  @@index([requirementId, status, publishedAt])
  @@index([status, publishedAt])
}
```

  `lastVerifiedAt`, `verifiedByUserId` and `reviewWindowDays` are additions beyond §13's
  literal list, required by §6.2 ("last verified date"), §12 ("has not been reverified
  within its review window") and locked decision 2. `lastCheckedAt` (an automated fetch
  touched the URL) and `lastVerifiedAt` (a human confirmed the content) are deliberately
  different columns — collapsing them would let an automated check silently refresh a human
  verification date.

- [ ] **Step 4: Add the 3 tenant-owned models**

```prisma
model HouseholdRequirement {
  id                    String                      @id @default(uuid())
  tenantId              String
  tenant                Tenant                      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  requirementId         String
  requirement           Requirement                 @relation(fields: [requirementId], references: [id], onDelete: Restrict)
  jurisdictionId        String
  jurisdiction          Jurisdiction                @relation(fields: [jurisdictionId], references: [id], onDelete: Restrict)
  childId               String?
  child                 Child?                      @relation(fields: [childId, tenantId], references: [id, tenantId], onDelete: Restrict)
  status                HouseholdPreparednessStatus @default(NOT_REVIEWED)
  notes                 String?                     @db.Text
  acknowledgedVersionId String?
  acknowledgedVersion   RequirementVersion?         @relation(fields: [acknowledgedVersionId], references: [id], onDelete: Restrict)
  deadlineAt            DateTime?
  archivedAt            DateTime?
  updatedByUserId       String
  updatedBy             User                        @relation("HouseholdRequirementUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: Restrict)
  evidenceLinks         EvidenceLink[]
  createdAt             DateTime                    @default(now())
  updatedAt             DateTime                    @updatedAt
  @@unique([id, tenantId])
  @@index([tenantId, status, deadlineAt])
  @@index([tenantId, childId])
  @@index([requirementId])
}

model EvidenceLink {
  id                     String                @id @default(uuid())
  tenantId               String
  tenant                 Tenant                @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  evidenceId             String
  evidence               Evidence              @relation(fields: [evidenceId, tenantId], references: [id, tenantId], onDelete: Restrict)
  householdRequirementId String?
  householdRequirement   HouseholdRequirement? @relation(fields: [householdRequirementId, tenantId], references: [id, tenantId], onDelete: Restrict)
  correspondenceId       String?
  correspondence         Correspondence?       @relation("CorrespondenceEvidenceLinks", fields: [correspondenceId, tenantId], references: [id, tenantId], onDelete: Restrict)
  purpose                EvidenceLinkPurpose
  linkedByUserId         String
  linkedBy               User                  @relation("EvidenceLinkLinkedBy", fields: [linkedByUserId], references: [id], onDelete: Restrict)
  linkedAt               DateTime              @default(now())
  @@unique([id, tenantId])
  @@index([tenantId, evidenceId])
  @@index([householdRequirementId])
  @@index([correspondenceId])
}

model Correspondence {
  id                  String               @id @default(uuid())
  tenantId            String
  tenant              Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  childId             String?
  child               Child?               @relation(fields: [childId, tenantId], references: [id, tenantId], onDelete: Restrict)
  senderName          String
  issuingAuthorityId  String?
  issuingAuthority    RegulatoryAuthority? @relation(fields: [issuingAuthorityId], references: [id], onDelete: Restrict)
  subject             String
  receivedAt          DateTime
  responseDueAt       DateTime?
  respondedAt         DateTime?
  status              CorrespondenceStatus @default(RECEIVED)
  originalEvidenceId  String?
  originalEvidence    Evidence?            @relation("CorrespondenceOriginal", fields: [originalEvidenceId, tenantId], references: [id, tenantId], onDelete: Restrict)
  taskId              String?
  task                Task?                @relation(fields: [taskId, tenantId], references: [id, tenantId], onDelete: SetNull)
  notes               String?              @db.Text
  createdByUserId     String
  createdBy           User                 @relation("CorrespondenceCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  evidenceLinks       EvidenceLink[]       @relation("CorrespondenceEvidenceLinks")
  createdAt           DateTime             @default(now())
  updatedAt           DateTime             @updatedAt
  @@unique([id, tenantId])
  @@index([tenantId, status, responseDueAt])
  @@index([tenantId, childId])
}
```

  `Correspondence.task` uses `onDelete: SetNull` because `taskId` is optional —
  `PROGRESS.md:1170-1172` records a real bug caught by the drift check where
  `Task.assignedToUserId` needed `SET NULL`, not `RESTRICT`, for exactly this reason. Every
  other optional composite FK here points at a row that must not disappear underneath the
  record, so those stay `RESTRICT`.

- [ ] **Step 5: Modify two existing models and `Tenant`**

  `Evidence` and `Task` currently have no `@@unique([id, tenantId])`. The composite FKs in
  Step 4 require them. Both are purely additive index creations — no column change, no data
  migration.

```prisma
// model Evidence — add:
  regulationEvidenceLinks  EvidenceLink[]
  correspondenceOriginals  Correspondence[] @relation("CorrespondenceOriginal")
  @@unique([id, tenantId])

// model Task — add:
  correspondence Correspondence[]
  @@unique([id, tenantId])

// model Tenant — add next to learningDays/planningPreferences (schema.prisma:712-722):
  // NexSteps Home Regulations & Evidence (H6/Plan 09): the household's selected
  // nation and optional verified local-authority overlay. Household-singleton
  // settings on Tenant, matching the learningDays/planningPreferences precedent.
  regulationsJurisdictionId      String?
  regulationsJurisdiction        Jurisdiction? @relation("HouseholdNation", fields: [regulationsJurisdictionId], references: [id], onDelete: Restrict)
  regulationsLocalAuthorityId    String?
  regulationsLocalAuthority      Jurisdiction? @relation("HouseholdLocalAuthority", fields: [regulationsLocalAuthorityId], references: [id], onDelete: Restrict)
  regulationsJurisdictionSetAt   DateTime?
```

- [ ] **Step 6: Add the two PII-encryption entries**

  `packages/db/src/pii-encryption.ts:12-34` maps model → sensitive string fields, encrypted
  at rest by a Prisma extension. Per locked decision 6, encrypt `notes` only.

```ts
  Correspondence: ["notes"],
  HouseholdRequirement: ["notes"],
```

  **Consequence to respect for the rest of this plan:** encrypted columns cannot be
  filtered, sorted or indexed in SQL. No query in 09b or 09c may `where`/`orderBy` on
  `Correspondence.notes` or `HouseholdRequirement.notes`. `senderName`, `subject`, `status`,
  `receivedAt` and `responseDueAt` stay plaintext, which is why the
  `@@index([tenantId, status, responseDueAt])` above is the one that matters for the
  correspondence list.

- [ ] **Step 7: Write the migration SQL — order matters**

  File: `packages/db/prisma/migrations/20260810090000_add_regulations_foundation/migration.sql`.
  Sections in this exact order:

  1. `CREATE TYPE` for all 12 enums.
  2. `CREATE TABLE` for all 8 new tables; `ALTER TABLE "Tenant" ADD COLUMN` × 3.
  3. `CREATE UNIQUE INDEX "Evidence_id_tenantId_key"`, `"Task_id_tenantId_key"`,
     `"HouseholdRequirement_id_tenantId_key"`, `"EvidenceLink_id_tenantId_key"`,
     `"Correspondence_id_tenantId_key"`,
     `"RequirementVersion_requirementId_versionNumber_key"`; all `CREATE INDEX`es.
  4. All `ADD CONSTRAINT ... FOREIGN KEY`. Tenant FKs use
     `ON DELETE RESTRICT ON UPDATE CASCADE`. Composite FKs reference `("id","tenantId")`.
  5. CHECK constraints (Step 8).
  6. Partial unique indexes (Step 9).
  7. **Seed INSERTs (Step 10) — before RLS is enabled**, so the migration cannot be blocked
     by the FORCE policies it is about to create.
  8. Actor-membership triggers on the 3 tenant tables.
  9. Tenant RLS loop over the 3 tenant tables.
  10. Global-reference RLS block over the 5 content tables.

```sql
-- 9. Tenant-owned regulations rows expose tenantId directly, so apply the
--    established tenant RLS policy (see 20260805090000_add_privacy_data_requests).
DO $$
DECLARE tbl text; policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['HouseholdRequirement', 'EvidenceLink', 'Correspondence']
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name, tbl);
  END LOOP;
END; $$;

-- 10. Regulatory content is platform-global reference data with no tenant column.
--     Same treatment as PermissionDefinition (20260726090000): globally readable
--     under an explicit policy, writes reserved for privileged content operations.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Jurisdiction', 'RegulatoryAuthority', 'RegulatorySource', 'Requirement', 'RequirementVersion']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true);', tbl || '_global_read', tbl);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);
  END LOOP;
END; $$;
```

  The content tables **must** get `ENABLE ROW LEVEL SECURITY` even though they have no
  tenant column. `scripts/check-supabase-rls.mjs` selects *every* table in the schema with
  `relrowsecurity = false` and fails the run under `--strict` if the result is non-empty. A
  new table without `ENABLE` breaks `pnpm supabase:rls:check -- --strict` for the whole
  repo. Historic precedent: `20260613000000_lock_supabase_public_rls/migration.sql:73-86`
  enabled RLS on every then-existing table for the same reason.

- [ ] **Step 8: Add the CHECK constraints — this is where the deferred review workflow
  becomes safe**

```sql
ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_published_requires_review_check"
  CHECK (
    "status" <> 'PUBLISHED'
    OR ("reviewedByUserId" IS NOT NULL AND "reviewedAt" IS NOT NULL AND "publishedAt" IS NOT NULL)
  );

ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_high_impact_second_review_check"
  CHECK (
    "status" <> 'PUBLISHED' OR "impactLevel" <> 'HIGH'
    OR ("secondReviewerUserId" IS NOT NULL AND "secondReviewedAt" IS NOT NULL)
  );

ALTER TABLE "RequirementVersion" ADD CONSTRAINT "RequirementVersion_effective_interval_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveFrom" IS NULL OR "effectiveTo" > "effectiveFrom");

ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_single_target_check"
  CHECK (num_nonnulls("householdRequirementId", "correspondenceId") = 1);

ALTER TABLE "Correspondence" ADD CONSTRAINT "Correspondence_responded_requires_date_check"
  CHECK ("status" NOT IN ('RESPONDED', 'CLOSED') OR "respondedAt" IS NOT NULL);
```

  The first two are the load-bearing ones. `acceptance-criteria.md:59-60` requires that
  every requirement has a source, verification state and review date, and that high-impact
  summaries cannot publish without human review. Because the content-review *workflow* is
  deferred (locked decision 2), a database invariant is the only thing standing between
  "deferred" and "unenforced". "At least one authoritative source" is enforced by
  `RequirementVersion.primarySourceId` being `NOT NULL`. CHECK constraints are heavily
  precedented here — `20260801120000_ace_pace_behaviour/migration.sql:25-70` has eleven —
  and Prisma does not model them, so they are invisible to `migrate diff`.

- [ ] **Step 9: Add the partial unique indexes**

```sql
CREATE UNIQUE INDEX "HouseholdRequirement_tenant_requirement_child_key"
  ON "HouseholdRequirement"("tenantId", "requirementId", "childId")
  WHERE "childId" IS NOT NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "HouseholdRequirement_tenant_requirement_household_key"
  ON "HouseholdRequirement"("tenantId", "requirementId")
  WHERE "childId" IS NULL AND "archivedAt" IS NULL;

CREATE UNIQUE INDEX "EvidenceLink_tenant_evidence_requirement_key"
  ON "EvidenceLink"("tenantId", "evidenceId", "householdRequirementId")
  WHERE "householdRequirementId" IS NOT NULL;

CREATE UNIQUE INDEX "EvidenceLink_tenant_evidence_correspondence_key"
  ON "EvidenceLink"("tenantId", "evidenceId", "correspondenceId")
  WHERE "correspondenceId" IS NOT NULL;
```

  A plain `@@unique([tenantId, requirementId, childId])` would **not** work: Postgres
  treats NULLs as distinct, so every household-scoped row (`childId IS NULL`) could be
  duplicated. Partial unique indexes in raw SQL with no `@@unique` counterpart in
  `schema.prisma` are precedented —
  `20260727170000_dedicated_system_role_seed/migration.sql:11-13` creates
  `"OrgRoleDefinition_orgId_name_isSystem_orgwide_key" ... WHERE "tenantId" IS NULL` and
  `schema.prisma` carries only the full `@@unique([orgId, tenantId, name, isSystem])`.
  **Verify this specifically in Step 12's drift run.** If `migrate diff` reports the partial
  indexes as drift, drop them and enforce uniqueness in the service layer with a
  `findFirst`-then-create; record that fallback in `PROGRESS.md` rather than fighting the
  tool.

- [ ] **Step 10: Seed structure only — jurisdictions, authorities and the 5 official
  sources. Zero legal text.**

  Fixed UUIDs with `ON CONFLICT ("id") DO NOTHING`, mirroring
  `20260731090000_system_actor_user/migration.sql` ("Idempotent: safe to apply more than
  once").

```sql
INSERT INTO "Jurisdiction" ("id","countryCode","subdivisionCode","name","level","parentJurisdictionId","contentStatus") VALUES
  ('a0000000-0000-4000-8000-000000000001','GB',NULL,    'United Kingdom',  'COUNTRY', NULL,                                   'IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000002','GB','GB-ENG','England',         'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000003','GB','GB-WLS','Wales',           'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000004','GB','GB-SCT','Scotland',        'NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION'),
  ('a0000000-0000-4000-8000-000000000005','GB','GB-NIR','Northern Ireland','NATION',  'a0000000-0000-4000-8000-000000000001','IN_PREPARATION')
ON CONFLICT ("id") DO NOTHING;
```

  Four `RegulatoryAuthority` rows (DfE / Welsh Government / Scottish Government / DE
  Northern Ireland, `officialDomain` = `gov.uk`, `gov.wales`, `gov.scot`,
  `education-ni.gov.uk`; nidirect is a fifth source under the NI authority). Five
  `RegulatorySource` rows carrying **only** the §24 URLs
  (`regulations-and-evidence.md:906-913`), `sourceType = 'GUIDANCE'`,
  `verificationState = 'UNVERIFIED'`, `lastVerifiedAt = NULL`.

  All jurisdictions ship `IN_PREPARATION`, not `PUBLISHED`: §8.1 requires that "users cannot
  select unpublished or unreviewed jurisdiction content as if it were complete", and no
  content has been reviewed. `UNVERIFIED` sources are correct and honest — no human has
  verified them, and §17's stale/unverified state is designed for exactly this.

  **No `Requirement` or `RequirementVersion` rows. Not one.**

  *Reference-data mechanism decision and justification:* the repo's declarative mechanism
  (`capability-definitions.ts` → `permission-definition-sync.ts` →
  `pnpm permission-definitions:sync|check`, mirrored for roles in
  `system-role-templates.ts` → `seed-system-roles.ts`) exists to keep a derived table in
  lockstep with code that *references its keys* — a capability key appears literally inside
  `@RequireCapability("...")`, so registry drift is a security bug, which is why it earns a
  CI drift gate. Nothing in this plan references a jurisdiction or source by literal
  identifier. Worse, a drift-checked registry is actively **wrong** for these rows:
  `RegulatorySource.lastCheckedAt`, `lastVerifiedAt`, `verificationState` and `contentHash`
  — and `Jurisdiction.contentStatus` — are mutated at runtime by content ops and (later) by
  a reverification job. A declarative sync would either clobber that state or report
  permanent drift. `packages/db/prisma/seed.ts` is demo data and is not shipped to
  production. That leaves the migration `INSERT` with `ON CONFLICT DO NOTHING`: 13 rows,
  idempotent, zero new tooling, and structurally incapable of overwriting runtime state.
  When the content-review plan adds a jurisdiction/source admin API, it should also add the
  uniqueness constraint that this seeding approach does not need.

- [ ] **Step 11: Add the 8 new tables to `REQUIRED_RLS_TABLES`**

  `scripts/check-supabase-rls.mjs`. Append `HouseholdRequirement`, `EvidenceLink`,
  `Correspondence`, `Jurisdiction`, `RegulatoryAuthority`, `RegulatorySource`,
  `Requirement`, `RequirementVersion`. All eight FORCE RLS, so all eight satisfy the
  forced-RLS query.

  **Correction to a common misreading:** the hand-maintained
  `c.relname IN ('PermissionDefinition', 'OrgRoleDefinition', ...)` list elsewhere in that
  script is *not* the forced-RLS query — it is a reviewed-policy allowlist scoped to the 7
  platform access-control tables. Do **not** add regulations tables to it; doing so would
  subject the new policies to a review-shape assertion written for a different table
  family. Only `REQUIRED_RLS_TABLES` needs changing.

  Optional, and worth doing while you are in the file: `Activity`, `Task`, `CalendarItem`,
  `DataExportRequest` and `AccountDeletionRequest` all have FORCE RLS in their migrations
  but were never added to this list (verified: 0 matches for "Activity" in the script).
  Closing that gap is a 5-line change with no behaviour risk. If you close it, say so in the
  PR; if you do not, leave it out of scope rather than half-doing it.

- [ ] **Step 12: Validate the migration against a throwaway container**

  Start an isolated `postgres:16-alpine` on an unused port. Apply the **entire** migration
  history from scratch. Then `prisma migrate diff` between that database and
  `schema.prisma`, expecting zero drift. Tear the container down immediately.

  Never point this at `pathway` (5433) or `pathway_test_e2e` — `PROGRESS.md:1161-1173`
  documents why, and that same run is what caught a real `SET NULL` vs `RESTRICT` FK bug in
  an earlier plan. Pay specific attention to: the partial unique indexes (Step 9), the
  `@db.Char(2)` mapping on `countryCode`, `String[]` defaults, and the two
  `@@unique([id, tenantId])` additions on pre-existing tables.

- [ ] **Step 13: Register the two capabilities — 5 files, in order**

  1. `packages/platform/src/capability-definitions.ts`, immediately after
     `family.calendar.write` (~L317-322):

```ts
  "family.regulations.read": defineCapability(
    "View regulations and evidence",
    "View the household's preparedness, official requirements, updates, linked evidence and correspondence",
    "site",
    "sensitive",
  ),
  "family.regulations.write": defineCapability(
    "Manage regulations and evidence",
    "Set the household's jurisdiction, update preparedness, link evidence and record correspondence",
    "site",
    "sensitive",
  ),
```

  `"site"` + `"sensitive"`, delegable (default `true`), and **no `requiredVertical`** —
  matching every other `family.*` entry exactly. Do not add
  `requiredVertical: Vertical.HOME_EDUCATION`; the existing Home block deliberately omits
  it.

  2. `packages/platform/src/capability-maps.ts` — append both keys to
     `VERTICAL_CAPABILITIES.HOME_EDUCATION` (L107-121) and **nothing else**. `ACE_SCHOOL`
     (L39-86) and the other six verticals are untouched.
  3. `packages/platform/src/__tests__/capability-definitions.spec.ts` — add both literals
     to the `family.*` key list where the other `family.*` keys live, and change the
     `it("contains exactly the 106 approved registry keys")` assertion to `108`. This
     assertion exists specifically to force new capabilities through an explicit reviewed
     list (`PROGRESS.md:1176-1180`) — update it deliberately, not reflexively.
  4. Controller `@RequireCapability(...)` — lands in 09b/09c, not here. Verified safe:
     `capability-definitions.spec.ts:183-198` only asserts granted ⊆ defined, so a
     defined-and-granted capability with no route yet fails nothing.
  5. `pnpm permission-definitions:sync` locally; CI runs
     `pnpm permission-definitions:check`.

- [ ] **Step 14: Write the RLS e2e spec**

  `apps/api/src/regulations/tests/regulations.rls.e2e.spec.ts`, modelled on
  `apps/api/src/identity/tests/identity-relationships.rls.e2e.spec.ts` and
  `apps/api/src/trips/tests/trips-slips.rls.e2e.spec.ts`: no HTTP, no Nest, raw SQL through
  `withTenantRlsContext` (`packages/db/src/index.ts:222-236`),
  `SET LOCAL ROLE "pathway_e2e_tenant_rls"` when `E2E_USE_GLOBAL_SETUP === "true"`, and
  assertions on PostgreSQL error codes via
  `rejects.toMatchObject({ code: "P2010", meta: { code: "<pgcode>" } })`.

  Cases:
  - Tenant A creates a `HouseholdRequirement`, `EvidenceLink` and `Correspondence`; under
    tenant B's context all three counts are `0n`.
  - Inserting a `HouseholdRequirement` whose `tenantId` differs from the row's own tenant
    context → policy rejection via `WITH CHECK`.
  - `HouseholdRequirement` referencing tenant B's `childId` → `23503` (composite FK).
  - `EvidenceLink` referencing tenant B's `evidenceId` → `23503`.
  - `EvidenceLink` with **both** `householdRequirementId` and `correspondenceId` set, and
    with **neither** set → `23514` (CHECK violation) for each.
  - Actor-membership: `updatedByUserId` / `linkedByUserId` / `createdByUserId` for a user
    with no `SiteMembership` or `UserTenantRole` in that tenant → `23503`.
  - `RequirementVersion` with `status='PUBLISHED'` and `reviewedByUserId IS NULL` →
    `23514`. Then `impactLevel='HIGH'`, first review present,
    `secondReviewerUserId IS NULL` → `23514`. **These two cases are the acceptance
    evidence for `acceptance-criteria.md:59-60` and the justification for deferring the
    review workflow — do not skip them.**
  - Duplicate active `HouseholdRequirement` for the same
    `(tenantId, requirementId, childId)` and for the same `(tenantId, requirementId)` with
    `childId IS NULL` → `23505` each. (Delete these two cases if Step 12 forced the
    partial-index fallback.)
  - Content tables are globally readable under the e2e role: the 5 seeded `Jurisdiction`
    rows are visible with **no** tenant context set.

  Run: `pnpm --filter @pathway/api test:integration -- --runInBand regulations.rls`

- [ ] **Step 15: Full verification**

```bash
pnpm db:generate
pnpm --filter @pathway/platform test:unit
pnpm -r typecheck && pnpm -r lint && pnpm test:unit
pnpm --filter @pathway/api test:integration -- --runInBand regulations.rls
pnpm permission-definitions:check
pnpm supabase:rls:check -- --strict
```

**PR handoff block:**
```text
Approved screens: none (backend-only). Non-visual platform contract enabling
  regulations-jurisdiction, regulations-overview, regulations-requirements,
  regulations-requirement-detail, regulations-evidence, regulations-updates,
  regulations-update-detail, regulations-correspondence,
  regulations-correspondence-detail, regulations-correspondence-add
  (Phase 7, PR H7 / Plan 10)
Owning phase: Phase 7, PR H6a
Production paths: packages/db/prisma/schema.prisma,
  packages/db/prisma/migrations/20260810090000_add_regulations_foundation/migration.sql,
  packages/db/src/pii-encryption.ts,
  packages/platform/src/{capability-definitions.ts,capability-maps.ts},
  packages/platform/src/__tests__/capability-definitions.spec.ts,
  scripts/check-supabase-rls.mjs,
  apps/api/src/regulations/tests/regulations.rls.e2e.spec.ts
Data and permission boundary: Jurisdiction/RegulatoryAuthority/RegulatorySource/
  Requirement/RequirementVersion are global reference content, no tenantId, FORCE
  RLS with a global SELECT policy, PUBLIC revoked, no runtime writer.
  HouseholdRequirement/EvidenceLink/Correspondence are tenant RLS + FORCE +
  actor-membership trigger, composite (id, tenantId) FKs to Child, Evidence, Task.
  Capabilities family.regulations.{read,write} granted to HOME_EDUCATION only, no
  ACE grant map touched, no route consumes them yet.
States covered: n/a (no UI). Empty published-content set is the intended shipped state.
Validation: pnpm -r typecheck, pnpm -r lint, pnpm test:unit; pnpm --filter @pathway/api
  test:integration -- --runInBand regulations.rls; pnpm permission-definitions:check;
  pnpm supabase:rls:check -- --strict; prisma migrate diff vs a throwaway
  postgres:16-alpine with full history applied: zero drift
```

---

# Sub-plan 09b: Jurisdiction scope and content reads

**Approved screens:** none (backend for `regulations-jurisdiction`,
`regulations-requirements`, `regulations-requirement-detail`, `regulations-updates`,
`regulations-update-detail`).

**Data and permission boundary:** `family.regulations.read` / `family.regulations.write`;
tenant from `@CurrentTenant`; content reads filtered to the household's `Jurisdiction` and
its ancestors; only `status = PUBLISHED` versions ever leave the API.

**Files:**
- Create: `apps/api/src/regulations/{regulations.controller.ts,regulations.service.ts,regulations.module.ts}`,
  `apps/api/src/regulations/dto/index.ts`,
  `apps/api/src/regulations/tests/{regulations.service.spec.ts,regulations.controller.spec.ts}`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `prisma` singleton from `@pathway/db`; `Tenant.regulations*` columns; the 5
  content models; `AuthUserGuard`, `CapabilityGuard`, `RequireCapability`, `CurrentTenant`.
- Produces: `GET|PATCH /family/regulations/jurisdiction`,
  `GET /family/regulations/requirements`, `GET /family/regulations/requirements/:id`,
  `GET /family/regulations/updates`, `GET /family/regulations/updates/:id`; and
  `RegulationsService.getHouseholdScope(tenantId)` + the shared source-provenance
  projection consumed by 09c.

- [ ] **Step 1: Read the module you are copying**

  Run: `cat apps/api/src/family-planner/family-planner.controller.ts apps/api/src/family-planner/family-planner.service.ts apps/api/src/family-planner/dto/index.ts apps/api/src/family-planner/family-planner.module.ts`

  Copy the shape, not an approximation: `@Controller` + `@UseGuards(AuthUserGuard, CapabilityGuard)`,
  per-route `@RequireCapability`, `@Body() body: unknown` with private
  `parse`/`parseId`/`actorId` helpers, `.strict()` zod schemas in `dto/index.ts`, explicit
  `select` projection consts in the service, `prisma` imported as a singleton (never an
  injected `PrismaService`), module importing `CommonModule, AuthModule, PlatformModule`.

- [ ] **Step 2: Define the jurisdiction scope resolution**

  Everything in 09b and 09c hangs off one private helper.

```ts
type HouseholdScope = {
  nationId: string | null;
  localAuthorityId: string | null;
  jurisdictionIds: string[];  // nation + ancestors + local authority, or [] when unset
  hasLocation: boolean;
  localOverlayAvailable: boolean; // localAuthorityId set AND that Jurisdiction.contentStatus === 'PUBLISHED'
};

async getHouseholdScope(tenantId: string): Promise<HouseholdScope>
```

  Reads `Tenant.regulationsJurisdictionId` / `regulationsLocalAuthorityId` via
  `findUniqueOrThrow` on the tenant's own id (the `household-setup.service.ts:19` pattern),
  then walks `parentJurisdictionId` upward. When `hasLocation` is false, **every** list
  endpoint returns an empty collection and the DTO carries `state: "no_location"` — §17's
  `Choose your nation to see relevant official information.` is Plan 10's copy, not this
  API's. Never throw for a missing location; it is a normal first-run state.

  `localOverlayAvailable: false` with a set local authority is §17's "no verified local
  overlay" case. The API distinguishes these three states — no location / national only /
  national + verified overlay — because the UI must never imply that no local process
  exists.

- [ ] **Step 3: Write the DTOs**

```ts
export const setJurisdictionSchema = z.object({
  jurisdictionId: uuid,                        // must be level NATION
  localAuthorityId: uuid.nullish(),            // must be level LOCAL_AUTHORITY under that nation
}).strict();

export const listRequirementsQuerySchema = z.object({
  status: z.enum(["NOT_REVIEWED", "IN_PROGRESS", "PREPARED", "NEEDS_REVIEW"]).optional(),
  childId: uuid.optional(),
}).strict();

export const listUpdatesQuerySchema = z.object({
  since: z.coerce.date().optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();
```

- [ ] **Step 4: Write the source-provenance projection (shared, used by both sub-plans)**

  §6.2 requires every requirement and update to display issuing body, jurisdiction, source
  title and link, publication/effective date, last verified date and verification state.
  That is one projection, defined once:

```ts
const sourceProvenanceSelect = {
  id: true, title: true, canonicalUrl: true, sourceType: true,
  publishedAt: true, effectiveAt: true, lastVerifiedAt: true,
  verificationState: true, reviewWindowDays: true,
  authority: { select: { id: true, name: true, authorityType: true, officialDomain: true,
                          jurisdiction: { select: { id: true, name: true, level: true } } } },
} as const;

// Derived, never stored: a source is stale when lastVerifiedAt is null, or older than
// reviewWindowDays, or verificationState is NEEDS_REVERIFICATION/UNAVAILABLE/WITHDRAWN.
function isSourceStale(source): boolean
```

  Every requirement/update DTO carries `source` plus a boolean `sourceStale`. §17 and
  `acceptance-criteria.md:66` require the UI to de-emphasise a stale summary and promote
  the official link; the API supplies the fact, the UI makes the call. With the shipped
  seed, `lastVerifiedAt` is `NULL` everywhere, so `sourceStale` is `true` for every source —
  correct and intended.

- [ ] **Step 5: Implement the reads**

  - `GET /requirements` —
    `prisma.requirement.findMany({ where: { jurisdictionId: { in: scope.jurisdictionIds } }, select: { ..., versions: { where: { status: "PUBLISHED" }, orderBy: { versionNumber: "desc" }, take: 1, select: {...} } } })`.
    Only the latest published version is exposed; drafts and in-review versions must never
    leave the API. Requirements whose latest published version does not exist are dropped.
    Household preparedness state is joined in by 09c — in 09b the field is present and
    `null`.
  - `GET /requirements/:id` — `findFirst({ where: { id, jurisdictionId: { in: scope.jurisdictionIds } } })` +
    `NotFoundException`. Jurisdiction scoping in the `where` clause is what makes
    England/Wales/Scotland/NI distinct scopes (`acceptance-criteria.md:57`); a requirement
    from another nation must 404, not render.
  - `GET /updates` —
    `prisma.requirementVersion.findMany({ where: { status: "PUBLISHED", requirement: { jurisdictionId: { in: scope.jurisdictionIds } }, publishedAt: { not: null, gte: since } }, orderBy: [{ impactLevel: "desc" }, { effectiveFrom: "asc" }, { publishedAt: "desc" }] })`.
    §9.8: ordered by impact then effective date then publication date, never engagement.
  - `GET /updates/:id` — same scoping + `NotFoundException`.
  - `PATCH /jurisdiction` — validates that `jurisdictionId` is `level: NATION` and that
    `localAuthorityId` (when present) is `level: LOCAL_AUTHORITY` with
    `parentJurisdictionId === jurisdictionId`; `BadRequestException` otherwise. Sets the
    three `Tenant` columns.

  **Location-change consequences are deliberately deferred to 09c.** §8.3 requires
  archiving prior preparedness state on a nation change; `HouseholdRequirement.archivedAt`
  exists for it but nothing writes `HouseholdRequirement` until 09c. In 09b, a jurisdiction
  change writes only `Tenant`. 09c Step 5 closes this. If 09b ships alone for any length of
  time, this is a known incomplete behaviour — record it in `PROGRESS.md`.

- [ ] **Step 6: Register the module**

  Add `RegulationsModule` to `apps/api/src/app.module.ts` imports, alongside
  `FamilyPlannerModule`.

- [ ] **Step 7: Tests**

  Service spec (`regulations.service.spec.ts`): hand-rolled `jest.mock("@pathway/db")` with
  a `jest.fn()` per delegate **declared before importing the subject**; instantiate
  directly with `new RegulationsService()`; assert `expect.objectContaining` on prisma call
  args. Cases: no location returns empty + `state: "no_location"`; scope includes
  ancestors; only `status: "PUBLISHED"` versions requested; cross-jurisdiction requirement
  id → `NotFoundException`; `sourceStale` true when `lastVerifiedAt` is null and when it is
  older than `reviewWindowDays`; local authority set but `contentStatus !== 'PUBLISHED'` →
  `localOverlayAvailable: false`.

  Controller spec: `Test.createTestingModule` with `.overrideGuard(AuthUserGuard)` and
  `.overrideGuard(CapabilityGuard)`; methods invoked directly, no supertest. Cases per
  route: happy path, missing required field, **unknown field rejected** (proves
  `.strict()`), non-uuid route param, missing `authUserId`.

  **Gotcha:** non-`async` controller methods throw synchronously, so
  `expect(...).rejects` silently passes. Use
  `expect(() => controller.x(...)).toThrow(BadRequestException)` for every synchronous
  validation case.

  Run: `pnpm --filter @pathway/api test:unit -- regulations`

  **Unit-only. No RLS e2e in 09b** — every table it reads is global content with no tenant
  boundary to prove, and the tenant-owned boundary was proven in 09a. Duplicating it here
  would be ceremony.

**PR handoff block:**
```text
Approved screens: none (backend for regulations-jurisdiction, regulations-requirements,
  regulations-requirement-detail, regulations-updates, regulations-update-detail)
Owning phase: Phase 7, PR H6b
Production paths: apps/api/src/regulations/{regulations.controller.ts,
  regulations.service.ts,regulations.module.ts,dto/index.ts}, apps/api/src/app.module.ts
Data and permission boundary: Tenant from @CurrentTenant only; never a path param or body
  field. family.regulations.read on all reads, family.regulations.write on
  PATCH /jurisdiction. Content reads scoped to the household's Jurisdiction and its
  ancestors; only RequirementVersion.status = PUBLISHED is ever returned. Drafts and
  in-review versions are unreachable through this API.
States covered: loading (n/a, API), empty (no published content, and no household
  location - both first-class, both return 200 with an empty collection),
  validation/error (BadRequestException from zod), permission denied (CapabilityGuard),
  success. Offline/retry is the client's concern (Plan 10).
Validation: pnpm --filter @pathway/api test:unit -- regulations; pnpm -r typecheck,
  pnpm -r lint
```

---

# Sub-plan 09c: Household preparedness, evidence links, correspondence and overview

**Approved screens:** none (backend for `regulations-overview`, `regulations-evidence`,
`regulations-correspondence`, `regulations-correspondence-detail`,
`regulations-correspondence-add`, and the preparedness controls on
`regulations-requirement-detail`).

**Data and permission boundary:** all three tenant-owned tables; every write asserts child
ownership and actor membership; evidence is linked by reference, never copied.

**Files:**
- Create: `apps/api/src/regulations/regulations-household.service.ts`,
  `apps/api/src/regulations/tests/regulations-household.service.spec.ts`
- Modify: `apps/api/src/regulations/{regulations.controller.ts,regulations.module.ts,dto/index.ts,tests/regulations.controller.spec.ts}`

**Interfaces:**
- Consumes: `RegulationsService.getHouseholdScope()` and the source-provenance projection
  from 09b; `prisma.{householdRequirement,evidenceLink,correspondence,evidence,child}`.
- Produces: `PATCH /requirements/:id/preparedness`, `GET /evidence`,
  `POST /evidence-links`, `POST /correspondence`, `PATCH /correspondence/:id`,
  `GET /overview`.

- [ ] **Step 1: Child authorisation — reuse, do not reinvent**

  `acceptance-criteria.md:62` requires correspondence and evidence to be tenant- **and
  child**-authorised. The repo has exactly one guardian-child check:
  `ChildrenService.assertCanEditChild(childId, tenantId, userId, isSiteAdmin)`
  (`apps/api/src/children/children.service.ts:338-356`), and the `isSiteAdmin` flag is
  derived in the controller from the request's site-role context
  (`apps/api/src/children/children.controller.ts:89-90`).

  Reuse it. Import `ChildrenModule`/`ChildrenService` into `RegulationsModule` rather than
  writing a second guardian check — a divergent copy of an authorisation rule is how
  cross-tenant incidents happen. Every write that carries a `childId` calls it first.

  If `ChildrenService` cannot be imported without a circular dependency, extract
  `assertCanEditChild` into `apps/api/src/children/child-access.ts` and have both services
  call it. Do **not** duplicate the body.

- [ ] **Step 2: `PATCH /requirements/:id/preparedness`**

```ts
export const updatePreparednessSchema = z.object({
  status: z.enum(["NOT_REVIEWED", "IN_PROGRESS", "PREPARED", "NEEDS_REVIEW"]),
  childId: uuid.nullish(),
  notes: z.string().trim().max(10_000).nullish(),
  deadlineAt: z.coerce.date().nullish(),
  acknowledgedVersionId: uuid.nullish(),
}).strict();
```

  `:id` is the **`Requirement` id**, not the `HouseholdRequirement` id — the mobile client
  holds requirement ids from `GET /requirements` and may never have created a household
  row. The handler therefore upserts: verify the requirement is inside the household's
  jurisdiction scope (else `NotFoundException`), verify `childId` belongs to the tenant and
  the actor may edit that child, then `findFirst` on
  `(tenantId, requirementId, childId, archivedAt: null)` and create-or-update. The partial
  unique indexes from 09a make a concurrent double-create fail loudly rather than silently
  fork.

  `acknowledgedVersionId` must be a `PUBLISHED` version of that same requirement, otherwise
  `BadRequestException`. §9.9: a parent may acknowledge an update without marking anything
  prepared, so acknowledgement and status are independent fields on the same PATCH.

- [ ] **Step 3: `GET /evidence` and `POST /evidence-links`**

  `GET /evidence` is a regulations-focused **view over the existing `Evidence` table**
  (§9.6: "It does not copy files from Progress"). Query
  `prisma.evidence.findMany({ where: { tenantId, childId? } })` with its `EvidenceLink`
  rows included so each item reports whether it is linked and to what. Filters: `childId`,
  `householdRequirementId`, `linked: boolean`, `from`/`to` on `capturedAt`. **Never** return
  `storageKey` — `acceptance-criteria.md:33` forbids exposing a storage key or permanent
  public URL. Signed-URL issuance is not part of this plan; `GET /evidence` returns
  metadata only.

  `POST /evidence-links` takes `{ evidenceId, householdRequirementId?, correspondenceId?, purpose }`
  with `.strict()` and a zod `.refine()` mirroring the DB CHECK (exactly one target).
  Verify the `Evidence` row exists **in this tenant** with
  `findFirst({ where: { id, tenantId } })` before creating; the composite FK is the
  backstop, not the check.

  §9.6's seven evidence categories are **not** modelled. `Evidence` has no category column,
  adding one is a Progress-domain change, and `EvidenceLinkPurpose` already covers what
  regulations needs. Flag for Plan 10: the vault's category filter cannot be built without
  either an `Evidence.category` column or a decision to drop it.

- [ ] **Step 4: `POST /correspondence` and `PATCH /correspondence/:id`**

```ts
export const createCorrespondenceSchema = z.object({
  senderName: z.string().trim().min(1).max(240),
  issuingAuthorityId: uuid.nullish(),
  subject: z.string().trim().min(1).max(240),
  receivedAt: z.coerce.date(),
  childId: uuid.nullish(),
  responseDueAt: z.coerce.date().nullish(),
  originalEvidenceId: uuid.nullish(),
  taskId: uuid.nullish(),
  notes: z.string().trim().max(10_000).nullish(),
}).strict();

export const updateCorrespondenceSchema = createCorrespondenceSchema
  .partial()
  .extend({ status: z.enum(["RECEIVED","REVIEWING","PREPARING_RESPONSE","RESPONDED","CLOSED"]).optional(),
            respondedAt: z.coerce.date().nullish() })
  .strict();
```

  §9.10: "Uploading correspondence may suggest fields, but the parent confirms all
  extracted information before it is saved." There is no extraction in this plan — the API
  only accepts parent-confirmed values. No OCR, no auto-population, no inference.

  Setting `status` to `RESPONDED` or `CLOSED` without `respondedAt` must fail at the DTO
  layer with a clear message, not bounce off the DB CHECK as a 500. Validate in zod **and**
  keep the CHECK.

- [ ] **Step 5: Location-change archival (§8.3) — close 09b's gap**

  Extend `PATCH /jurisdiction` (built in 09b): when `regulationsJurisdictionId` changes to
  a different nation, set `archivedAt = now()` on every active `HouseholdRequirement` for
  that tenant inside a single transaction with the `Tenant` update. Evidence, evidence
  links and correspondence are **never** touched — §8.3 requires them preserved. The
  response reports how many preparedness states were archived so the UI can explain the
  consequence before the user confirms (`acceptance-criteria.md:35`).

  §8.3 also asks for the change to be recorded in the household audit history.
  `AuditEntityType` (`schema.prisma`) has no regulations member; adding one is a follow-up
  (an `ALTER TYPE ... ADD VALUE` in its own migration, since Postgres cannot use a
  newly-added enum value in the same transaction that added it, and Prisma runs each
  migration in a transaction). Do not fabricate an audit write against an unrelated entity
  type in this plan — `regulationsJurisdictionSetAt` plus the archived rows are the durable
  record for now.

- [ ] **Step 6: `GET /overview` — build it last**

  Composes 09b's scope + content reads with this sub-plan's household reads into §9.3's
  panel. No new query patterns; a single service method that awaits the pieces.

```ts
type OverviewDto = {
  state: "no_location" | "ready";
  jurisdiction: { nation: {...} | null; localAuthority: {...} | null; localOverlayAvailable: boolean };
  requirementCounts: Record<"NOT_REVIEWED"|"IN_PROGRESS"|"PREPARED"|"NEEDS_REVIEW", number>;
  evidenceCoverage: { linkedRequirements: number; totalRequirements: number }; // counts, never a score
  latestUpdate: UpdateSummaryDto | null;
  nextDeadline: { correspondenceId: string; subject: string; responseDueAt: string } | null;
  nextAction: { kind: "set_location"|"review_update"|"review_requirement"|"respond"|"none"; targetId: string | null };
};
```

  `evidenceCoverage` is linked/not-linked counts, never a percentage or score (§9.3, §6.1).
  `nextAction.kind` is an enum the client maps to copy — the API returns no user-facing
  strings, so §19's legal-safety copy stays owned by the UI layer and cannot drift into a
  server response. With the shipped empty content set, a configured household gets
  all-zero counts, `latestUpdate: null`, and `nextAction.kind: "none"` — a valid,
  renderable response.

- [ ] **Step 7: Tests**

  Household service spec: same `jest.mock("@pathway/db")` shape as 09b. Cases:
  preparedness upsert creates when absent and updates when present; cross-jurisdiction
  requirement id → `NotFoundException`; `childId` from another tenant → rejected (never a
  leak of the other tenant's data); `acknowledgedVersionId` pointing at a draft or at
  another requirement's version → `BadRequestException`; `evidenceId` from another tenant
  → `NotFoundException`; evidence-link with both/neither target →
  `BadRequestException`; `RESPONDED` without `respondedAt` → `BadRequestException`; nation
  change archives active household requirements and touches neither evidence nor
  correspondence; overview with no location returns `state: "no_location"` and zeroed
  counts; overview with a location but no published content returns `state: "ready"`,
  zeroed counts and `nextAction.kind: "none"`.

  Controller spec additions: per route — happy path, missing required field, **unknown
  field rejected**, non-uuid param, missing `authUserId`.

  Run: `pnpm --filter @pathway/api test:unit -- regulations`

  **Unit-only.** The tenant-isolation guarantees for all three tables were proven at the
  database level in 09a's RLS e2e spec; 09c's negative tests are service-level
  authorisation tests, which is the correct layer for "wrong tenant's childId" and "wrong
  requirement's version". Together they satisfy `acceptance-criteria.md:16` ("API or
  storage boundaries have negative authorisation tests").

**PR handoff block:**
```text
Approved screens: none (backend for regulations-overview, regulations-evidence,
  regulations-correspondence, regulations-correspondence-detail,
  regulations-correspondence-add, and the preparedness controls on
  regulations-requirement-detail)
Owning phase: Phase 7, PR H6c
Production paths: apps/api/src/regulations/regulations-household.service.ts,
  apps/api/src/regulations/{regulations.controller.ts,regulations.module.ts,dto/index.ts}
Data and permission boundary: Tenant from @CurrentTenant; family.regulations.read on
  reads, family.regulations.write on all mutations. Every child-scoped write passes
  ChildrenService.assertCanEditChild (site admin or linked guardian); every referenced
  Evidence/Correspondence/Requirement is re-verified inside the caller's tenant before
  use. Existing Evidence is linked via EvidenceLink and never copied; no storageKey and
  no public URL is returned by any endpoint in this plan.
States covered: loading (n/a, API), empty (no published requirements, no evidence, no
  correspondence - all return 200 with empty collections), validation/error (zod +
  service checks), permission denied (CapabilityGuard + assertCanEditChild), success.
  Offline/retry is the client's concern (Plan 10).
Validation: pnpm --filter @pathway/api test:unit -- regulations; pnpm -r typecheck,
  pnpm -r lint, pnpm test:unit
```

---

## Spec §13 field mapping, with every interpretation flagged

| §13 field | Column | Note |
| --- | --- | --- |
| Jurisdiction: `id`, `countryCode`, `subdivisionCode`, `name`, `level`, `parentJurisdictionId`, `contentStatus` | direct | `contentStatus` values are unspecified in the spec — **invented**: `NOT_CONFIGURED/IN_PREPARATION/PUBLISHED/WITHDRAWN`. `subdivisionCode` is nullable at COUNTRY level. |
| RegulatoryAuthority: all 5 fields | direct | `authorityType` values **invented**. |
| RegulatorySource: all 9 fields | direct | **Added**: `lastVerifiedAt`, `verifiedByUserId`, `reviewWindowDays` (§6.2, §12, locked decision 2). `lastCheckedAt` ≠ `lastVerifiedAt` deliberately. |
| "stable requirement identity" | `Requirement.id` (+ `jurisdictionId`, `sortOrder`) | |
| "jurisdiction and applicability rule" | `Requirement.jurisdictionId` + `RequirementVersion.appliesTo` + `applicabilityNote` | **Interpretation:** "rule" is modelled as an enum + free text, not an executable rule engine. §22's acceptance criteria never require evaluating an applicability expression. |
| "reviewed title and summary" | `RequirementVersion.title`, `summary` | |
| "source references" (plural) | `RequirementVersion.primarySourceId` (**NOT NULL**) | **Deliberate narrowing to one.** A NOT NULL FK database-enforces "every published requirement has at least one authoritative source" (`acceptance-criteria.md:59`); a join table can be empty and cannot. The NI case (DfE + nidirect) is two sources under one authority, reachable from the authority. Add `RequirementVersionSource` later if content ops needs multiple citations per version; the NOT NULL primary stays. |
| "effective interval" | `effectiveFrom`, `effectiveTo` (+ CHECK) | |
| "preparation suggestions" | `preparationSuggestions String[]` | §9.5's "How you can prepare". |
| "reviewer and approval timestamps" | `reviewedByUserId`, `reviewedAt`, `secondReviewerUserId`, `secondReviewedAt`, `publishedAt` | Second reviewer is §12 step 7's high-impact requirement, enforced by CHECK. |
| HouseholdRequirement: `tenantId`, `requirementId`, `childId?` | direct | |
| "parent-controlled status" | `status` | Exactly §6.1's four words. |
| "notes" / "acknowledged version" / "optional deadline" | `notes`, `acknowledgedVersionId`, `deadlineAt` | |
| "audit timestamps" | `createdAt`, `updatedAt`, `updatedByUserId` | |
| — | `archivedAt`, `jurisdictionId` | **Added** for §8.3's "archives, but does not delete, prior preparedness states". |
| EvidenceLink: `evidenceId`, `householdRequirementId`\|`correspondenceId`, purpose, linked by/at | direct + `tenantId` | `tenantId` **added**: mandatory for the RLS policy and the composite FKs. XOR enforced by CHECK. |
| Correspondence: "tenant and optional child" | `tenantId`, `childId` | |
| "sender" | `senderName` + `issuingAuthorityId?` | **Interpretation:** §9.10 lists "sender **and** issuing body" as separate things — free text for the named officer, optional FK for the body. |
| "received and response dates" | `receivedAt`, `responseDueAt`, `respondedAt` | |
| "status" | `status` | §9.10's five values exactly. |
| "original evidence asset" | `originalEvidenceId` | **Interpretation:** a direct FK rather than an `EvidenceLink` row, because there is exactly one original and it is part of the record's identity. Attachments and sent-response evidence go through `EvidenceLink`. **Risk:** two paths to associate evidence with a correspondence; 09c must never create an `EvidenceLink` duplicating the original. |
| "notes and task references" (plural) | `notes`, `taskId?` | **Deliberate narrowing to one task.** Requires adding `@@unique([id, tenantId])` to `Task`. |

## Deliberately NOT built in Plan 09

| Not built | Owner |
| --- | --- |
| `EvidencePack`, `EvidencePackItem`, `EvidencePackShare` and the 4 pack/share endpoints | H7 / Plan 10 |
| All 17 `regulations-*` screens, all copy, all `mobileTokens` work | H7 / Plan 10 |
| Signed-URL / file-download issuance for evidence | H7 / Plan 10 |
| Malware scanning, quarantine and controlled derivatives (§15, `acceptance-criteria.md:64`) | H7 prerequisite — see Risk 2 |
| Redaction derivatives | H7 / Plan 10 |
| Content-review APIs, tooling, staffing, SLA and the `PlatformContentReviewer` role/capability | deferred plan (locked decision 2); `product-contract.md:155` |
| Automated source monitoring, change detection, reverification job | later plan; `apps/workers/src/retention/` is the closest precedent — see Risk 7 |
| Notifications of any kind (§16) | later plan; no notification delivery infrastructure exists |
| Analytics events (§20) | later plan |
| Postcode → local-authority resolution (§9.2 field 3) | H7 / Plan 10 — no geocoding service exists anywhere in the repo |
| Local-authority `Jurisdiction` rows and any local overlay content | content ops; the model supports `level: LOCAL_AUTHORITY` today, zero rows ship |
| Any published `Requirement` / `RequirementVersion` row | content ops (locked decision 3) |
| Per-child guardian scoping of *reads* (§11 "Adult Guardian sees only linked children") | see Risk 4 |
| `AuditEntityType` values for regulations | see 09c Step 5 |
| Retention schedules and legal-hold handling (§15) | later plan; `apps/workers/src/retention/` exists but has no regulations config |
| Evidence categories (§9.6's seven) | needs an `Evidence.category` column — Progress-domain change, H7 decision |

## Risks, ambiguities and spec-vs-codebase contradictions

**Risk 1 — no malware scanning exists anywhere.** `acceptance-criteria.md:64` ("Files
remain unavailable while malware scanning is pending or failed") and §15 are unmet and
cannot be met by this plan: grep for `malware|clamav|quarantine|virus` returns nothing in
the repo. It primarily bites on pack export and sharing, which are out of scope here —
`POST /evidence-links` links an already-stored `Evidence` row and exposes no bytes, and
`GET /evidence` returns metadata without `storageKey`. **This is a hard H7/Plan 10
prerequisite**: no pack may include a file, and no share may serve one, until a scan state
exists.

**Risk 2 — after Plan 09 ships there is no supported way to publish a requirement.** This
is the intended consequence of deferring content review (locked decision 3), but it must be
written down: the only path to a `PUBLISHED` `RequirementVersion` is direct database access
satisfying the CHECK constraints. Content ops has no tool until the review plan lands, and
every household API legitimately returns an empty requirement set. That empty state is a
first-class supported state — Plan 10 must implement it as such (§17's "No location" /
no-content copy), not as a loading or error state.

**Risk 3 — §11's role model is finer-grained than two capabilities.** Adult Guardian "sees
only linked children", Tutor/Mentor has "no Regulations & Evidence access by default",
Household Owner sees everything. `family.regulations.read`/`write` correctly gives Tutors
nothing, and `assertCanEditChild` correctly restricts child-scoped *writes* to linked
guardians — but list *reads* (`GET /requirements?childId=`, `GET /evidence`) are
tenant-scoped, not guardian-scoped. That matches how `family-planner` and `learning`
already behave in this codebase (neither filters by guardian link), so Plan 09 is
consistent rather than newly permissive. Making regulations reads guardian-filtered while
its siblings are not would be an inconsistency worth deciding deliberately — flagging
rather than silently choosing. Splitting `family.regulations.correspondence.*` out as a
third/fourth capability is the upgrade path if a household ever needs to grant requirement
access without letter access; §11 does not ask for it today.

**Risk 4 — partial unique index drift.** Prisma cannot express partial indexes. The repo
has precedent with no drift note in `PROGRESS.md`, so this most likely works — but "most
likely" is how plans in this repo have gone wrong before. 09a Step 12 must confirm it
explicitly; the named fallback is service-layer uniqueness.

**Risk 5 — `apps/workers/` exists but is not a scheduler.** Contrary to an earlier belief
recorded in the ledger, `apps/workers/src/{av30,retention,guest-pass,learning}/` is real —
but it is CLI-invoked (`retention:run`, `compute:av30`, …) and driven by an external
scheduler; there is no bullmq, no agenda, no `@nestjs/schedule`.
`RegulatorySource.reviewWindowDays` and `lastVerifiedAt` are therefore evaluated **lazily
at read time** (`isSourceStale`), not by a background sweep. A future reverification job
should follow `apps/workers/src/retention/` (`*.service.ts` + `*.job.ts` +
`run-*.cli.ts` + a package script). Nothing in Plan 09 depends on a job running.

**Risk 6 — global content tables under FORCE RLS have no runtime writer.**
`PermissionDefinition` proves the pattern works (`syncPermissionDefinitions` writes it
through the ordinary app connection), which implies the app's database role bypasses RLS.
Plan 09 never writes content at runtime, so this is inert here — but the future
content-review API **must** verify its connection role can write these tables before
assuming it can, and the seed INSERTs in 09a are ordered before
`ENABLE ROW LEVEL SECURITY` precisely so the migration cannot trip over this.

**Risk 7 — two existing models are modified.** `Evidence` and `Task` each gain
`@@unique([id, tenantId])`. Both are additive index creations with no column or data
change, and both tables are small — but they are shared with the ACE vertical, so the
drift run in 09a Step 12 must confirm no other index is disturbed.

**Risk 8 — no DB-level uniqueness on `Jurisdiction`.** `(countryCode, subdivisionCode)` is
indexed but not unique, because `subdivisionCode IS NULL` at COUNTRY level makes a plain
unique constraint useless in Postgres, and `NULLS NOT DISTINCT` (PG15+) is not expressible
in Prisma and would show as drift. Acceptable while the only writer is a fixed-UUID
`ON CONFLICT DO NOTHING` migration. The content-review plan that adds a jurisdiction admin
API must add the constraint at that point.

## Self-review notes (writing-plans skill, run against this plan)

- Every endpoint in the "Endpoint scope" section is traced to either spec §14
  (`regulations-and-evidence.md:657-671`) or a locked decision explaining the addition.
  The 4 pack/share endpoints are explicitly listed as out of scope with their owner.
- Every §13 data-model field has a row in the field-mapping table; every addition or
  narrowing is flagged as an interpretation, not presented as spec text.
- No field, enum value or DTO key in this plan contains `compliant`, `violation`, `legal`,
  `satisfied` or `guaranteed`. `HouseholdPreparednessStatus` is exactly
  `NOT_REVIEWED | IN_PROGRESS | PREPARED | NEEDS_REVIEW`.
- All three PR handoff blocks state approved screens (or the non-visual contract),
  owning phase/slice, production paths, data/permission boundary, states covered and
  validation commands, matching `implementation-map.md:155-185`.
- File paths and line numbers cited in this plan were checked against the actual
  repository state at the time of writing (2026-08-10), not assumed from memory or from
  the original 914-line spec's own citations.
