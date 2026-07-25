# Phase 6 — Cutover

**Status:** Implemented on `chore/phase6-cutover`, pending merge/deploy sequencing
**Owner:** Unassigned
**Ships as:** `2.6.0` (tag `v2.6.0`)
**Depends on:** Phase 5, run in production for at least one full billing cycle with no regressions before this phase starts (dev-doc §14 step 8's own rule). **Note:** implementation started before this bake-time had elapsed (Phase 5 was tagged `v2.4.0` only 3 days prior, with related commits still landing) — the project owner explicitly reviewed this gap and chose to proceed. See PR 6.1/6.2's own rollback notes below for the resulting merge-sequencing guidance; the code being ready does not by itself satisfy this dependency for *deployment*.
**Blocks:** Nothing downstream depends on this phase; it's a cleanup, not a foundation.

---

## Goal

Remove the old pricing/buy pages and retire the legacy plan codes' reachability, now that the configurator (Phase 5) has proven itself. Smaller in scope than the dev doc implies — see the grounding note.

## Grounding finding that shrinks this phase

The dev doc's cutover step (§14 step 8, §15 Phase 8) is written as "remove old feature-flag and sector-check logic." Grounding across this whole doc set found:

- **No feature-flag entitlement system exists in this codebase** (Phase 5's grounding: zero hits for `featureFlag`/`launchdarkly`/`unleash`). There's nothing of that shape to remove, because it was never built — entitlement here has always been plan/subscription-code-driven, not flag-driven. The dev doc's own §12 "Don't" rule ("never use feature flags for customer entitlement") was already true by default in this codebase, not a bad habit to correct.
- **The hardcoded-sector-check surface, per Phase 2's inventory, is 4 production files**, and none of them are being "removed" by this phase — `orgs.service.ts` and `webhook.controller.ts` still need to read/write `Org.sector` for as long as any grandfathered subscriber's org record depends on it (which, per Phase 0's grandfathering decision, is indefinite unless a separate future migration retires `sector` entirely — out of scope here).

So this phase is really just: **retire the rollout flag from Phase 5, delete the old pricing/buy page routes (or leave them as dead code if any external link still points at them — confirm before deleting), and retire the old plan codes' new-signup reachability** (which PR 0.6 already made UI-unreachable; this phase is about removing the *server-side* acceptance of new checkouts against them, if that's still open, and archiving the dead routes).

**Update (implementation):** the server-side acceptance was confirmed still open and was closed as PR 6.3, below — the original PR breakdown had only covered the first two items (flag, routes) and left this third item implicit in the Goal paragraph without a corresponding PR or acceptance criterion. Both are added now.

## Current state (grounded, R/E/N)

| File | Current state | R/E/N |
|---|---|---|
| Phase 5's rollout flag (`NEXT_PUBLIC_USE_CONFIGURATOR`) | Gates old funnel vs. configurator | **Done (PR 6.1)** — flag removed from `configurator-rollout.ts`, `.env.example`, `scripts/sync-vercel-env.mjs`. Still needs a manual `vercel env rm NEXT_PUBLIC_USE_CONFIGURATOR` on the `web` project post-merge; the sync script has no automated removal path. |
| `apps/web/app/(marketing)/pricing/page.tsx`, `apps/web/app/buy/page.tsx` | Old funnel, kept reachable through Phase 5 | **Done (PR 6.2)** — both files deleted; `/pricing` and `/buy` now 307-redirect to `/configure` via `next.config.mjs` (temporary, not 308, until the redirect has baked in). `apps/admin/lib/sector-visibility.ts` referenced below no longer exists in the tree — confirmed removed or renamed by an earlier phase, not touched here. |
| `apps/api/src/orgs/orgs.service.ts:86,88,170`, `apps/api/src/billing/webhook.controller.ts:43-44,502` | Still read/write `Org.sector` | R — **not removed**, confirmed untouched by this phase (zero diff lines in `apps/api/src/orgs/`), since grandfathered orgs still have it set and nothing in this doc set's scope migrates `sector` off `Org` entirely |
| `apps/api/src/billing/buy-now.service.ts`'s anonymous-signup path | Accepted new checkouts against legacy plan codes (`CORE_*`, `MINIMUM_*`, `STARTER_MONTHLY`, `GROWTH_MONTHLY` — no UI path exposed this, but the API itself didn't block it) | **Done (PR 6.3)** — rejected with `BadRequestException` inside `checkout()`'s `if (!orgId \|\| !tenantId)` branch only. `purchaseForOrg()`, the webhook controller, and the admin/web configurator state files are untouched; grandfathered orgs are unaffected. |

---

## PR breakdown

### PR 6.1 — Remove the rollout flag

**Scope:** Delete the Phase 5 flag; the configurator is the only purchase path.

**Key files:** wherever PR 5.4's flag check lives (E) — remove the conditional, keep the configurator branch.

**Failing test first:** existing configurator e2e tests (Phase 5) still pass with the flag check removed; a test confirming `/pricing`/`/buy` (if kept as redirects) send users to `/configure`.

**Rollback:** re-add the flag check, default it to the old path — only feasible if the old routes weren't deleted in the same PR (see PR 6.2's sequencing note).

