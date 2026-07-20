# Phase 4 — Detailed build plan (learning module: the first real module)

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.3.0` (tag `v2.3.0`)
**Depends on:** Phase 1 (`Module` enum + capability maps — merged in PRs #176–183), Phase 2 (`CapabilityGuard` + capability-driven nav — merged in PRs #185–190), Phase 3 (module purchase/activation — merged in PRs #191–198, `master` at `2.2.1`).
**Blocks:** Phase 7 (NexSteps Home reuses this module as-is for home-education families).
**Companion to:** [`04-learning-module.md`](04-learning-module.md) — that doc is the summary; this one pins down the exact schema deltas, migration ordering, controller and service shapes, storage keys, and test bodies so a build session can execute PR-by-PR with no invention.

---

## Purpose

Ship the platform's first real module — Learning — as both a working feature and the reference implementation every module after it copies. Reuse the CEE vertical's already-designed Learning domain model ([`docs/cee-vertical/03-domain-model.md:68-170`](../cee-vertical/03-domain-model.md)) rather than redesigning it.

This phase builds the **data model, capabilities, API, worker, and a staff/admin surface**. It does **not** build the parent-facing household view — that is Phase 7's family surface, which consumes this module's capabilities and data rather than duplicating them.

Phase 2 shipped `CapabilityGuard` with a deliberate note that its first real consumer would be Phase 4 ([`02a-phase2-build-plan.md:62`](02a-phase2-build-plan.md)). Phase 2 also shipped a nav item `capability` field that no nav item sets. **This phase is where both mechanisms leave their unit tests and meet production.** That is the real deliverable; the Learning feature is what proves it.

---

## The findings that change this phase

The summary doc was written before the code was ground-truthed. Four of its claims do not survive contact with the repo.

### Finding 1 — `DownloadToken` is not reusable

The summary doc reuses `DownloadToken` for report-bundle downloads, "rather than inventing new download-security logic", and marks it *confirmed present*. It is present, and it is **`Lead`-scoped** ([`schema.prisma:1111-1123`](../../packages/db/prisma/schema.prisma)):

```prisma
model DownloadToken {
  id        String    @id @default(uuid())
  leadId    String
  lead      Lead      @relation(fields: [leadId], references: [id], onDelete: Cascade)
  tokenHash String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
  ...
}
```

`leadId` is required, and the row cascades away with its `Lead`. This is the marketing-funnel lead-magnet token, not a general download facility: `prisma.downloadToken` is touched in exactly one file — [`apps/api/src/leads/leads.service.ts`](../../apps/api/src/leads/leads.service.ts) — and only ever via `create` and `findFirst`. (Line numbers deliberately omitted for this file: a second lead magnet is being added to it in parallel work as of writing, which adds another `downloadToken.create`. Verify with `grep -rn 'downloadToken' apps packages --include='*.ts'` rather than trusting a pinned line. That parallel work reinforces the finding — two lead magnets now share the same `Lead`-scoped token.)

Two further facts follow. **`DownloadToken.usedAt` is never written** — there is no `downloadToken.update` call anywhere, so the column grants no single-use semantics. (Do not be misled by a repo-wide `usedAt` grep: the many hits in `invites.service.ts` are `Invite.usedAt` at `schema.prisma:512`, a different model.) And re-download until expiry is **deliberate**, per the `// V1: Allow re-download until expiry` comment in the redeem path.

There is also **no signed-URL helper anywhere in this repo.** `grep -rn "createSignedUrl\|signedUrl"` across `apps/` and `packages/` returns nothing storage-related. Every private file today is proxied: the API downloads server-side and streams the bytes through an authenticated controller ([`children.service.ts:95-129`](../../apps/api/src/children/children.service.ts), [`lessons.service.ts:189-217`](../../apps/api/src/lessons/lessons.service.ts)).

**So "reuse the existing download mechanism" is right, but the existing mechanism is the authenticated proxy, not `DownloadToken`.** See Decision A.

### Finding 2 — the worker cannot render a report

`apps/workers` has exactly three runtime dependencies: `@pathway/db`, `@pathway/types`, `dotenv`. No React. No PDF library. No zip library.

- `@react-pdf/renderer` exists in the repo, in **`apps/web` only** ([`apps/web/package.json:19`](../../apps/web/package.json)), and is used to render-and-stream the toolkit PDF, never to persist one.
- `archiver`, `jszip`, `adm-zip` exist **nowhere**. Even `node:zlib` is unused. Node's zlib gives gzip, not a multi-file `.zip` container.

A PDF-and-zip bundle is therefore not "write a worker script", it is "add a rendering stack to a package that has none". See Decision B.

### Finding 3 — without price codes, Learning can never activate in production

The summary doc does not mention billing. Phase 3 shipped a **generic** activation loop over `pendingOrder.selectedModules` ([`webhook.controller.ts:285-317`](../../apps/api/src/billing/webhook.controller.ts)), so `Module.LEARNING` needs no new webhook code at all. But checkout rejects any selected module with no `STRIPE_PRICE_MAP` entry, and the code space is a closed union ([`billing-provider.config.ts:14-32`](../../apps/api/src/billing/billing-provider.config.ts) + the allow-list at `:103-104`).

Meanwhile the only other way to write an `OrgModule` row is `POST /platform/modules/toggle`, which is **server-rejected in production**.

So without ~4 lines of price codes, this phase's own acceptance criterion — *"the nav entry is visible only to orgs with the Learning module active"* — is unreachable outside a dev environment. See Decision C.

