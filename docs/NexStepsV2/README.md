# NexSteps 2.0 — Phase Plans

Owner: Faithful Software Solutions (FSS) / NexSteps
Status: Design (docs only, no production code)
Base platform: `pathway` monorepo (NexSteps core)
Last updated: 2026-07-17

This folder holds the PR-level build plan for **NexSteps 2.0**: taking the platform from its current four-tier, hardcoded-sector state to the Core → Vertical → Capabilities → Modules architecture described in `nexsteps-platform-architecture-dev-doc.md`, plus a **NexSteps Home** sister product and a built-in **Community** module.

It decomposes that dev doc's monolithic Phase 0–8 sequence into small, independently shippable PRs, each with a concrete scope, the files it touches, the failing test that defines "done," and a rollback note. It also fixes the two gaps the dev doc left open: there was no pricing foundation to build on (the live tiers don't match the target tiers, see D7 below) and no versioning discipline.

Every phase doc in this set was grounded against the actual repo, not written from the dev doc's assumptions alone. Where the dev doc's "Current state" section (its own Section 3) turned out to be wrong or incomplete, the phase docs below correct it and say so.

---

## How to read this package

| # | Document | What it answers |
|---|----------|-----------------|
| - | `README.md` (this file) | Navigation, versioning approach, roadmap, decision log, PR convention, lineage map |
| - | `nexsteps-platform-architecture-dev-doc.md` (existing, v1.1) | The original target-architecture dev doc — kept as the architecture reference. Phase docs cross-link into its sections rather than repeating them |
| 00 | `00-foundation-versioning-and-plans.md` | Product version plumbing + four-tier pricing migration + add-on removal |
| 01 | `01-platform-engine-data-model-and-resolvers.md` | Vertical/Module enums + models, `packages/platform`, capability maps, resolvers, backfill |
| 02 | `02-wiring-navigation-guards-admin-settings.md` | Capability-driven navigation, sector-check migration, Org Settings vertical/module sections |
| 02a | `02a-phase2-build-plan.md` | Detailed, no-guesswork Phase 2 execution plan — verbatim guard/endpoint/service code, settings-card contracts, and test bodies per PR |
| 03 | `03-billing-integration.md` | Stripe products for the 4 plans + 8 modules + storage, hardened webhook, module activation |
| 04 | `04-learning-module.md` | The Learning module — first real module, reference implementation for the module pattern |
| 05 | `05-configurator-and-imagery.md` | The Apple-style "select your profile" purchase configurator + per-vertical/module imagery |
| 06 | `06-cutover.md` | Removing legacy sector checks, feature-flag entitlement, and the old pricing/buy pages |
| 07 | `07-nexsteps-home.md` | The Home-Education vertical + NexSteps Home plan + family surface |
| 08 | `08-community.md` | The built-in cross-family community — last, because it crosses tenant boundaries |

Each phase doc contains: a status header, the phase goal, its dependencies on prior phases, a grounded current-state note using the R/E/N legend below, the PR breakdown, acceptance criteria, and open decisions flagged for a human to resolve before that phase starts.

### R/E/N legend

Used in every phase doc's "current state" section to say, for each real file or model referenced, what the phase does to it:

- **R — Reuse.** Read or depended on as-is. No changes.
- **E — Extend.** Existing file/model gets new fields, cases, or call sites added. Existing behaviour for existing callers is preserved.
- **N — New.** File, model, or module does not exist yet and is created by this phase.

---

## Product versioning approach

NexSteps 2.0 introduces one product version, distinct from this doc set's absence of per-document version headers (the docs describe PRs; they aren't versioned artifacts themselves, matching this repo's existing `docs/cee-vertical/` convention).

