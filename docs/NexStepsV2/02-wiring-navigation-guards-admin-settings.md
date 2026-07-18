# Phase 2 — Wiring: navigation, guards, admin settings

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.2.0` (tag `v2.2.0`)
**Depends on:** Phase 1 (`packages/platform` resolvers and the backfilled `OrgVertical`/`OrgModule` data must exist before anything can consume them).
**Blocks:** Phase 3 (module activation needs the Modules settings screen this phase builds), Phase 5 (configurator needs the capability-preview pattern this phase establishes), Phase 6 (cutover removes whatever this phase adds alongside the old logic).
**Detailed execution:** see [`02a-phase2-build-plan.md`](02a-phase2-build-plan.md) — verbatim code, endpoint shapes, settings-card contracts, and test bodies, grounded against the current repo.

---

## Goal

Make capabilities actually visible and enforced: navigation reads them, API guards check them, and Org Settings lets an admin see and (in non-production) change vertical/module state. This phase is where `packages/platform` stops being unused library code.

## Grounding finding that reshapes this phase

The dev doc frames this phase (§14 step 5, §15 Phase 4) as *replacing hardcoded sector/feature-flag checks* — implying a large, unknown call-site cleanup. Grounding found the opposite: **the current admin navigation has no sector-based gating to replace.**

`apps/admin/app/admin-shell.tsx:40-61` — `navItemsWithAccess`, a static array of 20 nav entries, each with an optional `access?: AccessRequirement` (role-based: `"staff-only"`, `"site-admin-or-higher"`, `"admin-only"`, `"billing"`, `"super-user"`, etc.). `visibleNavItems` (line 278-286) filters this array through `meetsAccessRequirement(role, item.access, { currentOrgIsMasterOrg })` from `apps/admin/lib/access.ts` — **role only, no sector or feature-flag branch anywhere in this file.** `apps/admin/lib/sector-visibility.ts` exists as a mechanism but is a confirmed no-op (`SECTOR_FEATURES` maps every sector to `{ placeholder: true }`, its own comment says "No sector currently hides or shows anything").

So this phase isn't a migration off legacy sector logic — that logic barely exists. It's **adding a new, second filter dimension (capability) alongside the existing role dimension**, which is exactly the boundary the dev doc's own open question flags (§17 Q4: "capabilities gate *what exists*; roles likely still gate *who can use it*"). Confirmed: yes, and today only the "who" half exists in navigation.

The full inventory of real hardcoded-sector call sites, grounded (not the "audit and discover" step the dev doc's §14 step 1 asks for — it's small enough to just list):

| File | What it does | Migration needed |
|---|---|---|
| `apps/admin/lib/sector-visibility.ts` | No-op placeholder, every key visible for every sector | Leave as-is or repurpose as the *vertical* visibility mechanism once product defines real rules — not blocking, since it does nothing today either way |
| `apps/admin/lib/api-client.ts:443-460,4185` | `AdminOrgSector` type (fourth copy of the sector union, alongside `schema.prisma`'s `OrgSector`, `packages/types`'s `Sector`, `apps/web/content/sectors.ts`'s `SectorId`), `ORG_SECTOR_LABELS`, used in org DTOs | Needs a parallel `AdminVertical` type + labels for the settings screens this phase builds (PR 2.x below) |
| `apps/api/src/orgs/orgs.service.ts:86,88,170` | Reads/writes `Org.sector` at org creation (`dto.org.sector as OrgSector`) | Needs the equivalent for vertical — likely writing `OrgVertical` in the same transaction once vertical is selectable at creation (Phase 5 configurator is the real UI for this; this phase just needs the service capable of accepting it) |
| `apps/api/src/billing/webhook.controller.ts:20,43-44,502` | `isOrgSector()` type guard validates `details.sector` from checkout/webhook payload before writing it | Validation guard, not a feature gate — needs an `isVertical()` equivalent if/when vertical flows through the same checkout metadata path (confirm during Phase 5, not required by this phase alone) |

No literal `sector === "..."` string comparisons exist anywhere in `apps/admin`, `apps/api`, `apps/web`, or `apps/mobile` (grepped, zero hits) — sector branching in this codebase has always gone through the enum/lookup-table shape, not scattered equality checks. That's good news: there's no large hidden inventory to discover.

## Current state (grounded, R/E/N)

| File | Current state | R/E/N |
|---|---|---|
| `apps/admin/app/admin-shell.tsx:40-61,278-286` | Static `navItemsWithAccess` + role-only `visibleNavItems` filter | E |
| `apps/admin/lib/access.ts` | `AdminRoleInfo`, `getAdminRoleInfoFromApiResponse()` — resolves role from `UserOrgRole`/`UserTenantRole`/`OrgMembership`/`SiteMembership` via `/auth/active-site/roles` | R (role and capability stay separate checks, composed together — not merged) |
| `apps/mobile/src/components/navigation/family-bottom-nav.tsx`, `serve-bottom-nav.tsx` | Bottom tab bars for the two mobile route groups (`(family)`, `(serve)`) — simpler, fixed tab sets, no per-item access system today (confirm exact shape during implementation; not grounded in as much depth as the admin shell for this pass) | E |
| `apps/admin/lib/sector-visibility.ts` | No-op, see above | R or E depending on Open Decision 1 below |
| `packages/platform` (Phase 1) | `getOrganisationCapabilities()`, `organisationHasCapability()` resolvers, fully tested, unconsumed | R |
| Org Settings screens (admin) | *(exact file location to confirm during implementation — expect an `apps/admin/app/settings/` or `apps/admin/app/(org)/settings/` route)* | E/N |

---

## PR breakdown

### PR 2.1 — Capability-driven navigation, additive

**Scope:** Add an optional `capability?: Capability` field to admin nav items and mobile tab items; extend the existing filter to require both the role check (unchanged) and the capability check (new) to pass. No existing nav item gets a `capability` value in this PR — there's nothing to gate yet (no module has shipped). This PR builds the mechanism Phase 4 (Learning) is the first real consumer of.

**Key files:**
- `apps/admin/app/admin-shell.tsx` (E) — `navItemsWithAccess`'s type gains `capability?: Capability`; `visibleNavItems` becomes `navItemsWithAccess.filter(item => meetsAccessRequirement(...) && (!item.capability || hasCapability(item.capability)))`, where `hasCapability` is a new small hook/helper backed by `organisationHasCapability()` (client-side: the admin app almost certainly needs a capabilities-for-current-org fetch, likely a new endpoint — see PR 2.2).
- `apps/mobile/src/components/navigation/family-bottom-nav.tsx`, `serve-bottom-nav.tsx` (E) — same additive pattern once their current shape is confirmed.
- `packages/platform/src/capabilities.ts` (R) — resolver already exists from Phase 1; this PR is purely about consuming it.

**Failing test first:** extend `apps/admin/app/admin-shell.nav.test.ts` (the existing nav test file, confirmed present) with a case: a nav item with `capability: "finance.invoices"` is hidden when the org lacks that capability and shown when it has it, independent of role.

**Rollback:** revert the filter change; every nav item is capability-less today, so behaviour is identical to pre-PR until Phase 4 actually sets a `capability` value on something.

---

### PR 2.2 — API route guards

**Scope:** Add a capability-checking guard (NestJS guard, matching the existing role-guard pattern in `apps/api`) that route handlers can opt into, and expose a "my org's capabilities" endpoint for the frontend to consume in PR 2.1.

**Key files:**
- `apps/api/src/platform/` (N, new NestJS module) — `CapabilityGuard` (or similar, following whatever the existing role-guard is named — confirm exact pattern during implementation, likely near `apps/api/src/auth/`), `GET /platform/capabilities` endpoint returning `getOrganisationCapabilities(orgId)` for the current org.
- No existing guard is replaced — grounded above, there isn't a sector-based API guard to replace, only role guards, which stay as-is and compose with the new capability guard exactly like the nav filter does.

**Failing test first:** e2e test hitting a capability-guarded test route with and without the required capability, asserting 200 vs 403.

**Rollback:** revert the new module; nothing depends on it outside this PR's own test route.

---

### PR 2.3 — Org Settings: Vertical section

**Scope:** Org Settings gains a "Vertical" section — current vertical, a change-vertical action, and a preview of what capabilities a candidate vertical would grant before switching (dev-doc §9).

**Key files:**
- New settings screen/route in `apps/admin/app/` (N, exact path TBD at implementation — confirm alongside whatever the current Org Settings route structure is).
- `apps/admin/lib/api-client.ts` (E) — add `AdminVertical` type + `VERTICAL_LABELS`, mirroring `AdminOrgSector`/`ORG_SECTOR_LABELS` exactly (same pattern, one more parallel copy — consistent with this codebase's existing style even if it's a duplication smell; not this phase's job to centralize).
- `apps/api/src/orgs/orgs.service.ts` (E) — add a "change vertical" method, writing `OrgVertical` (upsert, since Phase 1's model is 1:1 per org).
- `packages/platform/src/capability-maps.ts` (R) — read-only, used for the "preview capabilities for candidate vertical" feature (just look up the map entry, no resolver call needed since it's a hypothetical, not the org's actual state).

**Failing test first:** e2e test — change an org's vertical via the new endpoint, confirm `OrgVertical` is updated (not duplicated, given the unique constraint from Phase 1 PR 1.2) and `getOrganisationCapabilities()` reflects the new vertical's grants immediately after (no stale cache).

**Rollback:** revert the new screen/endpoint/service method; `OrgVertical` rows written during testing can be left (they're valid data) or reverted via the org's original backfilled value.

---

### PR 2.4 — Org Settings: Modules section + non-production toggle

**Scope:** Every available module, with status/purchase date/expiry/billing source, and a toggle that **only functions in non-production environments** (dev-doc §9's explicit safety requirement — the toggle must fail closed in production, not just be hidden by a UI flag that a direct API call could bypass).

**Key files:**
- Same new settings screen area as PR 2.3 (E) — Modules section.
- `apps/api/src/platform/` module (E, from PR 2.2) — a "toggle module" endpoint that checks `process.env.NODE_ENV !== "production"` **server-side** before writing `OrgModule`, not just a client-side hidden button. This is the exact shape of safety check the dev doc calls out (§9: "fails safely if someone tries to hit the endpoint directly in production").

**Failing test first:** e2e test asserting the toggle endpoint returns 403 (or equivalent) when `NODE_ENV=production`, and succeeds when it isn't — the test that would have caught a UI-only safeguard.

**Rollback:** revert the endpoint and screen section; in production, this PR is inert until Phase 3's real billing-driven activation path exists anyway.

---

## Acceptance criteria

- [ ] Admin nav items can carry an optional `capability`; the filter requires role **and** capability (when present) to pass. No existing nav item's visibility changes as a result of this phase (none carry a `capability` yet).
- [ ] A capability-guarded API route returns 403 without the capability, 200 with it.
- [ ] Org Settings shows the org's current vertical, supports changing it, and previews a candidate vertical's capabilities before committing.
- [ ] Org Settings shows every module's state; the toggle is a no-op (server-rejected, not just hidden) in production.
- [ ] `GET /platform/capabilities` (or equivalent) returns the correct union for a test org with a vertical and a mix of active/expired modules — this is the same test data Phase 1 PR 1.5 already covers; this phase just proves it's reachable over HTTP.

## Open decisions

1. **What to do with `apps/admin/lib/sector-visibility.ts`** — leave the no-op as dead-but-harmless code (Karpathy: don't touch unrelated pre-existing code without need), or repurpose it into the real vertical-visibility mechanism this phase needs anyway. Recommend repurposing, since PR 2.3 needs a "does vertical X show feature Y" lookup and this file is already shaped for exactly that — but flagged as a call for whoever implements this phase, since it does touch a file outside this phase's stated scope.
2. **Exact mobile bottom-nav gating mechanism** (PR 2.1) — not grounded to the same depth as the admin shell in this pass; confirm `family-bottom-nav.tsx`/`serve-bottom-nav.tsx`'s current structure before writing the PR's real diff.
3. **Whether vertical selection flows through the checkout webhook** the way `sector` does today (`webhook.controller.ts:502`) — relevant to whether `isVertical()` needs to exist in that file, or whether Phase 5's configurator sets vertical through a different path entirely (e.g. directly via the Org Settings endpoint from PR 2.3, immediately after checkout redirects). Confirm when Phase 5 is scoped.