### Finding 4 — the summary doc's migration order is unsafe

The summary doc lands the four tables in PR 4.1 and the `Module.LEARNING` enum value in PR 4.2, and says the enum value and capability map "revert together (same migration)". They cannot be in the same migration, and the enum cannot come second.

Postgres will not let a value added by `ALTER TYPE ... ADD VALUE` be *used* in the transaction that added it, and Prisma wraps each migration file in a transaction. The repo already hit this and solved it: enums in `20260718010724_add_vertical_module_enums`, tables in `20260718071741_add_org_vertical_and_module`. **Two migrations, enum first.** This phase follows the same split, which is why the PRs below are renumbered.

---

## Decisions locked (grounded)

**A. Report bundles download through an authenticated API proxy. No token model, no `downloadTokenId` column.**
A capability-guarded `GET /learning/report-bundles/:id/download` calls `storage.downloadObject()` and streams the bytes, exactly as `GET /children/:id/photo` and the lesson-resource route already do. This is strictly less new security surface than the summary doc's plan, because it adds none: authorization is the guard chain that already protects every other endpoint. Shareable links for non-authenticated recipients are **out of scope** and flagged as an open decision.

**B. The first-cut bundle is a CSV, and adds no dependency to any package.**
`ReportBundle` generation queries `LearningLog` for the period and writes a CSV — built with string joins, uploaded as `text/csv`. This proves the entire pipeline end to end: query → render → store → status transitions → authenticated download. The rendering step is the *only* part a PDF would change, so it sits behind a single service method and is swapped later without touching the model, the states, the storage key, or the download route. Shipping the pipeline first and the pretty output second is the smaller risk in both directions.

**C. `MODULE_LEARNING_MONTHLY` / `_YEARLY` land in this phase (PR 4.6).**
Four lines across two locations in one file. Everything downstream is already generic. The **operational half** — creating the Stripe Product and two Prices and mapping them per environment — needs commercial sign-off on a price and is not something a code PR can complete (Phase 0 D9). It does not block: an unmapped code simply rejects checkout for that module.

**D. Ships as `2.3.0`, not the summary doc's `2.2.5`.**
Grounded, not inferred: the phase table in [`README.md:71`](README.md) — the index of record for this doc set — **already lists Phase 4 as `2.3.0` / `v2.3.0`**. The `2.2.5` in the summary doc's header is stale. This is consistent with the policy anyway: `master` is at `2.2.1`, Learning is user-facing, and minor bumps are reserved for user-facing features (Phase 3 took `2.2.1` precisely because it was API-only).

Note for whoever picks up Phase 5 onward: the same drift affects them in the other direction. `README.md` lists 5→`2.4.0`, 6→`2.5.0`, 7→`2.6.0`, while each phase doc's own header still claims `2.5.0`/`2.6.0`/`2.7.0`. Out of scope here; flagged so it is not rediscovered four times.

**E. All four models carry `tenantId`, and join the existing RLS policy array.**
The CEE domain model specifies `tenantId` on all four, and this repo already enforces tenant RLS ([`20251201173000_core_tenant_rls/migration.sql:46`](../../packages/db/prisma/migrations/20251201173000_core_tenant_rls/migration.sql) applies a generic policy to every table in a hardcoded array). README D2 excludes CEE's *broader* RLS design — the ABAC layer, network-level grants — not this repo's existing enforcement.

The precedent to *not* copy is `ChildNote`/`Concern`/`Attendance`, which are child-scoped with no `tenantId` and are consequently absent from that array. A direct `tenantId` column joins the generic policy for free; omitting it means hand-writing an `EXISTS (SELECT 1 FROM "Child" …)` policy per table. One column beats four bespoke policies, and these tables hold children's learning records.

**F. No `Merit`.** Confirmed **absent**, not merely unused: `Merit`, `MeritType`, `LearningLog`, `ReportBundle` return zero grep hits repo-wide. Matches README D2. The acceptance criterion is that it stays absent.

**G. The worker gets a ~25-line local upload helper, not a cross-package refactor.**
`SupabaseStorageService` lives in `apps/api` and imports `@nestjs/common` for `@Injectable` and `Logger` — its only Nest usage; it reads `process.env` directly and is constructed with `new` in several places. `apps/workers` does not depend on Nest, and one app cannot import another's source. The options are: duplicate a single `POST` against `${SUPABASE_URL}/storage/v1/object/...`, or lift the service into a new `packages/storage`. This phase takes the duplicate, because the lift touches working API code to serve one new caller. **If a third consumer appears, lift it** — noted as an open decision, not pre-built.

**H. Versioning:** Phase 4 ends with a bump-to-`2.3.0` PR (root `package.json` + `packages/util/src/version.ts`, currently `2.2.1`).

---

## Grounded references (read once before starting)

