# Phase 5 — Apple-style configurator + imagery

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.5.0` (tag `v2.5.0`)
**Depends on:** Phase 1 (capabilities to preview per step), Phase 3 (modules must be purchasable for the modules step to mean anything).
**Blocks:** Phase 6 (cutover removes the old pricing/buy pages this phase replaces, once this one has proven itself in production).

---

## Goal

Replace the current pricing-cards + single-funnel buy page with the dev doc's six-step guided flow (§5): organisation type → vertical → what's included → modules → plan → storage → summary → Stripe Checkout.

## Grounding finding worth knowing about before starting

`apps/web/app/(marketing)/trial/trial-page-client.tsx` already contains an explicit, pre-existing TODO (lines 19-22, 111-113, 270-272) sketching a **"v2 - Self-serve" multi-step wizard** for the *trial signup* flow: Step 1 (about you) → Step 2 (organisation: name, sector, size) → Step 3 (confirm & create tenant). This is a different flow from the one this phase builds — trial signup vs. paid checkout — but it's clearly related (both collect org type/sector early in a wizard), was written by someone anticipating this exact wave of work, and its version label (v2) matches this doc set's own numbering. **Not this phase's job to merge them**, but worth flagging: whoever builds this phase should read that TODO first and decide whether the trial wizard and the paid configurator should share a step component, or stay separate. Flagged as Open Decision 1.

**No stepper/wizard component exists anywhere in this codebase today.** Checked `packages/ui/src/components/` — only `page-shell`, `sidebar-nav`, `top-bar`, and generic primitives (`button`, `card`, `input`, `select`, `textarea`, `badge`, `data-table`). The configurator's step shell is genuinely new UI, composed from these existing primitives rather than pulling in a wizard library (ladder: reuse primitives, build the one new composition needed).

## Current state (grounded, R/E/N)

| File | Current state | R/E/N |
|---|---|---|
| `apps/web/app/(marketing)/pricing/page.tsx` (647 lines) | Card-style marketing page, reads `PLANS`/`PRICING_FAQS`, overlays live Stripe prices | E (kept reachable behind a flag until Phase 6, per PR 5.4) |
| `apps/web/app/buy/page.tsx` (768 lines) | Single self-serve funnel, `BuyNowPage` component, local state for tier/frequency/av30Blocks/storageChoice/org details (SMS/AV30-block state removed already in Phase 0) | E (kept reachable behind a flag; the configurator is additive at a new route, not an in-place rewrite of this file) |
| `apps/web/lib/buy-now-client.ts:84` (`previewPlanSelection`) | Existing cart-preview function | R (reused by the configurator's running-total display, not reimplemented) |
| `apps/web/lib/buy-now-pricing.ts:190`, `apps/admin/lib/buy-now-pricing.ts:120` (`calculateCartTotals`, two independent copies) | Existing cart-math | R (reused as-is; not this phase's job to de-duplicate the two copies, though it's the same duplication pattern flagged in Phase 0 D9) |
| `apps/web/app/(marketing)/trial/trial-page-client.tsx:19-22,111-113,270-272` | Pre-existing TODO for an unrelated-but-adjacent trial-signup wizard | R (read before starting, don't build against) |
| `packages/ui/src/components/` | `page-shell.tsx`, `sidebar-nav.tsx`, `top-bar.tsx`, `ui/{button,card,input,select,textarea,badge,data-table}.tsx` | R (primitives the new stepper composes from) |
| `packages/platform` (Phase 1) capability maps | Per-vertical/module capability lists — this is what the "what's included" step displays | R |
| — | **No imagery/asset pipeline exists for verticals or modules.** This is wholly new (PR 5.3/5.5) | — |

---

## PR breakdown

### PR 5.1 — Configurator state machine + stepper shell

**Scope:** The step sequence and state container, no real content per step yet (placeholder screens).

**Key files:**
- `apps/web/app/configure/` (N, new route) — page shell + step router.
- `apps/web/app/configure/state.ts` (N) — the configurator's state shape (org type, vertical, selected modules, plan, storage) and step-transition logic.
- `packages/ui/src/components/ui/stepper.tsx` (N) — a generic stepper primitive (progress indicator + back/forward), composed from existing `button`/`card`, since nothing like it exists yet.

**Failing test first:** state-machine unit test — forward/back transitions preserve prior-step selections; jumping to a step whose prerequisite (e.g. vertical) isn't yet chosen redirects back rather than rendering blank.

**Rollback:** delete the new route and component; nothing else references it yet.

---

### PR 5.2 — Per-step screens with running total

**Scope:** Real content for each of the six steps, with a persistent running-total sidebar/footer using the existing `previewPlanSelection`/`calculateCartTotals`.

**Key files:**
- `apps/web/app/configure/steps/*.tsx` (N) — one file per step (org type, vertical, what's included, modules, plan, storage), following whatever component style `apps/web/app/buy/page.tsx` already uses for consistency with the rest of the marketing site.
- `apps/web/app/configure/running-total.tsx` (N) — wraps the existing `calculateCartTotals`/`previewPlanSelection`, doesn't reimplement cart math.

**Failing test first:** render test per step confirming the correct options display (e.g. the vertical step shows all 7 verticals with correct labels from `packages/types`' new `Vertical` type, Phase 1 PR 1.6); running-total test confirming it updates as selections change, matching what `calculateCartTotals` would return for the same inputs directly.

**Rollback:** revert the step files; the shell from PR 5.1 still functions with placeholder content.

---

### PR 5.3 — Imagery system

**Scope:** Per-vertical and per-module visual slots, theme-aware, composited into a "your profile" summary image. Genuinely new — no existing asset convention to extend.

**Key files:**
- `apps/web/public/configurator/` (N) — asset location convention, e.g. `verticals/{vertical}.png`, `modules/{module}.png`, light/dark variants if the design calls for it.
- `apps/web/app/configure/profile-summary.tsx` (N) — composites the chosen vertical + module images into the summary step.
- Placeholder assets (N) — one per vertical (7) and module (8, or 9 including Learning per Phase 4's addition), low-fidelity placeholders, not final art.

**Failing test first:** render test — a given vertical + module selection resolves to the expected image paths (asset-existence test, not a visual-regression test, which is out of scope for this doc set's TDD discipline).

**Rollback:** revert the compositing component; the summary step (PR 5.2) still renders correctly without imagery, just plainer.

---

### PR 5.4 — Summary → Stripe Checkout handoff

**Scope:** Wire the configurator's final summary step into the same `createCheckoutSession` path the current buy page uses (Phase 3's extended version, with modules). Keep the old pricing/buy pages reachable behind a flag until Phase 6.

**Key files:**
- `apps/web/app/configure/summary.tsx` (N) — calls the existing checkout-session creation flow (`apps/web/lib/buy-now-client.ts`'s `createCheckoutSession`, extended in Phase 3) with the configurator's accumulated selections mapped onto the same request shape `apps/web/app/buy/page.tsx` already builds.
- A rollout flag gating whether marketing links point at the old funnel or the new configurator, so both can run in parallel until Phase 6 cuts over. **Grounded: no feature-flag service exists anywhere in this codebase today** (grepped for `featureFlag`/`launchdarkly`/`unleash` etc., zero hits) — this needs to be genuinely new, and per the ladder (simplest thing that works), a single environment variable (e.g. `NEXT_PUBLIC_USE_CONFIGURATOR`) is enough; this doc set doesn't recommend standing up a flagging service for one rollout toggle. **This is rollout-flagging (dev-doc §12's "Do" list), not customer entitlement flagging (§12's "Don't" list) — the two are easy to conflate and the dev doc is explicit that only the former is acceptable.**

**Failing test first:** e2e test — a full configurator run (org type → vertical → modules → plan → storage → summary) produces a Stripe Checkout session with the correct line items, matching what the same selections would produce via the old buy page (regression parity, not just "it doesn't crash").

**Rollback:** flip the flag back to the old funnel; the configurator route can stay dead code until fixed, or be deleted, without affecting the live purchase path.

---

### PR 5.5 — Generate vertical/module imagery assets (build-time task, flagged)

**Scope:** Produce the real imagery to replace PR 5.3's placeholders. This is asset production, not application code — flagged separately because it doesn't fit this doc set's PR-with-failing-test shape (there's no meaningful "test" for whether artwork looks right beyond design review) and because it can happen in parallel with PR 5.1-5.4 rather than blocking them.

**Rollback:** N/A — swapping placeholder assets for final ones is a file replacement, not a code change.

---

## Acceptance criteria

- [ ] The configurator's step sequence matches dev-doc §5's six steps; back/forward preserves state; skipping ahead without a prerequisite redirects back.
- [ ] The running total matches `calculateCartTotals`'s output for the same inputs at every step, not just the summary.
- [ ] Vertical and module selections render a summary image (placeholder or final).
- [ ] A completed configurator run produces the same Stripe Checkout line items a manual buy-page purchase with equivalent selections would.
- [ ] `/pricing` and `/buy` remain reachable and functional behind the rollout flag — this phase adds a path, it doesn't remove the old one (that's Phase 6).

## Open decisions

1. **Whether the trial-signup wizard (the pre-existing TODO in `trial-page-client.tsx`) and this configurator should share a step-shell component** — flagged, not decided; read that file before starting PR 5.1.
2. **Exact rollout-flag mechanism** — confirm what this app already uses for feature flags (dev-doc §12 requires flags stay rollout-only, never entitlement-gating) before PR 5.4.
3. **Whether light/dark image variants are needed per vertical/module** (PR 5.3) — a design call, not an engineering one; placeholders can ship single-variant and add dark-mode assets later without a structural change.
