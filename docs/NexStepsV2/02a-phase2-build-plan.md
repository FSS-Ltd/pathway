# Phase 2 — Detailed build plan (wiring: navigation, guards, admin settings)

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.2.0` (tag `v2.2.0`)
**Depends on:** Phase 1 (`@pathway/platform` resolvers + backfilled `OrgVertical`/`OrgModule` data — merged in PRs #176–184).
**Blocks:** Phase 3 (module activation needs the Modules settings screen), Phase 5 (configurator reuses the capability-preview pattern), Phase 6 (cutover removes what this phase adds alongside the old logic).
**Companion to:** [`02-wiring-navigation-guards-admin-settings.md`](02-wiring-navigation-guards-admin-settings.md) — that doc is the summary; this one pins down the exact code, endpoints, settings-card contracts, and test bodies so a build session can execute PR-by-PR with no invention.

---

## Purpose

Phase 1 landed the platform engine (`@pathway/platform`): the `Vertical`/`Module`/`ModuleStatus` enums, the `OrgVertical`/`OrgModule` models, the config-driven capability maps, and four resolvers (`getOrgVertical`, `orgHasModule`, `getOrgCapabilities`, `orgHasCapability`) — unit-tested and **not yet consumed by any application**.

Phase 2 is where that library stops being unused. It makes capabilities **visible and enforced**: admin navigation reads them, an API guard checks them, and Org Settings lets an admin see and (in non-production only) change vertical/module state.

The summary doc (`02-…md`) leaves the exact guard code, endpoint shapes, client-fetch wiring, settings-card contracts, and test bodies unresolved, and still uses Phase 1's *pre-rename* resolver names (`getOrganisationCapabilities`/`organisationHasCapability`) that shipped instead as `getOrgCapabilities`/`orgHasCapability`. This doc resolves all of that against the grounded repo state.

---

## Decisions locked

1. **Resolver naming:** Phase 1 shipped `getOrgVertical` / `orgHasModule` / `getOrgCapabilities` / `orgHasCapability` in `@pathway/platform` (barrel `packages/platform/src/index.ts`). The dev doc's / `02-…md`'s `*Organisation*` names are corrected to these throughout.
2. **Mobile:** **out of Phase 2 scope.** Grounded: the mobile bottom navs (`apps/mobile/src/components/navigation/family-bottom-nav.tsx`, `serve-bottom-nav.tsx`) are static core family/serve tab bars (`FAMILY_ITEMS`, `SERVE_ITEMS`) with no module/vertical surface and no auth/org/capability context. Nothing there is capability-gated, and nothing ships until Phase 4. Mobile capability-gating is deferred until a real mobile surface needs it.
3. **Frontend capability source:** a dedicated **`GET /platform/capabilities`** endpoint (dev-doc §7), fetched by the admin app over HTTP and folded into the existing `useAdminAccess()` hook. The admin frontend has **no** `@pathway/platform`/`@pathway/db` dependency and cannot read the DB or import the resolvers — HTTP is the only path. (Lazier alternative considered and rejected: adding a `capabilities` array to the existing `/auth/active-site/roles` response like `hasFamilyAccess`; rejected to keep platform concerns in the platform module.)
4. **`AdminVertical` type:** a local copy in `apps/admin/lib/api-client.ts` mirroring the existing `AdminOrgSector`/`ORG_SECTOR_LABELS` (api-client.ts:443–450). Admin deliberately keeps a local sector copy rather than importing `@pathway/types` `Sector`; the vertical copy follows the same house style (avoids adding a new workspace dep). Not this phase's job to centralize.
5. **`sector-visibility.ts`:** left untouched (no-op today; PR 2.4's candidate-vertical preview reads `VERTICAL_CAPABILITIES`, not this file). Repurposing is a separate call for whoever needs real vertical-visibility rules.
6. **Versioning:** Phase 2 includes a final **bump-to-2.2.0** PR (root `package.json` + `packages/util/src/version.ts` `APP_VERSION`, currently `2.0.1`). Phase 1's planned `2.1.0` bump/tag never landed; that gap is flagged as a release-hygiene note, not retroactively tagged here.

---

## Grounded references (read once before starting)

| Purpose | Real file / anchor |
|---|---|
| Guard + decorator to mirror (`CapabilityGuard`) | `apps/api/src/common/safeguarding/{safeguarding.guard.ts,safeguarding.decorator.ts,safeguarding.types.ts,safeguarding.module.ts}` |
| Async guard precedent (DB call in `canActivate`) | `apps/api/src/auth/auth-user.guard.ts` (`async canActivate(): Promise<boolean>`) |
| Request-scoped org id | `PathwayRequestContext.currentOrgId` (`packages/auth/src/context/pathway-request-context.service.ts:54`); set by `AuthUserGuard` as `req.__pathwayContext` (`auth-user.guard.ts:291`) |
| Controller org param | `@CurrentOrg("orgId")` (`packages/auth/src/decorators/current-org.decorator.ts`), e.g. `notes.controller.ts:80` |
| Feature-module shape | `apps/api/src/orgs/orgs.module.ts`; guard-hosting module `apps/api/src/common/safeguarding/safeguarding.module.ts`; register in `apps/api/src/app.module.ts` |
| `prisma` usage (no `PrismaService`) | `import { prisma } from "@pathway/db"` singleton; `OrgsService` (`orgs.service.ts:10`) |
| Change-vertical method shape | `OrgsService.updateCurrentOrg` (`orgs.service.ts:300–330`, findUnique → NotFoundException → update); upsert shape `backfill-org-vertical.ts:17–21` |
| Validate-then-narrow guard | `isOrgSector` (`apps/api/src/billing/webhook.controller.ts:43–45`) |
| API e2e (403/200, real DB, forged JWT) | `apps/api/src/concerns/tests/concerns.e2e.spec.ts`; skips via `requireDatabase()`; seeds via `withTenantRlsContext` |
| Controller unit test (guards bypassed, mocked service) | `apps/api/src/concerns/tests/concerns.controller.spec.ts` |
| Admin nav item + filter | `apps/admin/app/admin-shell.tsx:41–62` (`navItemsWithAccess`), `:284–292` (`visibleNavItems`); type `SidebarNavItem` @ `packages/ui/src/components/sidebar-nav.tsx:32–43` |
| Role check to compose with | `meetsAccessRequirement` (`apps/admin/lib/access.ts:144–169`); role source `useAdminAccess()` (`admin-shell.tsx:214–219`) |
| Pure-function test to extend | `apps/admin/lib/access.test.ts` (the `admin-shell.nav.test.ts` is a source-regex test, **not** role/capability logic) |
| Client fetch + mutation house style | `fetchOrgOverview` (`api-client.ts:4202–4243`), `updateOrgProfile` (`:4245–4273`); flags precedent `hasFamilyAccess`/`hasServeAccess` on `UserRolesResponse` (`:598–613`) |
| Settings screen + card to mirror | `apps/admin/app/settings/page.tsx`, `apps/admin/app/settings/parent-portal-settings-card.tsx` (prop-driven card) |
| Sector already read-only in settings | `settings/page.tsx:364–368,388–392` via `ORG_SECTOR_LABELS[org.sector]` |
| Vertical types (frontend copy source) | `packages/types/src/vertical.ts` (`Vertical`, `VERTICAL_LABELS`, `VERTICAL_OPTIONS`, `isVertical`) |
| Platform barrel (needs capability-maps export) | `packages/platform/src/index.ts` (currently omits `capability-maps`) |

---

## Conventions every PR follows

- **One branch per PR**, prefix `feat/` or `chore/`, lowercase commit subject (commitlint). PRs target `FSS-Ltd/pathway` via the `fss` remote. No AI attribution in commits/PRs. Stacked in order 2.1 → 2.5 (each based on the previous, as Phase 1 did).
- **TDD:** the failing test lands in the same PR as the code.
- **No production test routes.** The `CapabilityGuard` is proven by a **unit test** (construct + mock), not a throwaway guarded route in prod. Its first real e2e consumer is Phase 4.
- **DB-touching tests are test-DB-only.** Any e2e that imports `@pathway/db` runs only under `requireDatabase()` + a localhost host assertion — the same guard Phase 1 added after the production-DB incident. Never point a test at a Supabase/pooler host.
- **No app diffs outside the phase's stated files.** No nav item receives a `capability` value in this phase (nothing to gate yet); PR 2.2 builds the mechanism only.
- **After each code PR:** `graphify update .`.

---

## PR ordering (dependency-correct)

The `02-…md` skeleton lists nav (2.1) before the API (2.2), but the admin nav consumes the capabilities endpoint, so the endpoint lands first:

| PR | Branch | Was (in 02-…md) |
|---|---|---|
| 2.1 — Platform API module: `CapabilityGuard` + `GET /platform/capabilities` | `feat/phase2-platform-api` | PR 2.2 |
| 2.2 — Capability-driven admin navigation | `feat/phase2-capability-nav` | PR 2.1 |
| 2.3 — Org Settings: Vertical section | `feat/phase2-settings-vertical` | PR 2.3 |
| 2.4 — Org Settings: Modules section + non-prod toggle | `feat/phase2-settings-modules` | PR 2.4 |
| 2.5 — Version bump `2.2.0` | `chore/phase2-version-2.2.0` | (new; roadmap) |

> Code blocks below are verbatim targets. "Mirror X" means copy an existing file's shape exactly. UI cards are given as a props contract + data flow + the file to mirror, not verbatim JSX — dictating 700-line React screens is neither accurate nor lazy; the pattern file is the source of truth.

---

## PR 2.1 — Platform API module: `CapabilityGuard` + `GET /platform/capabilities`

**Scope:** new NestJS module `apps/api/src/platform/`. A capability-checking guard route handlers opt into via `@RequireCapability(...)`, plus the "my org's capabilities" endpoint the admin frontend consumes in PR 2.2. No existing guard is replaced (there is no sector-based API guard — grounded).

**Key facts (grounded):** there is no `PrismaService`; the `@pathway/platform` resolvers are plain async functions over the `@pathway/db` singleton, so the guard just imports `orgHasCapability` — nothing to register in `providers`. `orgId` comes from `PathwayRequestContext.currentOrgId`, populated by `AuthUserGuard`. `getOrgCapabilities` runs 2 DB queries per call; a guard firing on every request is 2 queries/request with no cache — acceptable for Phase 2, noted as a ceiling.

**`apps/api/src/platform/capability.decorator.ts`** (N) — mirror `safeguarding.decorator.ts`:
```ts
import { SetMetadata } from "@nestjs/common";
import type { Capability } from "@pathway/platform";