| Purpose | Real file / anchor |
|---|---|
| `Module` enum to extend (8 values today) | `packages/db/prisma/schema.prisma:131-140` |
| `ModuleStatus` / `OrgModule` (unique `[orgId, module]`) | `schema.prisma:142-146`, `:157-173` |
| `Child` — the FK convention answer: **`tenantId`, never `orgId`** | `schema.prisma:634-673` |
| `Tenant` — every new tenant-scoped model needs a back-relation here | `schema.prisma:320-355` |
| `ChildNote` — template for an authored, child-scoped record; **named relations** for two FKs to `User` | `schema.prisma:928-944` |
| `Lesson` — template for a tenant-scoped record with a file attachment | `schema.prisma:888-909` |
| `DownloadToken` — **`Lead`-scoped, not reusable** (Finding 1) | `schema.prisma:1111-1123` |
| Enum-only migration precedent (do this first) | `packages/db/prisma/migrations/20260718010724_add_vertical_module_enums/migration.sql` |
| Table migration precedent | `migrations/20260718071741_add_org_vertical_and_module/migration.sql` |
| RLS generic-policy table array to extend | `migrations/20251201173000_core_tenant_rls/migration.sql:46-56` |
| RLS hardened-table assertion list | `apps/api/src/tests/rls/pathway-rls.e2e.spec.ts:20` |
| Migration commands | `packages/db/package.json` — `prisma:migrate:dev`, `prisma:migrate:deploy` |
| `MODULE_CAPABILITIES` — `Record<Module, …>`, **compile error** until `LEARNING` is mapped | `packages/platform/src/capability-maps.ts:60-69` |
| Capability completeness test (iterates runtime enum values) | `packages/platform/src/__tests__/capability-maps.spec.ts` |
| `orgHasCapability` — how a capability resolves | `packages/platform/src/capabilities.ts:6-31` |
| `CapabilityGuard` (zero production consumers today) | `apps/api/src/platform/capability.guard.ts:1-41` |
| `RequireCapability` decorator | `apps/api/src/platform/capability.decorator.ts:1-7` |
| `CapabilityGuard` is exported here — `LearningModule` must import `PlatformModule` | `apps/api/src/platform/platform.module.ts:11` |
| Guard unit-test template | `apps/api/src/platform/tests/capability.guard.spec.ts` |
| Metadata-guard pattern **already wired to prod routes** (copy this shape) | `apps/api/src/notes/notes.controller.ts:51,:76` (`SafeguardingGuard`) |
| API module template (controller/service/tests trio) | `apps/api/src/children/` |
| Service spec template (`jest.mock("@pathway/db")`, `new`, no testing module) | `apps/api/src/children/tests/children.service.spec.ts:1-68` |
| zod DTO convention (**not** class-validator) | `apps/api/src/children/dto/create-child.dto.ts` |
| Module registration array | `apps/api/src/app.module.ts` |
| Storage service (upload/download signatures) | `apps/api/src/common/storage/supabase-storage.service.ts` |
| Storage key naming util to extend | `apps/api/src/common/storage/storage-key.util.ts` |
| Private-file proxy pattern (Decision A) | `apps/api/src/children/children.service.ts:95-129` |
| Worker CLI → job → service trio to copy | `apps/workers/src/av30/{compute-av30.cli.ts, compute-av30.job.ts, av30-compute.service.ts}` |
| Worker spec template (module-level prisma mock) | `apps/workers/src/retention/tests/retention.service.spec.ts:1-40` |
| Worker cron template | `.github/workflows/workers-scheduled.yml` |
| CI runs `test:unit` — workers does not define it | `.github/workflows/ci.yml:67`, `apps/workers/package.json` |
| Nav item array + capability filter (no item sets `capability` today) | `apps/admin/app/admin-shell.tsx:38-69`, `:292-301` |
| `hasCapability` filter semantics | `apps/admin/lib/access.ts:141-149` |
| Icon array — 20 entries (0–19), max index used is 19 | `packages/ui/src/components/sidebar-nav.tsx:58-79` |
| Nav test asserting icon uniqueness + coverage | `apps/admin/app/admin-shell.nav.test.ts` |
| Admin page template (client component, no RSC) | `apps/admin/app/lessons/page.tsx` |
| Admin API client conventions | `apps/admin/lib/api-client.ts:571-596` (`buildAuthHeaders`), `:2329-2347` (`fetchChildren`) |
| `AdminModule` union + `MODULE_LABELS` (hand-duplicated enum) | `apps/admin/lib/api-client.ts:472-491` |
| Price code union + allow-list | `apps/api/src/billing/billing-provider.config.ts:14-32`, `:103-104` |
| Generic module activation (needs no changes) | `apps/api/src/billing/webhook.controller.ts:285-317` |

---

## Conventions every PR follows

- **One branch per PR**, prefix `feat/` or `chore/`, lowercase commit subject (commitlint). PRs target `FSS-Ltd/pathway`. No AI attribution in commits or PRs. Stacked in order 4.1 → 4.7.
- **TDD:** the failing test lands in the same PR as the code.
- **No PR both writes a migration and consumes it.** PR 4.1 lands the enum value; PR 4.2 lands the tables; PR 4.3 reads them.
- **zod, not class-validator,** for every DTO in this module. The children/lessons/attendance family uses zod and the global pipes are zod-based; `class-validator` appears only in the billing/invites/signup corner.
- **`prisma` is a module-level singleton import from `@pathway/db`,** never an injected service. That is why specs use `jest.mock("@pathway/db", …)` with per-model mocks and construct services with `new`.
- **Guard order is `@UseGuards(AuthUserGuard, CapabilityGuard)`.** `AuthUserGuard` populates the request context that `CapabilityGuard` reads. Reversed, every request fails.
- **After each code PR:** `graphify update .` (per repo CLAUDE.md gate).

---

## PR ordering (dependency-correct)

