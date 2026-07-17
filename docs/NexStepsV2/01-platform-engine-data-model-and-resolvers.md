# Phase 1 — Platform engine: data model, resolvers, backfill

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.1.0` (tag `v2.1.0`)
**Depends on:** Phase 0 (versioning convention; no data dependency).
**Blocks:** Phase 2 (navigation/guards consume the resolvers here), Phase 3 (billing writes `OrgModule` rows), Phase 5 (configurator reads capabilities), Phase 7 (Home vertical is a new enum value here).

---

## Goal

Land the data model and resolver layer the dev doc calls `packages/platform` (§7, §11): `Vertical`/`Module`/`ModuleStatus` enums, the two new join models, the config-driven capability maps, and the four resolver functions — fully unit tested, not yet wired into any application (that's Phase 2).

## Grounding finding that changes the dev doc's data model

The dev doc's own schema snippet (§6) names the new models `OrganisationVertical` and `OrganisationModule` with an `organisationId` field. **Nothing in this schema is named `Organisation` anywhere** — the model is `Org` (`schema.prisma:226`), and every existing org-scoped model follows that: `OrgEntitlementSnapshot` (930), `OrgRetentionPolicy`, `OrgMembership`, `OrgDeletedUser`, all with an `orgId` FK, not `organisationId` (`Subscription.orgId:913`, `BillingEvent.orgId:960`, `PendingOrder.orgId:974`, etc.). Naming the new models `OrganisationVertical`/`OrganisationModule` with `organisationId` would be the only two models in a ~1,065-line schema not to follow this convention.

**Recommendation, adopted below: `OrgVertical` and `OrgModule`, FK field `orgId`.** This is a mechanical rename with no behavioural difference from the dev doc's proposal — flagged here rather than silently changed because it's worth a human nod before the first migration lands (renaming a model after a migration ships is a second migration).

**Open decision (cosmetic, doesn't block anything):** should the *resolver function* names in `packages/platform` follow suit (`getOrgVertical`, `orgHasModule`, `getOrgCapabilities`, `orgHasCapability`) or keep the dev doc's wording (`getOrganisationVertical`, `organisationHasModule`, …, §7)? Unlike the model rename, there's no existing "getOrg*" resolver convention in this codebase to match — these are brand-new public functions. Either is defensible; PR 1.5 below uses the dev doc's original names as the default, rename before merge if the team prefers consistency with the model names.

## Current state (grounded, R/E/N)

| File / model | Current state | R/E/N |
|---|---|---|
| `packages/db/prisma/schema.prisma:111-116` | `enum OrgSector { CHURCH CLUB SCHOOL CHARITY }` — 4 values, no Nursery, `SCHOOL` undifferentiated. Comment at 109-110 explicitly says "Keep in sync with `SectorId` in `apps/web/content/sectors.ts` and `Sector` in `packages/types`" | E (this phase adds `Vertical` alongside it, doesn't remove it — see PR 1.6) |
| `packages/db/prisma/schema.prisma:226-258` | `Org` model — `sector OrgSector?` (nullable, 236), `planCode String` (230, comment: "e.g., trial\|starter\|standard\|pro\|suite_\*" — **a separate, largely vestigial plan marker distinct from `Subscription.planCode`**, which is what `getPlanDefinition()` actually reads; grep confirms entitlement resolution never reads `Org.planCode`), relations to `Tenant[]`, `Subscription[]`, `OrgEntitlementSnapshot[]` | E (new models FK onto this) |
| `packages/types/src/sector.ts` | A **second**, Prisma-independent copy of the sector concept: `Sector = "CHURCH"\|"CLUB"\|"SCHOOL"\|"CHARITY"` plain string union (deliberately, per its own comment, "kept... dependency-free... rather than importing the Prisma enum") | R (pattern to replicate for `Vertical`, see PR 1.6) |
| `apps/web/content/sectors.ts` | A **third** copy, shaped for marketing content: `SectorId = "schools"\|"clubs"\|"churches"\|"charities"` (lowercase plural, different casing scheme entirely) plus full `SectorDefinition` marketing copy (hero title, examples, CTAs) per sector | R (downstream consumer for later marketing-copy work, not this phase) |
| `packages/db/prisma/migrations/20260714100000_add_org_sector/` | Confirms `sector` was added to `Org` recently (2026-07-14) as its own migration | R (pattern to follow: one focused migration per PR) |
| `packages/pricing/` | Existing small workspace package: `package.json` (`@pathway/pricing`, `main: src/index.ts`, `exports: {".": "./src/index.ts"}`, stub `test`/`build` scripts), `tsconfig.json` extending `../config/tsconfig/base.json` | R (structural template for scaffolding `packages/platform`, PR 1.3) |
| `packages/util/` | Real, *tested* workspace package: `jest.config.ts` (`ts-jest`, ESM, `testMatch: ["**/__tests__/**/*.spec.ts"]`) | R (template to follow instead of `packages/pricing`'s stub test script, since `packages/platform` needs real tests from PR 1.3 onward) |
| `apps/api/src/children/tests/children.service.spec.ts` | Reference test pattern: `jest.mock("@pathway/db", ...)` at module level with per-model mock functions, imports the real service under test | R (template for every resolver test in this phase) |
| — | **No `Module`/capability concept exists anywhere today.** Current entitlements (`OrgEntitlementSnapshot`) are plan-level limits (`maxSites`, `av30Included`, `storageGbIncluded`), not discrete purchasable modules. This matters for PR 1.7 — see below | — |

---

## PR breakdown

### PR 1.1 — Core enums

**Scope:** Add `Vertical`, `Module`, `ModuleStatus` enums to the schema. Migration only, no models, no consumers.

**Key files:**
- `packages/db/prisma/schema.prisma` (E) — add near the existing `OrgSector` enum (line 116), same section:
  ```prisma
  enum Vertical {
    CHURCH
    INDEPENDENT_SCHOOL
    ACE_SCHOOL
    STATE_SCHOOL
    NURSERY
    CHARITY
    CLUB
  }

  enum Module {
    FINANCE
    EVENTS
    TRANSPORT
    MEALS
    ASSET_MANAGEMENT
    HR
    AI_WORKSPACE
    ADVANCED_REPORTING
  }

  enum ModuleStatus {
    ACTIVE
    EXPIRED
    CANCELLED
  }
  ```
- New migration folder (N) — `packages/db/prisma/migrations/<timestamp>_add_vertical_module_enums/`, following the naming pattern of `20260714100000_add_org_sector`.

**Failing test first:** a Prisma-client-level type test / `prisma validate` check that the three enums exist with the exact value sets above. (Enum-only migrations don't have meaningful business-logic tests; the "test" here is the migration applying cleanly against a scratch DB per `.env.test`.)

**Rollback:** `prisma migrate resolve --rolled-back` for this migration; nothing references these enums yet, so it's a clean revert.

---

### PR 1.2 — `OrgVertical` and `OrgModule` models

**Scope:** Add the two join models (naming per the grounding finding above), FK'd to `Org`.

**Key files:**
- `packages/db/prisma/schema.prisma` (E):
  ```prisma
  model OrgVertical {
    id        String   @id @default(uuid())
    orgId     String   @unique
    org       Org      @relation(fields: [orgId], references: [id])
    vertical  Vertical
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }

  model OrgModule {
    id          String       @id @default(uuid())
    orgId       String
    org         Org          @relation(fields: [orgId], references: [id])
    module      Module
    status      ModuleStatus
    activatedAt DateTime?
    expiresAt   DateTime?
    metadata    Json?
    createdAt   DateTime     @default(now())
    updatedAt   DateTime     @updatedAt

    @@unique([orgId, module])
    @@index([orgId])
  }
  ```
  `OrgVertical.orgId` is `@unique` (one vertical per org, matching the dev doc's 1:1 intent); `OrgModule` is 1:many with a compound unique on `[orgId, module]` so an org can't have two rows for the same module.
- `Org` model (E) — add the two back-relations (`orgVertical OrgVertical?`, `orgModules OrgModule[]`) alongside its existing relation list (`schema.prisma:242-255`).
- New migration folder (N).

**Failing test first:** migration test asserting the compound unique constraint on `OrgModule` rejects a duplicate `[orgId, module]` insert; `OrgVertical`'s unique `orgId` rejects a second vertical for the same org.

**Rollback:** roll back the migration; no application code reads these tables yet (PR 1.5+).

---

### PR 1.3 — Scaffold `packages/platform`

**Scope:** Create the workspace package. No logic yet beyond a `Capability` type and resolver function stubs that throw `"not implemented"`.

**Key files:**
- `packages/platform/package.json` (N) — modelled on `packages/pricing/package.json`'s shape (`@pathway/platform`, `main: src/index.ts`, `exports: {".": "./src/index.ts"}`) but with a **real** `test` script matching `packages/util`'s pattern (`jest --config jest.config.ts --runInBand`), not `packages/pricing`'s stub `echo` script — this package needs actual tests from the next PR onward.
- `packages/platform/tsconfig.json` (N) — `extends: "../config/tsconfig/base.json"`, matching every other package.
- `packages/platform/jest.config.ts` (N) — copy of `packages/util/jest.config.ts`.
- `packages/platform/src/index.ts` (N) — barrel export.
- `packages/platform/src/types.ts` (N) — `export type Capability = string` to start (a plain string type, not a union — see PR 1.4 for why).
- `packages/platform/src/vertical.ts`, `modules.ts`, `capabilities.ts` (N) — stub function signatures per dev-doc §7, bodies throw.
- Root `pnpm-workspace.yaml` (E) — no change needed; `packages/*` glob already covers this (confirmed against the 13 existing workspace packages).
- `apps/api` (and any other consuming app's) `package.json`/tsconfig path-mapping (E) — add `@pathway/platform` as a dependency where it'll be consumed in Phase 2/3, or defer until those PRs actually import it (recommended: defer, to keep this PR's diff to the new package only).

**Failing test first:** a smoke test importing `@pathway/platform` and asserting the barrel exports exist (fails today because the package doesn't exist).

**Rollback:** delete the new package directory; nothing depends on it yet.

---

### PR 1.4 — Capability maps

**Scope:** The config-driven `Vertical → Capability[]` and `Module → Capability[]` maps (dev-doc §4, Layer 3, "config-driven" recommendation — D6 in the README).

**Key files:**
- `packages/platform/src/capability-maps.ts` (N) — two `Record<Vertical, Capability[]>` / `Record<Module, Capability[]>` constants. Capability strings follow the dev doc's `domain.action` shape (`attendance.read`, `finance.invoices`, etc., §4).
- `packages/platform/src/types.ts` (E) — capabilities stay a plain `string` type rather than a union, since the map is the enumeration surface and a string union would have to be hand-kept in sync with it (the exact duplication trap this doc set keeps finding elsewhere — pricing catalogues, sector copies). A runtime completeness test (below) is the guard instead of a compile-time union.

**Failing test first:** a test asserting every `Vertical` enum value has at least one entry in the vertical map and every `Module` enum value has at least one entry in the module map (a completeness test that fails the moment a new enum value is added without a mapping — this is the test the dev doc's own §13 asks for: "every vertical/module has a mapping").

**Rollback:** revert the one new file; nothing consumes it yet (PR 1.5).

---

### PR 1.5 — Resolvers

**Scope:** The four functions from dev-doc §7.

**Key files:**
- `packages/platform/src/vertical.ts` (E) — `getOrganisationVertical(orgId): Promise<Vertical | null>` reads `OrgVertical` by `orgId` (nullable return — not every org has one yet until PR 1.7's backfill runs).
- `packages/platform/src/modules.ts` (E) — `organisationHasModule(orgId, module): Promise<boolean>` reads `OrgModule` filtering `status = ACTIVE` and (`expiresAt` null or in the future).
- `packages/platform/src/capabilities.ts` (E) — `getOrganisationCapabilities(orgId): Promise<Capability[]>` = union of the vertical's capabilities (if any) + capabilities from every active, non-expired module; `organisationHasCapability(orgId, capability): Promise<boolean>` = membership check against the above.
- `packages/platform/src/db.ts` (N) — thin `@pathway/db` Prisma-client accessor, so the four resolvers above import from here rather than each importing `@pathway/db` directly (keeps `jest.mock("@pathway/db")` centralized in one place per the reference test pattern).

**Failing test first (per the reference pattern in `children.service.spec.ts`):** `jest.mock("@pathway/db", ...)` with mocked `orgVertical`/`orgModule` model calls, covering:
- an org with no `OrgVertical` row → `getOrganisationVertical` returns `null`, `getOrganisationCapabilities` returns only what an empty vertical contributes (nothing, today, since verticals are the only capability source before any module is added).
- an org with an `EXPIRED` module → its capabilities are excluded.
- an org with an `ACTIVE` module whose `expiresAt` is in the past → treated as expired despite the `ACTIVE` status column (defends against a stale status row).
- an org with vertical + two active modules → capability set is the correct union, no duplicates.

**Rollback:** revert the resolver files; `packages/platform` still exports valid (if unused) code.

---

### PR 1.6 — Reconcile `OrgSector` with `Vertical`

**Scope:** Decide and document how the 4-value `OrgSector` enum maps onto the 7-value `Vertical` enum, and where `Vertical` needs its own dependency-free copy, following the exact precedent `Sector` already set in `packages/types`.

**Key files:**
- `packages/types/src/vertical.ts` (N) — a plain-string-union `Vertical` type mirroring `packages/types/src/sector.ts`'s shape (`VERTICAL_LABELS`, `VERTICAL_OPTIONS`, `isVertical()`), for the same reason the comment on `sector.ts` gives: frontend packages that shouldn't depend on `@pathway/db`/Prisma.
- No change to `apps/web/content/sectors.ts` in this phase — that file's marketing-copy shape is a Phase 5/7 concern (per-vertical imagery and copy), not a data-model concern. Flagged as a downstream consumer, not touched here.
- Direct mapping for 3 of 4 `OrgSector` values: `CHURCH → CHURCH`, `CLUB → CLUB`, `CHARITY → CHARITY`.

**Open decision (already flagged in the README, repeated here since it's this PR's blocker):** `OrgSector.SCHOOL` has to become one of `INDEPENDENT_SCHOOL` / `ACE_SCHOOL` / `STATE_SCHOOL`, and nothing in the current schema records which. Options: (a) a manual mapping table maintained by product/ops before backfill runs (dev-doc §14's own suggestion), (b) default every existing `SCHOOL` org to one value (e.g. `INDEPENDENT_SCHOOL`) and let orgs self-correct via the Phase 2 Org Settings vertical-change screen. Needs a human decision before PR 1.7 runs against production data; (b) is the lower-effort default if no decision lands in time, since Phase 2 already builds a "change vertical" UI that makes a wrong default correctable.

**Failing test first:** unit test for the mapping function covering all 4 `OrgSector` values, asserting the 3 direct mappings and whichever `SCHOOL` resolution is decided; a test asserting `NURSERY` has no `OrgSector` equivalent (net-new, only reachable via the Phase 2 vertical-change screen or new signups, never via backfill).

**Rollback:** revert the mapping file and the new `packages/types` file; doesn't touch the DB.

---

### PR 1.7 — Backfill

**Scope:** One `OrgVertical` row per existing `Org`, using the PR 1.6 mapping. **`OrgModule` backfill is a no-op**, not the "reflect current entitlements" step the dev doc's §14 step 3 implies — grounded finding: there is no existing per-module entitlement concept in this codebase today (`OrgEntitlementSnapshot` tracks plan-level limits like `maxSites`/`av30Included`, never discrete modules like Finance/Events). Every existing org simply starts with zero `OrgModule` rows, which is safe: modules are additive on top of vertical-granted capabilities, so an org with no module rows loses nothing it has today (it never had module-gated features to begin with).

**Key files:**
- `packages/platform/scripts/backfill-org-vertical.ts` (N) — reads every `Org`, applies the PR 1.6 mapping against `Org.sector`, writes one `OrgVertical` row. Orgs with `sector = null` (the nullable case noted in the schema comment, `schema.prisma:234-236`) need their own fallback — flagged as a second open decision alongside PR 1.6's, since it's the same shape of problem (what do we default an org with no recorded sector to).
- No `OrgModule` backfill script needed (see above) — worth stating explicitly in the PR so nobody spends time building one.

**Failing test first:** migration/integration test asserting every `Org` row ends with exactly one `OrgVertical` row after the script runs (dev-doc §13's own requirement), including the `sector = null` edge case.

**Rollback:** the script only inserts `OrgVertical` rows; rollback = delete all rows created by this script's run (tag them with a `source` marker or run timestamp for safe identification, matching the pattern `OrgEntitlementSnapshot.source` already uses as a string discriminator, `schema.prisma:939`).

---

## Acceptance criteria

- [ ] `Vertical`, `Module`, `ModuleStatus` enums exist with the exact value sets in PR 1.1.
- [ ] `OrgVertical`/`OrgModule` models exist, correctly constrained (`orgId` unique on `OrgVertical`, compound unique on `OrgModule`).
- [ ] `packages/platform` exists as a real, tested workspace package — not a stub with an `echo` test script.
- [ ] Every `Vertical` and `Module` value has a capability mapping (completeness test passes).
- [ ] All four resolvers pass the edge-case test suite in PR 1.5 (no vertical, expired module, active-but-past-expiry module, union correctness).
- [ ] Every existing `Org` has exactly one `OrgVertical` row post-backfill; zero `OrgModule` rows is the expected, correct backfill state.
- [ ] Nothing in `apps/api`, `apps/admin`, `apps/web`, or `apps/mobile` imports `@pathway/platform` yet — that's Phase 2. This phase's PRs should show zero application-code diffs outside `packages/platform` and `packages/db`.

## Open decisions

1. **Model naming: `OrgVertical`/`OrgModule` + `orgId`** vs. the dev doc's literal `OrganisationVertical`/`OrganisationModule` + `organisationId` — recommended above on consistency grounds; needs a nod before PR 1.2's migration ships (cheap to change before merge, a second migration to change after).
2. **Resolver function naming** (`getOrganisationVertical` vs. `getOrgVertical`, etc.) — cosmetic, either works, flagged so it's a deliberate choice not an accident.
3. **`OrgSector.SCHOOL` → which of the three school verticals** during backfill (PR 1.6/1.7) — needs a human decision or an accepted default-plus-self-correct fallback.
4. **What to default `Org.sector = null` orgs to** during backfill (PR 1.7) — same shape of problem as #3, same fallback option (default + self-correct via Phase 2's vertical-change screen).