- **Source of truth:** root `package.json`, which today (grounded: checked 2026-07-17) has **no `version` field at all** — only `name`, `private`, `packageManager`, `scripts`, `dependencies`. Phase 0 adds `"version": "2.0.1"`.
- **Re-exported as `APP_VERSION`** from `packages/util` (`packages/util/src/index.ts`). Not `packages/config` — that package is an unimplemented stub today (no `src/` directory; its `build`/`lint`/`test` scripts literally `echo` a placeholder string). `packages/util` has real source (`crypto.ts`, `index.ts`) and a working Jest setup, so it's the only one of the two that can host a consumed constant right now.
- **Surfaced in:**
  - `apps/api/src/health/health.controller.ts` — its `ok()` handler currently returns `{ status: "ok", dbTime }` with no version field; Phase 0 adds one.
  - Web and admin footers (new, small components).
- **Bump rule:** Phase 0 ships as `2.0.1`. Each feature phase (1–8) bumps the minor. The roadmap table below is the source of truth for which phase ships as which version.
- **Release mechanics:** annotated git tags (`v2.0.1`, `v2.1.0`, …) with the GitHub release notes body. **No `CHANGELOG.md` file** — the release notes are the changelog.
- The dev doc's own revision marker ("Version: 1.1" in its header) is a *document* revision, unrelated to the product version above. It is not renumbered by this work.

---

## Roadmap

| Phase | Doc | Ships as | Git tag | Summary |
|---|---|---|---|---|
| 0 | `00-foundation-versioning-and-plans` | 2.0.1 | `v2.0.1` | Product version plumbing + four-tier plans + remove SMS & Active People add-ons |
| 1 | `01-platform-engine-data-model-and-resolvers` | 2.1.0 | `v2.1.0` | Vertical/Module/enums + models, `packages/platform`, capability maps, resolvers, backfill |
| 2 | `02-wiring-navigation-guards-admin-settings` | 2.2.0 | `v2.2.0` | Capability-driven navigation, sector-check migration, Org Settings vertical/module sections |
| 3 | `03-billing-integration` | 2.3.0 | `v2.3.0` | Stripe products for 4 plans + 8 modules + storage, hardened webhook, module activation |
| 4 | `04-learning-module` | 2.4.0 | `v2.4.0` | Learning module (Subject/LearningLog/Evidence/ReportBundle) — first real module |
| 5 | `05-configurator-and-imagery` | 2.5.0 | `v2.5.0` | Apple-style "select your profile" configurator + per-vertical/module imagery |
| 6 | `06-cutover` | 2.6.0 | `v2.6.0` | Remove legacy sector checks, feature-flag entitlement, old pricing/buy pages |
| 7 | `07-nexsteps-home` | 2.7.0 | `v2.7.0` | Home-Education vertical + NexSteps Home plan + family surface |
| 8 | `08-community` | 2.8.0 | `v2.8.0` | Built-in community (opt-in directory, channels/threads, meetups) — last |

**Dependency spine:** 0 → 1 → 2 → 3 feeds everything downstream. 4 (Learning) must land before 7 (Home reuses it). 5 (configurator) needs 1 (capabilities) and 3 (Stripe products) done. 6 (cutover) waits until 5 has run one full billing cycle in production. 7 before 8.

---

## Decision log

Decisions made in the planning session that produced this doc set, plus decisions the repo grounding forced.