| PR | Branch | Scope one-liner |
|---|---|---|
| 4.1 — `Module.LEARNING` + capabilities | `feat/phase4-learning-enum` | enum-only migration + capability map + admin label union |
| 4.2 — Learning schema | `feat/phase4-learning-schema` | four models + `ReportBundleStatus` + RLS policies |
| 4.3 — Learning API module | `feat/phase4-learning-api` | NestJS module; **first production `CapabilityGuard` consumer** |
| 4.4 — Report bundle worker | `feat/phase4-report-bundle-worker` | CSV generator CLI + the `test:unit` CI gap |
| 4.5 — Admin surface | `feat/phase4-learning-admin` | route + **first nav item with a `capability`** |
| 4.6 — Learning price codes | `feat/phase4-learning-price-codes` | `MODULE_LEARNING_{MONTHLY,YEARLY}` |
| 4.7 — Version bump `2.3.0` | `chore/phase4-version-2.3.0` | release |

> Code blocks below are verbatim targets. "Mirror X" means copy an existing file's shape exactly.

---

## PR 4.1 — `Module.LEARNING` + capabilities

**Scope:** add the ninth `Module` value and its capabilities. Ships before any table because of Finding 4, and because adding the enum value is a **compile error in three places** until each is handled — which is the design, not a hazard.

**Migration** (N) — enum-only, its own directory, mirroring `20260718010724`:

```sql
-- AlterEnum
ALTER TYPE "Module" ADD VALUE 'LEARNING';
```

Nothing in this PR creates a table that uses the value, so the added-and-used-in-one-transaction problem never arises.

**`packages/db/prisma/schema.prisma`** (E) — add `LEARNING` to the enum at `:131-140`.

**`packages/platform/src/capability-maps.ts`** (E) — add to `MODULE_CAPABILITIES` (`:60-69`). Naming follows the map's own `domain.action` convention, and the `ADVANCED_REPORTING: ["reporting.advanced"]` precedent that the capability domain need not equal the module name:

```ts
  LEARNING: [
    "learning.log.read",
    "learning.log.write",
    "learning.evidence.read",
    "learning.evidence.write",
    "learning.reports.generate",
  ],
```

**`apps/admin/lib/api-client.ts`** (E) — two edits, both compile errors until made. `AdminModule` (`:472-480`) is a **hand-maintained duplicate** of the Prisma enum with nothing testing it against `Object.values(Module)`:

```ts
  | "ADVANCED_REPORTING"
  | "LEARNING";            // add
```
and `MODULE_LABELS` (`:482-491`), which is `Record<AdminModule, string>`:
```ts
  LEARNING: "Learning",
```

**Failing test first:** the existing completeness spec ([`capability-maps.spec.ts`](../../packages/platform/src/__tests__/capability-maps.spec.ts)) iterates the **runtime** `Object.values(Module)` from the generated client, so it fails as soon as `prisma generate` picks up `LEARNING` and passes once the mapping lands. This extends existing coverage rather than adding a test concept. Belt and braces with the `Record<Module, …>` compile error.

**Rollback:** revert the enum-only migration and the three map edits together. Nothing references the value yet.

---

## PR 4.2 — Learning schema

**Scope:** the four models and `ReportBundleStatus`, adapted from [`03-domain-model.md:68-170`](../cee-vertical/03-domain-model.md). Adapted, not copied — three corrections below.

**`packages/db/prisma/schema.prisma`** (E). Corrections against the CEE source:

1. **`ReportBundle.downloadTokenId` is dropped** (Decision A / Finding 1).
2. **Named relations are mandatory** wherever a model has a second FK to `User` — the `@relation("ChildNoteAuthor", …)` pattern at `:928-944`. `loggedBy`, `uploadedBy` and `requestedBy` all target `User`.
3. **`@default(uuid())`**, matching all 46 existing models (`cuid()` appears zero times). The CEE doc already uses uuid; stated so nobody "modernises" it.

```prisma
enum ReportBundleStatus {
  PENDING
  GENERATING
  READY
  FAILED
}

model Subject {
  id           String        @id @default(uuid())
  tenantId     String
  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  name         String
  category     String?
  color        String?
  isActive     Boolean       @default(true)
  sortOrder    Int?
  learningLogs LearningLog[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
}

model LearningLog {
  id             String     @id @default(uuid())
  tenantId       String
  tenant         Tenant     @relation(fields: [tenantId], references: [id])
  childId        String
  child          Child      @relation(fields: [childId], references: [id])
  subjectId      String?
  subject        Subject?   @relation(fields: [subjectId], references: [id])
  loggedByUserId String
  loggedBy       User       @relation("LearningLogLoggedBy", fields: [loggedByUserId], references: [id])
  activityDate   DateTime   @db.Date
  minutes        Int?
  title          String
  description    String?    @db.Text
  evidence       Evidence[]
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  @@index([tenantId, activityDate])
  @@index([tenantId, childId, activityDate])
  @@index([subjectId])
}

model Evidence {
  id               String       @id @default(uuid())
  tenantId         String
  tenant           Tenant       @relation(fields: [tenantId], references: [id])
  childId          String
  child            Child        @relation(fields: [childId], references: [id])
  learningLogId    String?
  learningLog      LearningLog? @relation(fields: [learningLogId], references: [id])
  title            String
  storageKey       String
  mimeType         String
  byteSize         Int
  capturedAt       DateTime?
  uploadedByUserId String
  uploadedBy       User         @relation("EvidenceUploadedBy", fields: [uploadedByUserId], references: [id])
  createdAt        DateTime     @default(now())

  @@index([tenantId, childId])
  @@index([learningLogId])
}

model ReportBundle {
  id                String             @id @default(uuid())
  tenantId          String
  tenant            Tenant             @relation(fields: [tenantId], references: [id])
  childId           String?
  requestedByUserId String
  requestedBy       User               @relation("ReportBundleRequestedBy", fields: [requestedByUserId], references: [id])
  periodStart       DateTime           @db.Date
  periodEnd         DateTime           @db.Date
  status            ReportBundleStatus @default(PENDING)
  storageKey        String?
  failureReason     String?
  createdAt         DateTime           @default(now())
  completedAt       DateTime?

  @@index([tenantId, childId])
  @@index([status])
}
```

