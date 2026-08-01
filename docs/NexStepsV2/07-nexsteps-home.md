# Phase 7 — NexSteps Home

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.7.0` (tag `v2.7.0`)
**Depends on:** Phase 1 (vertical/capability engine), Phase 4 (Learning module — the household dashboard's core content).
**Blocks:** Phase 8 (Community is opt-in *between* NexSteps Home households).

---

## Goal

Ship NexSteps Home as a Home-Education vertical + plan + family surface on the same codebase, per decision D1: reuse the CEE vertical's already-designed TEACH Hub / Family Hub thinking rather than redesigning a sister product from scratch.

## Approved product and UX contract

The mandatory implementation entry point is
[`nexsteps-home/README.md`](nexsteps-home/README.md). Its approved product
contract, 76-screen inventory, implementation map and runnable prototype
supersede the old hardcoded Family Space mockup as the user-experience target.

The prototype is a reference, not production React Native code. Implement each
small slice with the existing Expo, API, tenant, storage, capability and audit
patterns. The merge-safe slice order is defined in
[`nexsteps-home/implementation-map.md`](nexsteps-home/implementation-map.md).

## Grounding: what already exists to reuse

- **`Child`, `ChildGuardianContact`, and the `ParentChildren` relation already model a household's core data**, tenant-scoped: `Child` (`schema.prisma:577-616`) belongs to a `Tenant`, has `guardians: User[] @relation("ParentChildren")` (an implicit many-to-many, not a standalone join model — more precise than the CEE doc's phrasing of it as "`ParentChildren`" model) and a separate `ChildGuardianContact` model (552-572, PII-encrypted fields per `packages/db/src/pii-encryption.ts`) for contact-specific detail. A homeschooling household's children and guardians fit this shape without any new model.
- **The mobile parent surface already exists as a static mockup**, confirmed unwired: `apps/mobile/app/(family)/(tabs)/home/index.tsx` — literally titled "Family Space" (`badge="Family Space"`, line 9), with sibling tabs `updates` and `account`. Grepped all three screens for `fetch|useQuery|axios|apiClient|useState|useEffect` — **zero matches**. Every value ("Ava Brown," "96% attendance," "Summer trip reminder") is hardcoded JSX. **This phase replaces that mockup incrementally with the approved NexSteps Home experience and real APIs**; it must not layer more hardcoded content onto the old screen.
- **The CEE package already designed this exact surface** (`docs/cee-vertical/01-architecture-overview.md:7-12,36-62,122-130`): Family Hub as "the parent visibility layer" and TEACH Hub as "the parent-led home-education operating system," with a mapping table entry: *"TEACH household → Org + Tenant, gap: Add `orgType = TEACH_HOUSEHOLD`; lighter surface"*.
- **The CEE package already flagged, and deliberately left open, the exact household-modeling question this phase needs answered**: `docs/cee-vertical/02-multi-tenancy-and-scalability.md:16-17` — "either one Org with many household Tenants, or one lightweight Org per household" — and `docs/cee-vertical/07-delivery-roadmap-and-decisions.md:97` lists it as an unresolved open decision there too. **This phase inherits that same unresolved question rather than re-litigating it** — see Open Decision 2.

## Current state (grounded, R/E/N)

| File / model | Current state | R/E/N |
|---|---|---|
| `packages/db/prisma/schema.prisma:577-616` (`Child`) | Tenant-scoped, `guardians: User[]` relation, PII-encrypted fields | R |
| `packages/db/prisma/schema.prisma:552-572` (`ChildGuardianContact`) | Tenant-scoped, PII-encrypted contact detail | R |
| `apps/mobile/app/(family)/(tabs)/home/index.tsx`, `updates/index.tsx`, `account/index.tsx` | Static mockup, zero data-fetching, confirmed by grep | E (first real wiring) |
| `apps/mobile/app/(family)/_layout.tsx`, `(family)/(tabs)/_layout.tsx` | Route group scaffold | R |
| `apps/mobile/src/components/navigation/family-bottom-nav.tsx` | Bottom tab bar for this route group | E (Phase 2 PR 2.1's capability-gating pattern applies here too, if any tab should be conditional) |
| `docs/cee-vertical/01-architecture-overview.md`, `02-multi-tenancy-and-scalability.md`, `07-delivery-roadmap-and-decisions.md:97` | Design + the still-open household-modeling question | R |
| Phase 4's Learning module | `Subject`/`LearningLog`/`Evidence`/`ReportBundle` | R (the household dashboard's actual content) |
| Phase 1's `Vertical` enum (7 values, none for Home Education yet) | | E |

---

## PR breakdown

### PR 7.1 — `HOME_EDUCATION` vertical + capability map

**Scope:** Add the 8th `Vertical` value and its capability grant (core + Learning capabilities — no other module implied by default).

**Key files:**
- `packages/db/prisma/schema.prisma` (E) — add `HOME_EDUCATION` to `Vertical`.
- `packages/types/src/vertical.ts` (E, Phase 1 PR 1.6) — add the corresponding entry to `VERTICAL_LABELS`/`VERTICAL_OPTIONS`.
- `packages/platform/src/capability-maps.ts` (E) — `Vertical.HOME_EDUCATION → [...core capabilities, "learning.log.read", "learning.log.write", ...]` — i.e. Home-Education orgs get Learning capabilities granted by their *vertical*, not requiring a separate module purchase, since Learning is core to what the product is for a home-ed household (contrast with a School org, which needs the Learning *module* purchased separately).

**Failing test first:** the Phase 1 completeness test now covers `HOME_EDUCATION`; a resolver test confirming a `HOME_EDUCATION`-vertical org has `learning.log.write` without any `OrgModule` row at all (vertical-granted, not module-granted).

**Rollback:** revert the enum value and map entry together (one migration).

---

### PR 7.2 — NexSteps Home plan

**Scope:** Add a plan/price tier for NexSteps Home households, following the exact same catalogue + `STRIPE_PRICE_MAP` pattern established in Phase 0.

**Decision (resolved 1 Aug 2026, product):** two tiers, Free and Paid. Paid unlocks the ability to create Community groups, expanded AI feature usage, and further capabilities to be specified as they're built. No in-app checkout — upgrade is an external link to https://nexsteps.dev; entitlement flips by whatever mechanism that surface uses (webhook or manual), not a Buy Now flow in this app. Price point for the Paid tier is not yet set.

**Scope note:** the institutional `PLAN_CATALOGUE`/`PLANS` catalogue (`packages/pricing/src/catalog.ts`, `apps/api/src/billing/billing-plans.ts`) is shaped around church/school Buy Now self-serve (`av30Included`, `maxSitesIncluded`, feature bullet lists for that audience) and doesn't fit a household product. Implementing NexSteps Home's Free/Paid catalogue entries there would force an ill-fitting shape for no consumer yet — deferred to whichever plan actually builds the upgrade link and entitlement flip (expected around Plan 08, Family/settings/billing), when the real UI reveals what a household plan record needs to carry.

**Key files:** deferred — see scope note above.

**Failing test first:** same shape as Phase 0 PR 0.2's tests, for the new plan code.

**Rollback:** same as Phase 0 PR 0.2 — revert the catalogue entries, no existing subscriber affected.

---

### PR 7.3 — Family surface + household dashboard

**Scope:** Deliver the first live household-dashboard slice from the approved NexSteps Home contract: real learning rhythm, learning logs (Phase 4), calendar and tasks. The remaining approved screens are delivered through the independent H2–H7 slices in the implementation map, not folded into one large PR.

**Key files:**
- `apps/mobile/app/(family)/(tabs)/home/index.tsx`, `updates/index.tsx`, `account/index.tsx` (E during migration) and additive Home/family routes from the approved implementation map (N) — replace hardcoded JSX with real data fetches while keeping rollback possible (confirm the idiomatic data-fetching pattern against a wired screen elsewhere in `apps/mobile`).
- New/extended API endpoints (N/E) surfacing a household's children's attendance, learning logs, and any relevant calendar/task data, capability-guarded per Phase 2's guard pattern.

**Failing test first:** integration test — a parent user in a `HOME_EDUCATION` org fetches their household dashboard data and sees their own children's real attendance/learning-log data, not the mockup's hardcoded names; a guard test confirming a parent can't see another household's data (tenant isolation, already enforced elsewhere in this codebase — this is a regression guard, not new isolation logic).

**Rollback:** revert the screen changes; the mockup reverts to static (a regression in functionality, not a crash — safe rollback).

---

### PR 7.4 — Household modelling

**Scope:** Decide and implement how a homeschooling family maps onto `Org`/`Tenant`.

**Decision (resolved 1 Aug 2026, product):** one lightweight `Org` per household — each family is its own independent Org with a single `Tenant`, matching how every other vertical works today. No new tenancy concept needed: a `HOME_EDUCATION`-vertical `Org` is created with one `Tenant`, same as any other single-site vertical's org creation. This resolves the open question inherited from the CEE package (`02-multi-tenancy-and-scalability.md:16-17`, `07-delivery-roadmap-and-decisions.md:97`).

**Key files:** depends entirely on which option is chosen — deferred until Open Decision 2 resolves. If "one Org per household" (matching how every other vertical works today — one Org per customer), no new tenancy concept is needed at all, just a `HOME_EDUCATION`-vertical `Org` with a single `Tenant`, which is the simplest option and the one that requires zero new modelling beyond PR 7.1. Recommend this as the default unless a concrete reason for the umbrella-Org model surfaces (e.g. a co-op of home-ed families wanting shared oversight, which is closer to what Phase 8's Community module is for anyway, not a tenancy concern).

**Failing test first:** depends on the decision; at minimum, a test confirming a `HOME_EDUCATION` org's single-`Tenant` household correctly resolves capabilities and household-dashboard data per PR 7.3's guard test.

**Rollback:** N/A until the decision is made and implementation starts.

---

## Acceptance criteria

- [ ] `Vertical.HOME_EDUCATION` exists with a capability map granting Learning capabilities at the vertical level (no module purchase required for a Home-Education org's own children).
- [ ] A NexSteps Home plan exists in the catalogue once pricing is decided.
- [ ] Implemented screen IDs from the approved inventory show real, tenant-isolated household data; the old hardcoded Family Space mockup is retired after equivalent live routes exist.
- [ ] Household-to-Org/Tenant modelling is decided and documented, not left as a silent assumption baked into code.

## Open decisions

1. Nothing new here beyond what's stated inline — both open decisions (NexSteps Home pricing, household modelling) are called out at their owning PR above (7.2, 7.4) rather than repeated.
2. **Household modelling** (PR 7.4) — recommend "one lightweight Org per household" as the default absent a concrete reason otherwise, since it needs zero new tenancy concept and matches every other vertical's existing one-Org-per-customer shape.