export const REQUIRE_CAPABILITY_KEY = "pathway:required_capability";

export const RequireCapability = (capability: Capability) =>
  SetMetadata(REQUIRE_CAPABILITY_KEY, capability);
```

**`apps/api/src/platform/capability.guard.ts`** (N) — mirror `safeguarding.guard.ts`, but **async** (DB call) like `AuthUserGuard`:
```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PathwayRequestContext } from "@pathway/auth";
import { orgHasCapability, type Capability } from "@pathway/platform";
import { REQUIRE_CAPABILITY_KEY } from "./capability.decorator";

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PathwayRequestContext) private readonly requestContext: PathwayRequestContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability>(
      REQUIRE_CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const orgId = this.requestContext.currentOrgId;
    if (!orgId) throw new ForbiddenException("No active organisation");

    if (await orgHasCapability(orgId, required)) return true;
    throw new ForbiddenException(`Missing capability: ${required}`);
  }
}
```
Usage (documented, not applied to any prod route this PR): stack **after** `AuthUserGuard` so the request context is populated first — `@UseGuards(AuthUserGuard, CapabilityGuard)` + `@RequireCapability("finance.invoices")` on a handler.

**`apps/api/src/platform/platform.controller.ts`** (N) — the capabilities read endpoint. Any authenticated org member may read their own org's capabilities, so it is **not** capability-gated, only auth-gated:
```ts
import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthUserGuard } from "../auth/auth-user.guard";
import { CurrentOrg } from "@pathway/auth";
import { getOrgCapabilities, type Capability } from "@pathway/platform";