`failureReason` is additive to the CEE spec: a `FAILED` bundle with no reason is undebuggable, and this is the phase's only asynchronous path.

**Back-relations** (E) — Prisma will not compile without them:
- `Tenant` (`:320-355`): `subjects Subject[]`, `learningLogs LearningLog[]`, `evidence Evidence[]`, `reportBundles ReportBundle[]`
- `Child` (`:634-673`): `learningLogs LearningLog[]`, `evidence Evidence[]`
- `User`: the three named inverse sides.

**Migration** (N) — `pnpm --filter @pathway/db prisma:migrate:dev --name add_learning_models`. Review the generated SQL against `20260718071741`'s shape: four `CREATE TABLE`s, the indexes, the FKs with `ON DELETE RESTRICT ON UPDATE CASCADE`.

**RLS** (N, same migration or an adjacent one) — Decision E. Append the four tables to the generic-policy array at [`20251201173000_core_tenant_rls/migration.sql:46`](../../packages/db/prisma/migrations/20251201173000_core_tenant_rls/migration.sql) by re-running an equivalent `DO $$ … FOREACH tbl IN ARRAY ARRAY['Subject','LearningLog','Evidence','ReportBundle'] …` block, and add the four names to the hardened-table list at [`pathway-rls.e2e.spec.ts:20`](../../apps/api/src/tests/rls/pathway-rls.e2e.spec.ts).

**Failing test first** — DB-backed, guarded by `requireDatabase()` plus the localhost assertion added after the production-DB incident. **Never point it at a pooler host.** Assert:
- each model's required FKs reject a missing parent;
- `ReportBundleStatus` accepts all four values and defaults to `PENDING`;
- **`Evidence.learningLogId` is genuinely optional** — create an `Evidence` row with no `learningLogId` and read it back. Evidence can exist without a specific logged lesson (a general work sample), and this is the one nullability the model depends on.
- RLS: a query under one tenant's context cannot see another tenant's `LearningLog`.

**Rollback:** drop the four tables and the policies. The `LEARNING` enum value from PR 4.1 stays and stays harmless.

---

## PR 4.3 — Learning API module

**Scope:** NestJS module for `Subject`/`LearningLog`/`Evidence` CRUD plus the report-bundle request and download routes, capability-guarded. **This is `CapabilityGuard`'s first production consumer.**

**Key files:**
- `apps/api/src/learning/learning.module.ts` (N)
- `apps/api/src/learning/learning.controller.ts` (N)
- `apps/api/src/learning/learning.service.ts` (N)
- `apps/api/src/learning/dto/*.dto.ts` (N) — zod
- `apps/api/src/learning/tests/learning.service.spec.ts` (N)
- `apps/api/src/learning/tests/learning.e2e.spec.ts` (N) — **required, see below**
- `apps/api/src/app.module.ts` (E) — register after `LessonsModule`

**`learning.module.ts`** — mirrors `lessons.module.ts`, plus `PlatformModule` for the guard:

```ts
import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { LearningController } from "./learning.controller";
import { LearningService } from "./learning.service";

@Module({
  imports: [CommonModule, AuthModule, PlatformModule],
  controllers: [LearningController],
  providers: [LearningService],
})
export class LearningModule {}
```

**`learning.controller.ts`** — guard stacked at class level, capability declared per handler, mirroring how `SafeguardingGuard` is wired at [`notes.controller.ts:51,:76`](../../apps/api/src/notes/notes.controller.ts):