---

### PR 6.2 — Retire old pricing/buy routes

**Scope:** Delete or redirect `apps/web/app/(marketing)/pricing/page.tsx` and `apps/web/app/buy/page.tsx`.

**Key files:** the two files (E — redirect) or removed entirely (E — delete), plus `apps/web/app/buy/cancelled/page.tsx` and `apps/web/app/buy/thanks/page.tsx` (confirm whether the configurator's summary/checkout flow reuses these post-checkout pages or needs its own — likely reuse, since they're generic post-Stripe-redirect pages, not funnel-specific).

**Failing test first:** a test confirming `/pricing` and `/buy` either 404 or redirect to `/configure`, per whichever is decided; confirms no dangling internal links still point at the old routes (grep-based check across `apps/web`, not a runtime test).

**Rollback:** this PR should ship *after* PR 6.1 has been live long enough to confirm no issues, per the dev doc's "full billing cycle" rule — rollback here means reverting the deletion, which git makes trivial, but the real safety net is not shipping this PR too early.

**Implementation note:** shipped as `redirect` (307, `permanent: false`), not delete-outright — see Open Decision 1, resolved below. `permanent: false` is deliberate: it avoids browser/CDN caching the redirect during the monitored bake-in period this PR's own rollback note calls for; revisit to `permanent: true` once confirmed stable.

---

### PR 6.3 — Reject legacy plan codes for new signups

**Scope:** Not in the original PR breakdown — added during implementation once grounding confirmed the Goal paragraph's third item ("removing the *server-side* acceptance of new checkouts against [legacy plan codes]") was still open and the project owner chose to close it now rather than defer it. No UI ever exposed this path (PR 0.6 already made the codes UI-unreachable); this closes the remaining direct-API surface for a brand-new org signup.

**Key files:** `apps/api/src/billing/buy-now.service.ts`'s `checkout()` method (E) — new guard clause strictly inside its `if (!orgId || !tenantId)` branch (the anonymous-new-signup path only); `packages/pricing/src/configurator-plan-policy.ts` (E) — exported the existing `LEGACY_PLAN_CODES` constant rather than duplicating the list. `purchaseForOrg()` (existing-org purchases), `webhook.controller.ts`, and both the admin and web configurator state files are unchanged — grandfathered orgs are unaffected.

**Failing test first:** two new tests in `buy-now.service.spec.ts` constructing `BuyNowService` with no org/tenant context (the file's 18 pre-existing tests all use an authenticated context despite several being named "public checkout" — none of them actually reached the anonymous branch before this PR). One asserts a legacy code is rejected before any pending order or checkout session is created; one asserts a current plan code still succeeds in the same anonymous context, as a regression guard.

**Rollback:** revert the guard clause; no data migration involved, no external routes affected.

---

## Acceptance criteria

- [x] The configurator is the only purchase path; the Phase 5 rollout flag no longer exists in the codebase.
- [x] Old pricing/buy routes are removed or redirect cleanly; no internal link still points at a dead route.
- [x] `Org.sector`/`OrgSector` reads and writes in `orgs.service.ts`/`webhook.controller.ts` are **unchanged** — confirmed not touched by this phase, since grandfathered data still depends on them.
- [x] No references to removed paths remain (grep-clean).
- [x] Server-side acceptance of new checkouts against legacy plan codes is rejected (PR 6.3), without affecting existing/grandfathered org purchases.

## Open decisions

1. ~~**Delete vs. redirect** for the old pricing/buy pages~~ — **Resolved: redirect.** Chosen since external marketing links (ads, past emails) may still point at `/pricing` or `/buy` directly.
2. **Whether this phase is the right place to also retire `Org.sector` entirely** (replacing it fully with `OrgVertical`) — recommended against: that's a data-migration decision affecting every grandfathered org, deserves its own phase and its own decision log entry if it's ever done, not folded into a cleanup phase as a drive-by. **Still deferred** — not touched by PR 6.1/6.2/6.3.

## Known follow-ups (not blocking this phase)

Surfaced during implementation review, deliberately left out of this phase's scope:

- The configurator (`/configure`) has no analytics/telemetry at all — the deleted pricing page was the only `pricing_view` emitter, and nothing replaced it. Funnel dashboards keyed on that event will go dark after this ships.
- `scripts/blog-automation/qa.mjs`'s `ALLOWED_INTERNAL_LINKS` still allowlists `/pricing`, not `/configure`.
- `docs/PURCHASE_FLOW_WITH_AUTH0.md` documents `apps/web/app/buy/page.tsx` as current architecture; now stale.
- `/configure` has no sitemap entry or page metadata — a product/content decision, not a defect, but currently unmade.