@UseGuards(AuthUserGuard)
@Controller("platform")
export class PlatformController {
  @Get("capabilities")
  async capabilities(@CurrentOrg("orgId") orgId: string): Promise<{ capabilities: Capability[] }> {
    return { capabilities: await getOrgCapabilities(orgId) };
  }
}
```
(Confirm the exact `AuthUserGuard` import path and `CurrentOrg` export against `notes.controller.ts` at implementation; both are used together there.)

**`apps/api/src/platform/platform.module.ts`** (N) — mirror `safeguarding.module.ts` (imports `PathwayAuthModule` for `PathwayRequestContext`) plus `AuthModule` for the controller's `AuthUserGuard`:
```ts
import { Module } from "@nestjs/common";
import { PathwayAuthModule } from "@pathway/auth";
import { AuthModule } from "../auth/auth.module";
import { CapabilityGuard } from "./capability.guard";
import { PlatformController } from "./platform.controller";

@Module({
  imports: [PathwayAuthModule, AuthModule],
  controllers: [PlatformController],
  providers: [CapabilityGuard],
  exports: [CapabilityGuard],
})
export class PlatformModule {}
```
Register `PlatformModule` in the `imports` array of `apps/api/src/app.module.ts` (feature-module list, near `OrgsModule`).

**Failing test first** — `apps/api/src/platform/tests/capability.guard.spec.ts` (unit; no HTTP, no DB — mirror `concerns.controller.spec.ts`'s construct-and-mock style):
- Mock `@pathway/platform` so `orgHasCapability` is a `jest.fn()`.
- Build a fake `ExecutionContext`, a `Reflector` stub returning the required capability, and a `PathwayRequestContext` stub with `currentOrgId`.
- Cases: (a) no metadata → `true`; (b) `orgHasCapability` → `true` → `true`; (c) → `false` → rejects `ForbiddenException`; (d) `currentOrgId` null → rejects `ForbiddenException`.

Plus **`apps/api/src/platform/tests/platform.controller.spec.ts`** (unit): mock `getOrgCapabilities`, `new PlatformController()`, assert `capabilities("o1")` returns `{ capabilities: [...] }` and forwards `orgId`.

**Rollback:** delete `apps/api/src/platform/`; remove the one line in `app.module.ts`. Nothing depends on it outside this PR.

---

## PR 2.2 — Capability-driven admin navigation (additive)

**Scope:** admin nav items gain an optional `capability?`; the filter requires role (unchanged) **and** capability (when present). No item gets a `capability` value yet — this builds the mechanism Phase 4 is the first consumer of. Depends on PR 2.1's endpoint.

**`apps/admin/lib/api-client.ts`** (E) — add a fetch wrapper mirroring `fetchOrgOverview` (plain `fetch` + `buildAuthHeaders()` + `!res.ok` throw; no react-query/SWR in this codebase):
```ts
export async function fetchOrgCapabilities(): Promise<string[]> {
  if (isUsingMockApi()) return [];
  const res = await fetch(`${API_BASE_URL}/platform/capabilities`, {
    headers: buildAuthHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to fetch capabilities: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { capabilities: string[] };
  return json.capabilities ?? [];
}
```

**`apps/admin/lib/access.ts`** (E) — add a pure, testable predicate (keeps logic out of the React component so it tests like `meetsAccessRequirement`):
```ts
export function hasCapability(
  capabilities: string[],
  required: string | undefined,
): boolean {
  if (!required) return true;
  return capabilities.includes(required);
}
```

**`apps/admin/lib/use-admin-access.ts`** (E) — fetch capabilities alongside the existing roles fetch; return `capabilities: string[]`. Follows the `hasFamilyAccess`/`hasServeAccess` precedent of exposing derived access off this one hook. Default to `[]` on error/loading so nav degrades to role-only (identical to today, since no item carries a capability yet).

**`apps/admin/app/admin-shell.tsx`** (E) — two edits:
1. Extend the local nav-item type (do **not** touch the shared `@pathway/ui` `SidebarNavItem`): `const navItemsWithAccess: (SidebarNavItem & { access?: AccessRequirement; capability?: string })[] = [ … ]` (unchanged entries).
2. Pull `capabilities` from `useAdminAccess()` (alongside `role`, `currentOrgIsMasterOrg`) and extend the filter (`:284–292`):
```tsx
const visibleNavItems = React.useMemo(
  () =>
    navItemsWithAccess.filter(
      (item) =>
        meetsAccessRequirement(role, item.access, { currentOrgIsMasterOrg }) &&
        hasCapability(capabilities, item.capability),
    ),
  [role, currentOrgIsMasterOrg, capabilities],
);
```
(`hasCapability`/`capabilities` imported from `@/lib/access` and the hook.)

**Failing test first** — extend `apps/admin/lib/access.test.ts` (the pure-function suite; `admin-shell.nav.test.ts` is a source-regex test and is the wrong place): `hasCapability(["finance.invoices"], "finance.invoices") === true`; `hasCapability([], "finance.invoices") === false`; `hasCapability([], undefined) === true` (item without a capability stays visible).

**Rollback:** revert the filter change; every item is capability-less today, so behaviour is identical until Phase 4 sets a `capability` value.

---

## PR 2.3 — Org Settings: Vertical section

**Scope:** Org Settings (`apps/admin/app/settings/page.tsx`) gains a "Vertical" section — current vertical, a change action, and a preview of a candidate vertical's capabilities before switching (dev-doc §9). Today sector is shown read-only there (`page.tsx:364–368`); this graduates it to an editable card.

**`packages/platform/src/index.ts`** (E) — export the maps so the API can serve the candidate preview:
```ts
export * from "./capability-maps";
```
(The admin frontend still can't import `@pathway/platform`; the preview comes over HTTP via the endpoint below.)

**`apps/api/src/platform/platform.controller.ts`** (E) — pure map-lookup endpoint (no DB, no org state), validating the param with a local `isVertical` guard mirroring `isOrgSector`:
```ts
// module-level helper, mirrors isOrgSector at webhook.controller.ts:43
import { Vertical } from "@pathway/db";
export function isVertical(value: string | undefined): value is Vertical {
  return !!value && (Object.values(Vertical) as string[]).includes(value);
}

@Get("verticals/:vertical/capabilities")
verticalCapabilities(@Param("vertical") vertical: string): { capabilities: Capability[] } {
  if (!isVertical(vertical)) throw new BadRequestException("Unknown vertical");
  return { capabilities: VERTICAL_CAPABILITIES[vertical] };
}
```
(`VERTICAL_CAPABILITIES` imported from `@pathway/platform` after the barrel export above; `AuthUserGuard` already applies at class level.)

**`apps/api/src/orgs/orgs.service.ts`** (E) — a `changeVertical` method mirroring `updateCurrentOrg` (`:300–330`: validate org exists → mutate). Vertical is 1:1 per org (Phase 1's unique `orgId`), so **upsert**:
```ts
async changeVertical(orgId: string, vertical: Vertical) {
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new NotFoundException("Organisation not found");
  return prisma.orgVertical.upsert({
    where: { orgId },
    create: { orgId, vertical },
    update: { vertical },
  });
}
```
(`Vertical` added to the existing `import { prisma, type OrgSector } from "@pathway/db"`.) Also **include the vertical in org reads** so `fetchOrgOverview` receives it: add `orgVertical: { select: { vertical: true } }` to the `select` in `getBySlug`/`list`, and map to a `vertical` field on the org DTO.

**Endpoint** — expose change-vertical on `OrgsController` next to the existing `PATCH /orgs/current` (`updateOrgProfile`, "ORG_ADMIN only"): `PATCH /orgs/current/vertical`, body `{ vertical: string }`, validated with `isVertical`, ORG_ADMIN-gated by **copying the exact guard the existing `PATCH /orgs/current` route uses** (confirm at implementation — do not invent a new guard).

**`apps/admin/lib/api-client.ts`** (E):
- Add `AdminVertical` + `VERTICAL_LABELS` mirroring `AdminOrgSector`/`ORG_SECTOR_LABELS` (:443–450) — the 7 values from `packages/types/src/vertical.ts`.
- Add `vertical?: AdminVertical | null` to `ApiOrg`, `AdminOrgOverview`, and `mapApiOrgToAdmin`.
- Add `updateOrgVertical(vertical: AdminVertical): Promise<AdminOrgOverview>` mirroring `updateOrgProfile` (PATCH `/orgs/current/vertical`).
- Add `fetchVerticalCapabilities(vertical: AdminVertical): Promise<string[]>` (GET `/platform/verticals/:vertical/capabilities`) for the preview.

**`apps/admin/app/settings/vertical-settings-card.tsx`** (N) — prop-driven card mirroring `parent-portal-settings-card.tsx`. Props contract:
```ts
type VerticalSettingsCardProps = {
  vertical: AdminVertical | null;
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  previewCapabilities: string[] | null;   // candidate preview, null until a candidate is picked
  onPreview: (candidate: AdminVertical) => void;
  onSave: (vertical: AdminVertical) => void;
};
```
Renders current vertical via `VERTICAL_LABELS`, a `<select>` over the 7 verticals, the `previewCapabilities` list, and a Save button (disabled when `!canEdit || isSaving`). Same `<Card>`/`Badge`/muted-text idioms as the parent-portal card.

**`apps/admin/app/settings/page.tsx`** (E) — add `vertical` to the `fetchOrgOverview` result handling, `savingVertical`/`verticalSaveError`/`verticalPreview` state, `handlePreviewVertical` (calls `fetchVerticalCapabilities`) and `handleChangeVertical` (calls `updateOrgVertical`, then `setOrg`), and drop `<VerticalSettingsCard … />` into the `md:grid-cols-2` grid next to the parent-portal card. Reuse the existing `canPerform("settings:edit-org", role)`/`canEditOrg` gate.

**Failing test first:**
- API e2e (`apps/api/src/orgs/tests/*.e2e.spec.ts`, mirror `concerns.e2e.spec.ts`; **test DB only**): PATCH the vertical for a seeded org, assert exactly one `OrgVertical` row (upsert, not duplicate — Phase 1's unique `orgId`), then assert `GET /platform/capabilities` reflects the new vertical's grants (no stale cache).
- API unit for the preview endpoint: `verticalCapabilities("CHURCH")` returns the map entry; unknown vertical → `BadRequestException`.
- `changeVertical` service unit (mock `@pathway/db`): upsert called with `{ where:{orgId}, create:{orgId,vertical}, update:{vertical} }`; missing org → `NotFoundException`.

**Rollback:** revert the card/endpoint/service method; `OrgVertical` rows written in testing are valid data (or revert to the backfilled value). The barrel export is inert on its own.

---

## PR 2.4 — Org Settings: Modules section + non-production toggle

**Scope:** a Modules section listing every module with status/expiry/billing-source, and a toggle that **only functions in non-production, enforced server-side** (dev-doc §9 — must fail closed on a direct API call in production, not merely hide a button).

**`apps/api/src/platform/platform.controller.ts`** (E) — two endpoints. List is an auth-gated read; toggle is auth-gated **and** environment-gated server-side:
```ts
@Get("modules")
async modules(@CurrentOrg("orgId") orgId: string) {
  return { modules: await prisma.orgModule.findMany({ where: { orgId } }) };
}

@Post("modules/toggle")
async toggleModule(
  @CurrentOrg("orgId") orgId: string,
  @Body() body: { module: string; active: boolean },
) {
  if (process.env.NODE_ENV === "production") {
    throw new ForbiddenException("Module toggling is disabled in production");
  }
  if (!isModule(body.module)) throw new BadRequestException("Unknown module");
  return prisma.orgModule.upsert({
    where: { orgId_module: { orgId, module: body.module } },
    create: { orgId, module: body.module, status: body.active ? "ACTIVE" : "CANCELLED" },
    update: { status: body.active ? "ACTIVE" : "CANCELLED" },
  });
}
```
`isModule` is a local guard mirroring `isVertical`/`isOrgSector` (`Object.values(Module).includes`). The prod check runs **before** any write (the `AuthUserGuard:101,158` `process.env.NODE_ENV === "production"` branch is the runtime precedent). Intentionally a plain in-handler check, not a Nest guard, so the 403 is unmistakably tied to the write path.

**`apps/admin/lib/api-client.ts`** (E) — `AdminModule` + `MODULE_LABELS` (the 8 modules), `fetchOrgModules()`, `toggleOrgModule(module, active)`.

**`apps/admin/app/settings/modules-settings-card.tsx`** (N) — prop-driven card mirroring the parent-portal card. Lists all 8 modules (static catalogue) joined with the org's rows (status/expiry). The toggle control is shown only when a client-side non-prod flag is set (`process.env.NEXT_PUBLIC_ENV !== "production"` or equivalent) **for UX**, but correctness rests on the server check. Props contract:
```ts
type ModulesSettingsCardProps = {
  modules: { module: AdminModule; status: string | null; expiresAt: string | null }[];
  canToggle: boolean;      // non-prod env AND role
  isLoading: boolean;
  savingModule: AdminModule | null;
  error: string | null;
  onToggle: (module: AdminModule, active: boolean) => void;
};
```

**`apps/admin/app/settings/page.tsx`** (E) — modules state + `handleToggleModule` (calls `toggleOrgModule`, refetches) + `<ModulesSettingsCard … />` in the grid.

**Failing test first** — the test that would have caught a UI-only safeguard (mirror `concerns.e2e.spec.ts`; save/set/restore `process.env.NODE_ENV`):
```ts
const prev = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
// POST /platform/modules/toggle → expect 403
process.env.NODE_ENV = prev; // restore in finally/afterEach
```
Plus a non-prod case asserting the toggle succeeds and writes `OrgModule`, and `isModule` rejects an unknown module string.

**Rollback:** revert the endpoints + card section; in production this PR is inert (toggle 403s) until Phase 3's billing-driven activation exists.

---

## PR 2.5 — Version bump `2.2.0`

**Scope:** bump the product version to match the roadmap (Phase 2 ships as `2.2.0`).

**Key files:**
- Root `package.json` — `"version": "2.0.1"` → `"2.2.0"`.
- `packages/util/src/version.ts` — `APP_VERSION = "2.0.1"` → `"2.2.0"`.

**Failing test first:** update the existing version assertions that pin `2.0.1` — `apps/admin/app/admin-shell.version.test.ts` and the health-controller version check (grep `"2.0.1"` / `2\.0\.1` across `apps` + `packages` and update each expectation). The `/health` handler and web/admin footers read `APP_VERSION`, so bumping the constant flows through; the tests prove the surfaced value changed.

**Release note (human/CI, not a code change):** tag `v2.2.0` + GitHub release. **Flag:** Phase 1's `v2.1.0` never landed — either cut it retroactively from Phase 1's merge commit or note the jump `2.0.1 → 2.2.0` in the `v2.2.0` release body. Out of scope for the PR diff.

**Rollback:** revert the two constants + test expectations.

---

## Acceptance criteria

- [ ] `CapabilityGuard` + `@RequireCapability` exist; guard unit test covers ungated / has-capability / lacks-capability / no-org (PR 2.1).
- [ ] `GET /platform/capabilities` returns the correct union for the current org over HTTP (PR 2.1) — the same data Phase 1 PR 1.5 unit-tested, now proven reachable.
- [ ] Admin nav items can carry an optional `capability`; the filter requires role **and** capability. No existing item's visibility changes (none carry a capability yet) (PR 2.2).
- [ ] Org Settings shows the current vertical, changes it (upsert, no duplicate row), and previews a candidate vertical's capabilities before committing (PR 2.3).
- [ ] Org Settings shows every module's state; the toggle is **server-rejected (403) in production**, not merely hidden (PR 2.4).
- [ ] Product version reads `2.2.0` in `/health` and the admin footer (PR 2.5).
- [ ] Zero mobile diffs; no legacy sector guard removed (there wasn't one).

## Open decisions (flagged, non-blocking)

1. **ORG_ADMIN gating of `PATCH /orgs/current/vertical`** — copy the exact guard on the existing `PATCH /orgs/current` route; confirm its name at implementation (not grounded to the guard level in this pass).
2. **Whether `changeVertical` should also seed `OrgModule` rows** — no; Phase 1 decided module backfill is a deliberate no-op, and Phase 3's billing path is the only writer of module entitlement. The non-prod toggle (PR 2.4) is the only Phase 2 writer.
3. **Vertical through the checkout webhook** (`webhook.controller.ts:502`) — deferred to Phase 5's configurator scoping; not needed for Phase 2.