```ts
@Controller("learning")
@UseGuards(AuthUserGuard, CapabilityGuard)
export class LearningController {
  constructor(
    @Inject(LearningService) private readonly learningService: LearningService,
  ) {}

  @Get("subjects")
  @RequireCapability("learning.log.read")
  async listSubjects(@CurrentTenant("tenantId") tenantId: string) {
    return this.learningService.listSubjects(tenantId);
  }

  @Post("logs")
  @RequireCapability("learning.log.write")
  async createLog(
    @Body() body: unknown,
    @CurrentTenant("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const parsed = createLearningLogSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.format());
    }
    const userId = req.authUserId;
    if (!userId) throw new BadRequestException("Authentication required");
    return this.learningService.createLog(parsed.data, tenantId, userId);
  }

  // Decision A: authenticated proxy, mirroring GET /children/:id/photo.
  @Get("report-bundles/:id/download")
  @RequireCapability("learning.reports.generate")
  async downloadBundle(
    @Param("id") id: string,
    @CurrentTenant("tenantId") tenantId: string,
    @Res() res: Response,
  ) {
    const result = await this.learningService.getBundleFile(id, tenantId);
    if (!result) throw new NotFoundException("Report bundle not available");
    res.setHeader("Content-Type", result.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`,
    );
    res.send(result.buffer);
  }
}
```

Route set: `GET|POST /learning/subjects`, `GET|POST /learning/logs`, `GET|POST /learning/evidence`, `POST /learning/report-bundles`, `GET /learning/report-bundles`, `GET /learning/report-bundles/:id/download`.

**`learning.service.ts`** — mirrors `children.service.ts`: `@Injectable()`, module-level `prisma` import, a shared `select` constant per model, `@Optional() @Inject(SupabaseStorageService)` with a `new SupabaseStorageService()` fallback. `getBundleFile` mirrors `getPhoto` (`children.service.ts:95-129`) — `findFirst({ where: { id, tenantId } })`, then `downloadObject(process.env.SUPABASE_STORAGE_PRIVATE_BUCKET ?? "", storageKey)`. Note the tenant scoping is in the `where` clause on every query; that is the house pattern and it is what makes the RLS layer a second line of defence rather than the only one.

**Failing test first — two files, and the e2e is not optional.**

`learning.service.spec.ts` mirrors [`children.service.spec.ts:1-68`](../../apps/api/src/children/tests/children.service.spec.ts): hoisted `jest.mock("@pathway/db", …)` with `subject`/`learningLog`/`evidence`/`reportBundle` mocks, service constructed with `new`, no `Test.createTestingModule`. Covers create/read for each model and the tenant scoping in each `where`.

`learning.e2e.spec.ts` covers what a unit test structurally cannot: **the real guard chain.** Every path in `CapabilityGuard` is currently proven only by a hand-constructed unit test. One concrete risk to assert against: `AuthUserGuard` writes `orgId: orgId || ""` ([`auth-user.guard.ts:278`](../../apps/api/src/auth/auth-user.guard.ts)) while the guard checks `if (!orgId)`. Empty string is falsy, so it throws `"No active organisation"` — the right outcome, never once exercised against the real chain. Assert:
- an org **with** the Learning module active reaches the handler;
- an org **without** it gets 403 `Missing capability: learning.log.write`;
- a request with no active org gets 403 `No active organisation`.

Naming matters: `*.spec.ts` runs in the `unit` project, `*.e2e.spec.ts` in the `e2e` project (`maxWorkers: 1`), and both must sit under `tests/` to match `testMatch` ([`jest.projects.config.ts:37-60`](../../apps/api/jest.projects.config.ts)).

**Rollback:** revert the directory and the `app.module.ts` entry. Nothing else imports it.

---

## PR 4.4 — Report bundle worker

**Scope:** a CLI script that generates a CSV `ReportBundle` for a tenant, following the `compute-av30` trio exactly.

**The CEE docs' "apps/workers (BullMQ)" architecture diagram is aspirational.** Grounded: `grep -rniE "bullmq|ioredis|redis|queue|cron" apps/workers` returns **zero matches**, and no `package.json` in the repo carries any of them. Workers are one-shot `tsx` processes invoked by GitHub Actions cron. This PR follows the real pattern.

**Key files:**
- `apps/workers/src/learning/generate-report-bundle.cli.ts` (N) — mirrors [`compute-av30.cli.ts`](../../apps/workers/src/av30/compute-av30.cli.ts): `import "dotenv/config"`, read env input, instantiate the job, `.run()`, log without PII, `closePrisma()` in `.finally()`.
- `apps/workers/src/learning/generate-report-bundle.job.ts` (N) — mirrors `compute-av30.job.ts`, a 20-line shell delegating to the service.
- `apps/workers/src/learning/report-bundle.service.ts` (N) — `constructor(private readonly client = prisma)`; `withTenantRlsContext(tenantId, orgId, cb)` for the tenant-scoped `LearningLog` read.
- `apps/workers/src/learning/storage-upload.ts` (N, ~25 lines) — Decision G.
- `apps/workers/package.json` (E) — `"generate:report-bundle": "tsx src/learning/generate-report-bundle.cli.ts"`, **plus the `test:unit` fix below**.
- `apps/api/src/common/storage/storage-key.util.ts` (E) — `reportBundleKey()`.
- `.github/workflows/` (N or E) — schedule.

**Status transitions** are the contract this PR exists to prove: `PENDING → GENERATING → READY` with a `storageKey` and `completedAt`, or `→ FAILED` with a `failureReason`. Wrap the render-and-upload in try/catch and write `FAILED` in the catch — a bundle stuck in `GENERATING` forever is the failure mode to design out.

**Storage key** (E) — add to `storage-key.util.ts`, matching the existing `tenants/${tenantId}/…` convention:
```ts
export function reportBundleKey(tenantId: string, bundleId: string): string {
  return `tenants/${tenantId}/reports/${bundleId}/bundle.csv`;
}
```
Note `EXTENSION_BY_MIME` in that file covers jpg/png/webp/pdf only; `text/csv` needs adding if the key is derived from mime rather than hardcoded.

**CI defect this PR must fix.** `@pathway/workers` defines `test` but **not** `test:unit`; CI runs `pnpm test:unit` → `turbo run test:unit` ([`ci.yml:67`](../../.github/workflows/ci.yml)). **Worker tests do not currently run in CI at all** — the existing AV30, retention and guest-pass specs included. Add `"test:unit": "jest -c jest.config.ts"` to `apps/workers/package.json`, or every test in this PR is decorative. Expect the pre-existing specs to start running for the first time; if any fail, that is a discovery, not a regression introduced here.

**Scheduling** — copy [`workers-scheduled.yml`](../../.github/workflows/workers-scheduled.yml): `ubuntu-22.04`, `environment: production`, Node 20, pnpm 9.7.0 via corepack, store cache keyed on `pnpm-lock.yaml`, a `Verify required secrets` step that hard-fails on a missing `DATABASE_URL`, then `pnpm --filter @pathway/workers generate:report-bundle`. **The storage env vars are not in any existing worker workflow** — `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `SUPABASE_STORAGE_PRIVATE_BUCKET` must be added as GitHub secrets and wired into the `env:` block, or every run fails at upload.

