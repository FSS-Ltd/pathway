# Phase 6 — Cutover

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.6.0` (tag `v2.6.0`)
**Depends on:** Phase 5, run in production for at least one full billing cycle with no regressions before this phase starts (dev-doc §14 step 8's own rule).
**Blocks:** Nothing downstream depends on this phase; it's a cleanup, not a foundation.

---

## Goal

Remove the old pricing/buy pages and retire the legacy plan codes' reachability, now that the configurator (Phase 5) has proven itself. Smaller in scope than the dev doc implies — see the grounding note.

## Grounding finding that shrinks this phase

The dev doc's cutover step (§14 step 8, §15 Phase 8) is written as "remove old feature-flag and sector-check logic." Grounding across this whole doc set found:

- **No feature-flag entitlement system exists in this codebase** (Phase 5's grounding: zero hits for `featureFlag`/`launchdarkly`/`unleash`). There's nothing of that shape to remove, because it was never built — entitlement here has always been plan/subscription-code-driven, not flag-driven. The dev doc's own §12 "Don't" rule ("never use feature flags for customer entitlement") was already true by default in this codebase, not a bad habit to correct.
- **The hardcoded-sector-check surface, per Phase 2's inventory, is 4 production files**, and none of them are being "removed" by this phase — `orgs.service.ts` and `webhook.controller.ts` still need to read/write `Org.sector` for as long as any grandfathered subscriber's org record depends on it (which, per Phase 0's grandfathering decision, is indefinite unless a separate future migration retires `sector` entirely — out of scope here).

So this phase is really just: **retire the rollout flag from Phase 5, delete the old pricing/buy page routes (or leave them as dead code if any external link still points at them — confirm before deleting), and retire the old plan codes' new-signup reachability** (which PR 0.6 already made UI-unreachable; this phase is about removing the *server-side* acceptance of new checkouts against them, if that's still open, and archiving the dead routes).

## Current state (grounded, R/E/N)

| File | Current state | R/E/N |
|---|---|---|
| Phase 5's rollout flag (`NEXT_PUBLIC_USE_CONFIGURATOR` or equivalent) | Gates old funnel vs. configurator | E (remove the flag, configurator becomes the only path) |
| `apps/web/app/(marketing)/pricing/page.tsx`, `apps/web/app/buy/page.tsx` | Old funnel, kept reachable through Phase 5 | E (delete, or redirect to `/configure`, confirm which before implementing) |
| `apps/admin/lib/sector-visibility.ts` | No-op or repurposed per Phase 2's Open Decision 1 | R (whatever Phase 2 left it as) |
| `apps/api/src/orgs/orgs.service.ts:86,88,170`, `apps/api/src/billing/webhook.controller.ts:43-44,502` | Still read/write `Org.sector` | R — **not removed**, since grandfathered orgs still have it set and nothing in this doc set's scope migrates `sector` off `Org` entirely |

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

---

## Acceptance criteria

- [ ] The configurator is the only purchase path; the Phase 5 rollout flag no longer exists in the codebase.
- [ ] Old pricing/buy routes are removed or redirect cleanly; no internal link still points at a dead route.
- [ ] `Org.sector`/`OrgSector` reads and writes in `orgs.service.ts`/`webhook.controller.ts` are **unchanged** — confirmed not touched by this phase, since grandfathered data still depends on them.
- [ ] No references to removed paths remain (grep-clean).

## Open decisions

1. **Delete vs. redirect** for the old pricing/buy pages — depends on whether any external marketing links (ads, emails already sent) point at `/pricing` or `/buy` directly; redirect is the safer default if unsure.
2. **Whether this phase is the right place to also retire `Org.sector` entirely** (replacing it fully with `OrgVertical`) — recommended against: that's a data-migration decision affecting every grandfathered org, deserves its own phase and its own decision log entry if it's ever done, not folded into a cleanup phase as a drive-by.