| # | Decision | Choice | Where |
|---|---|---|---|
| D1 | NexSteps Home shape | Home-Education **vertical + plan + family surface + Community module**, same codebase, reusing the CEE TEACH Hub / Family Hub design (`docs/cee-vertical/01-architecture-overview.md`) | 07, 08 |
| D2 | CEE features adopted | **Minimal**: Learning module + Community module only. Network tier, Postgres RLS, ABAC, Merit/rewards, the parent-portal publishing gate, and region pinning stay CEE-specific and are not built here | 04, 07, 08 |
| D3 | Pricing / limits | Dev-doc target figures: Starter £49/250, Growth £99/750, Professional £149/2,000, Enterprise custom/unlimited | 00 |
| D4 | Versioning | Product semver in API `/health` + web/admin footers, plus git tags + GitHub releases. **No** `CHANGELOG.md`, **no** per-doc version headers | 00 |
| D5 | Existing customers | Grandfathered on their current plan definitions; new signups get the new pricing; existing users migrate later via an upgrade flow (not built in this doc set) | 00 |
| D6 | Capability grants | Config-driven (dev-doc's own recommendation): static TypeScript maps of `Vertical -> Capability[]` and `Module -> Capability[]` in `packages/platform` | 01 |
| D7 | **Tier-name collision (grounding finding)** | Today's live `STARTER_MONTHLY`/`GROWTH_MONTHLY` plan codes (£149/50 AV30 and £399/200 AV30 by catalogue default) are **not** the same product as the target "Starter" (£49/250) and "Growth" (£99/750) — they only share a tier label. Phase 0 must introduce **new plan codes** for the four target tiers rather than repricing the existing codes in place, so grandfathered subscriptions keep resolving against their original definition | 00 |
| D8 | `APP_VERSION` location (grounding finding) | `packages/util`, not `packages/config` — `packages/config` has no `src/` and stub scripts today; `packages/util` is a real, tested package | 00 |
| D9 | **Stripe is the price authority, not the catalogue (grounding finding)** | `packages/pricing`/`billing-plans.ts`/`plan-info.ts` prices are display **fallbacks** only. The amount actually charged comes from a `STRIPE_PRICE_MAP` env var mapping each plan/add-on code to a Stripe Price ID (`apps/api/src/billing/billing-provider.config.ts`); checkout throws if a code has no entry. Introducing the four new tiers therefore has an operational half (create Stripe Prices, add them to the env var per environment) that no code PR alone can complete | 00 |

---

## Small-PR convention

Every PR in every phase doc states, in this order: **scope** (one sentence), **key files** (real paths, R/E/N tagged), **the failing test that defines done** (written first, per this repo's TDD discipline — `.env.test`, Jest, `apps/api/src/children/tests/children.service.spec.ts` is the reference pattern for a new-domain-model + service test: mock `@pathway/db` at the module level, assert against the real service), and a **rollback note** (how to revert this PR alone without reverting later ones).

Rules that hold across every phase:

- Each PR should be reviewable in isolation and independently revertible.
- No PR both writes a migration and consumes it in application code — migrations land, then a separate PR wires consumers, matching the dev doc's own Phase 1/2/3 split (dev-doc §15).
- Feature flags are for rollout only, never for customer entitlement (dev-doc §12, "Don't").
- Every new model or resolver ships with a test in the same PR. No "add tests later" PRs.

---

## Lineage: dev-doc Phase 0–8 → this doc set

The dev doc's own suggested build sequence (§15) maps onto these phase docs as follows. Three phases here (0, 4, 7, 8) don't exist in the dev doc at all — they were added by this planning session to close gaps the dev doc left open.

| Dev-doc phase (§15) | This doc set | Note |
|---|---|---|
| — (no equivalent) | **Phase 0** | New. The dev doc assumes a pricing foundation already exists; it doesn't (D7). This phase also owns versioning, which the dev doc never mentions |
| Phase 0: Discovery | Folded into **Phase 1** PR 1.6–1.7 and this session's own grounding pass (see each phase doc's "current state") | The call-site inventory the dev doc asked for is produced live in Phase 2, since sector-check call sites turned out to be a small, contained surface (grounded: 4 production files, not an unknown quantity) |
| Phase 1: Data model | **Phase 1** PR 1.1–1.2 | |
| Phase 2: `packages/platform` core | **Phase 1** PR 1.3–1.5 | |
| Phase 3: Backfill | **Phase 1** PR 1.7 | |
| Phase 4: Navigation and API guards | **Phase 2** | |
| Phase 5: Admin settings | **Phase 2** (folded in — same call-site-migration mindset) | |
| Phase 6: Billing integration | **Phase 3** | |
| Phase 7: Purchase journey | **Phase 5** (configurator) | Dev-doc §5 describes a 6-step flow; Phase 5 breaks it into its own PRs plus an imagery system the dev doc didn't specify |
| Phase 8: Cutover | **Phase 6** | |
| — (no equivalent) | **Phase 4** (Learning module) | New. Sourced from the CEE vertical's already-designed Learning domain model (`docs/cee-vertical/03-domain-model.md`), reused as the platform's first module and reference implementation |
| — (no equivalent) | **Phase 7** (NexSteps Home) | New. Sister-product decision (D1) |
| — (no equivalent) | **Phase 8** (Community) | New. Net-new backend, no prior art in this repo beyond the one-way `Announcement` model |

---

## Out of scope / non-goals

- **CEE features not adopted** (D2): Network/multi-org tier, Postgres RLS, ABAC policy layer, Merit/rewards, the parent-portal publishing gate, region/data-residency pinning, and the internal staff-billing/margin subsystem (`docs/cee-vertical/06-internal-staff-billing.md`). Available to revisit from the CEE package if a future initiative needs them.
- **No `@pathway/*` → `@nexsteps/*` package rename.** Grounded: all 13 workspace packages are still `@pathway/*` scoped today. Separate work, tracked as the dev doc's own open question (§17 Q1).
- **No code changes in this cycle.** This doc set specifies the PRs; a later cycle builds them.
- **No CHANGELOG.md** (D4).
- **No existing-customer migration flow** — grandfathering is the whole of Phase 0's answer; the upgrade path itself is future work, flagged per-phase where relevant.

---

## Open decisions flagged across the set

Collected here for visibility; each is repeated in its owning phase doc.

1. **New plan-code naming for the four target tiers** (Phase 0) — recommended: version-tagged codes (e.g. `V2_STARTER_MONTHLY`) to avoid colliding with the existing `STARTER_MONTHLY`/`GROWTH_MONTHLY` codes (D7). Needs a human call before Phase 0 PR 0.2 starts.
2. **Whether the catalogue's fallback prices for the four new tiers match anything actually configured in Stripe today** (Phase 0, D9) — this doc set has no visibility into the live Stripe dashboard; confirm real Price IDs/amounts with whoever owns Stripe before PR 0.2's operational half.
3. **School → {Independent / ACE / State} default vertical during backfill** (Phase 1) — the live `OrgSector` enum has one `SCHOOL` value; the target `Vertical` enum splits it three ways. Dev-doc §14/§17 Q2 flags the same gap.
4. **NexSteps Home plan pricing** (Phase 7) — a light family tier or free; not decided.
5. **Community cross-tenant privacy and moderation model** (Phase 8) — needs its own design pass before PR 8.1 starts.
6. **Whether AV30 is renamed to "Active People" in user-facing copy** while keeping the internal field name (`av30Included`, `checkAv30ForOrg`, etc.) unchanged — cosmetic, low priority, flagged in Phase 0.

---

## Source material grounded against

- `nexsteps-platform-architecture-dev-doc.md` (this folder) — the target architecture.
- `docs/cee-vertical/` — the CEE Connect package this doc set reuses the Learning domain model and Family/TEACH Hub thinking from (D1, D2).
- `packages/pricing/src/{types,catalog,index}.ts`, `apps/api/src/billing/*`, `apps/admin/lib/plan-info.ts`, `apps/admin/lib/buy-now-pricing.ts`, `apps/web/lib/buy-now-pricing.ts` — the current (and, it turns out, four-way duplicated) pricing/billing code, reviewed in full for Phase 0 and Phase 3.
- `packages/db/prisma/schema.prisma` (1,065 lines) — reviewed in full for the `OrgSector` enum, `Org`, `Subscription`, `Announcement`, and usage-counter models.
- `apps/workers` — reviewed to confirm it's plain `tsx` CLI scripts today, not a BullMQ queue (the CEE docs' architecture diagram shows BullMQ as aspirational, not implemented).
- `apps/mobile/app/(family)/` — the existing static "Family Space" mockup, confirmed unwired to any API, relevant to Phase 7.