**Failing test first** — mirrors [`retention.service.spec.ts:1-40`](../../apps/workers/src/retention/tests/retention.service.spec.ts) (module-level `prismaMock`, `withTenantRlsContext` mocked to invoke its callback):
- a bundle with logs in range reaches `READY` with a `storageKey` matching `reportBundleKey()` and a non-empty CSV body;
- a simulated storage rejection lands `FAILED` with a `failureReason`, and **not** `READY`;
- the CSV contains one row per in-range `LearningLog` and excludes out-of-range rows — the period filter is the logic most likely to be quietly wrong;
- a tenant with zero logs still produces a `READY` bundle with a header-only CSV, rather than failing.

**Rollback:** revert the new files and the script entries. No scheduled trigger to unwind if the workflow is reverted with it.

---

## PR 4.5 — Admin surface

**Scope:** staff-facing UI for logging lessons, viewing subjects, and requesting a report bundle. **The first nav item in the app to carry a `capability`.**

**Key files:**
- `apps/admin/app/learning/page.tsx` (N) and child routes
- `apps/admin/lib/api-client.ts` (E) — `AdminLearningLogRow`, `fetchLearningLogs`, `createLearningLog`, following the per-feature convention (`Admin<X>Row` / `Api<X>` / `mapApiXToAdmin` / `fetchXMock`)
- `apps/admin/app/admin-shell.tsx` (E) — nav entry
- `packages/ui/src/components/sidebar-nav.tsx` (E) — new icon
- `apps/admin/package.json` (E) — register any new test file

**Admin pages are all client components.** `"use client"`, local `useState`, a `useEffect` gated on `sessionStatus === "authenticated"`, calling a named function from `lib/api-client`. There is **no RSC data fetching anywhere in this app**; a server-component learning page would be the only one in the codebase. Copy [`lessons/page.tsx`](../../apps/admin/app/lessons/page.tsx) — same `Card` + `DataTable` + inline error-with-retry shape.

**Nav entry** (E) — in `navItemsWithAccess` (`:38-69`), grouped with `Lessons`/`Classes` under `Teaching`:

```tsx
  { label: "Learning", href: "/learning", iconIndex: 20, access: "staff-or-admin", capability: "learning.log.read", group: "Teaching" },
```

The `capability` field is already typed and already filtered (`:292-301`, via `hasCapability` at [`access.ts:141-149`](../../apps/admin/lib/access.ts), where an absent capability means always-visible). **No item sets it today. This is the first.** Nothing new is built here — Phase 2's mechanism simply acquires its first consumer, which is the point of the acceptance criterion.

**A new icon is required.** [`sidebar-nav.tsx:58-79`](../../packages/ui/src/components/sidebar-nav.tsx) holds 20 entries, indices 0–19, and 19 is already the highest index used. Append a 21st (`// 20 Learning`) — `BookMarked` or similar, distinct from `BookOpen` (4, Lessons). [`admin-shell.nav.test.ts`](../../apps/admin/app/admin-shell.nav.test.ts) asserts both that every `iconIndex` is unique and that `iconComponents` covers the highest index used, so reusing an icon or skipping the array edit fails the build.

**Admin has no jest.** Every test is a standalone `tsx` script run through a hardcoded `&&` chain; a new test file must be appended to **both** `test` and `test:unit` in `apps/admin/package.json` or it never runs.

**Failing test first:** extend `admin-shell.nav.test.ts` — it is a source-text regex test over `admin-shell.tsx`, so assert that the Learning entry declares a `capability` and that its `iconIndex` is within `iconComponents`. The behavioural half (visible only for orgs with the module) is proven by the PR 4.3 e2e plus the existing `hasCapability` unit tests; do not build a render harness for it, since this app has no render-testing setup at all.

**Rollback:** revert the route, the nav entry and the icon together. Phase 2's filter is additive per item, so no other nav entry is affected.

---

## PR 4.6 — Learning price codes

**Scope:** make Learning purchasable. Four lines, one file (Finding 3). Everything downstream — the price-map parser, checkout line items, webhook activation, cancellation — is already generic and needs no changes.

**`apps/api/src/billing/billing-provider.config.ts`** (E) — extend `ModulePriceCode` (`:14-32`):
```ts
  | "MODULE_ADVANCED_REPORTING_MONTHLY"
  | "MODULE_ADVANCED_REPORTING_YEARLY"
  | "MODULE_LEARNING_MONTHLY"
  | "MODULE_LEARNING_YEARLY";
```
and add both to `ALLOWED_PRICE_CODES` (`:103-104`). The code string is exactly `MODULE_${Module}_${MONTHLY|YEARLY}`, which is what the checkout provider's lookup builds.

**Operational half:** create the Learning Stripe Product, a monthly and a yearly Price, and add both IDs to `STRIPE_PRICE_MAP` and `STRIPE_PRICE_MAP_TEST` per environment. **Needs commercial sign-off on a price** — the dev-doc module catalogue lists none, and Learning is not even in its original 8. Not a blocker: an unmapped module rejects checkout before a pending order is created, so the code ships safely ahead of the decision.

**Failing test first** — extend `billing-provider.config.spec.ts`, mirroring the Phase 3 PR 3.1 tests: one asserting `STRIPE_PRICE_MAP` accepts `MODULE_LEARNING_MONTHLY`, one asserting an unknown module code is filtered out.

**Rollback:** revert the two edits. Unmapped codes are inert; no Stripe object needs deleting.

---

## PR 4.7 — Version bump `2.3.0`

**Scope:** Phase 4 ships as `2.3.0` (Decision D). Learning is user-facing, so it takes a minor.

**Key files:**
- Root `package.json` — `"2.2.1"` → `"2.3.0"`
- `packages/util/src/version.ts` — `APP_VERSION = "2.2.1"` → `"2.3.0"`

**Failing test first:** grep `2\.2\.1` across `apps` + `packages` and update each pinned expectation — the `/health` version assertion and the web/admin footer tests are the ones Phase 3's PR 3.6 last touched. Both surfaces read `APP_VERSION`, so bumping the constant flows through; the tests prove the surfaced value changed.

**Release note (human/CI):** annotated tag `v2.3.0` + GitHub release, body as the changelog (no `CHANGELOG.md`, per D4). Call out that the **Learning Stripe Product and Prices must exist and be mapped** in the target environment (PR 4.6's operational half) before any org can activate the module, and that the report-bundle workflow needs the three Supabase secrets (PR 4.4).

**Rollback:** revert the two constants and the test expectations.

---

## Acceptance criteria

- [ ] `Module.LEARNING` exists with a capability mapping; the completeness test covers it; `AdminModule` and `MODULE_LABELS` compile (PR 4.1).
- [ ] The enum value ships in its **own** migration, ahead of any table that uses it (PR 4.1 / Finding 4).
- [ ] `Subject`, `LearningLog`, `Evidence`, `ReportBundle` exist, migrated, RLS-policied, and appear in the hardened-table assertion list (PR 4.2).
- [ ] `Evidence.learningLogId` is provably optional — an `Evidence` row persists with no linked log (PR 4.2).
- [ ] API endpoints reject requests without the matching `learning.*` grant, **proven end-to-end through the real `AuthUserGuard` → `CapabilityGuard` chain**, not only in a unit test (PR 4.3).
- [ ] A `ReportBundle` generates end-to-end via the worker CLI, landing `READY` with a valid `storageKey`, and downloads through the authenticated API route with no token model involved (PR 4.3 + 4.4).
- [ ] A simulated storage failure lands the bundle in `FAILED` with a `failureReason` — never stuck in `GENERATING` (PR 4.4).
- [ ] `@pathway/workers` defines `test:unit` and its specs actually run in CI (PR 4.4).
- [ ] The admin Learning nav entry is visible only to orgs with the module active — the first real proof that Phase 2's capability-driven nav works outside its own unit tests (PR 4.5).
- [ ] A checkout including Learning produces a module line item and, on payment, an `ACTIVE` `OrgModule` row, with **no new webhook code** (PR 4.6).
- [ ] No `Merit` model, table, enum, or capability exists — confirmed absent, not merely unused (all PRs).
- [ ] Product version reads `2.3.0` in `/health` and both footers (PR 4.7).

## Open decisions

1. **Learning's price** (blocks PR 4.6's operational half, not its code). Learning is not in the dev doc's original 8-module catalogue, so it has no listed price. Needs commercial sign-off before the Stripe Product and Prices can be created and mapped. Recommend one Product, two recurring Prices.
2. **Report-bundle trigger.** This plan builds the worker CLI plus a `POST /learning/report-bundles` that creates a `PENDING` row. Whether the admin "generate" button waits on a scheduled sweep or triggers work immediately is unresolved: the repo has no queue (Finding 2), so immediate execution means doing it inline in the API. Recommend the scheduled sweep first — it needs no new infrastructure, and the UI polls a status the model already carries.
3. **PDF output** (Decision B's deferred half). When the CSV proves the pipeline, rendering swaps behind one service method. `@react-pdf/renderer` is the obvious candidate since the repo already uses it, and `React.createElement` avoids any JSX config in workers ([`toolkit.pdf/route.ts:40`](../../apps/web/app/api/toolkit.pdf/route.ts) already does exactly that). Costs two new deps in a package that has three.
4. **Zipping evidence files into the bundle.** The CEE vision bundles a child's `Evidence` alongside the report. No zip library exists anywhere in the repo and `node:zlib` gives gzip, not a multi-file container. Deferred; needs a dependency decision of its own.
5. **Shareable bundle links.** Decision A serves bundles to authenticated staff only. If a bundle ever needs sending to someone without an account — an inspector, a local authority — that needs either a new token model or the repo's first signed-URL helper. Not built; flagged so nobody assumes `DownloadToken` covers it.
6. **`AdminModule` drift.** `apps/admin/lib/api-client.ts:472` hand-duplicates the Prisma `Module` enum with nothing testing the two against each other, unlike `capability-maps.spec.ts` which does exactly that for capabilities. PR 4.1 adds the ninth value by hand. Deriving the union from the generated client, or adding the equivalent completeness test, is smaller than the next drift bug — out of scope here, worth its own small PR.
7. **Lifting `SupabaseStorageService` into a package** (Decision G). This phase duplicates ~25 lines of upload into the worker rather than refactoring working API code for one new caller. If a third consumer appears, lift it to `packages/storage` and swap the Nest `Logger` for `console` — its decorators are its only Nest dependency.
