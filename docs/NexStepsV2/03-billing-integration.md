# Phase 3 — Billing integration

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.2.1` (tag `v2.2.1`)
**Depends on:** Phase 0 (plan codes, `STRIPE_PRICE_MAP` mechanism), Phase 1 (`OrgModule` model + resolvers).
**Blocks:** Phase 2 PR 2.4 (Modules settings screen needs a real activation path to point its production toggle at), Phase 5 (configurator's checkout handoff needs modules to be purchasable).

---

## Goal

Wire the 8 modules and storage tiers into the existing Stripe checkout/webhook path — extending it, not building a new billing integration — and make module purchase actually create/update `OrgModule` rows.

## Grounding finding that simplifies this phase

The dev doc's billing-flow diagram (§10) has a "Cache refreshed" step between webhook processing and navigation. **No such cache exists.** Grepped the entire API for `redis`/`ioredis` — zero hits. `packages/platform`'s resolvers (Phase 1) read `OrgVertical`/`OrgModule` directly from Postgres on every call, with no caching layer in front. So "cache refreshed" and "navigation rebuilt" in the dev doc's flow aren't separate implementation steps here — they're automatic, because the resolvers are already always-fresh. This phase's job is narrower than the diagram implies: **write the `OrgModule` row correctly and idempotently; there's nothing else to invalidate.**

Second finding, a reassuring one: the existing webhook handler's write ordering is already correct for exactly the hardening the dev doc asks for (§10: "idempotent handling of duplicate webhook deliveries... not optional"). In `apps/api/src/billing/webhook.controller.ts:169-184`, `applyEvent(event)` (the actual entitlement-writing logic) runs **before** `prisma.billingEvent.create()` (the idempotency marker). If `applyEvent` throws, the idempotency marker is never written, so a retried delivery from Stripe will correctly re-attempt rather than being silently swallowed as a duplicate. Module activation should be added inside this same `applyEvent` path, using an upsert (not a create) against `OrgModule`'s `[orgId, module]` unique constraint from Phase 1, so redelivery after a partial failure is naturally idempotent rather than needing new dead-letter machinery.

## Current state (grounded, R/E/N)

| File | Current state | R/E/N |
|---|---|---|
| `apps/api/src/billing/webhook.controller.ts` | `handleWebhook()` (106-209): signature/provider verification via injected provider, `billingEvent.findFirst` dedup by `provider` + `payloadJson.eventId` (118-132), pending-order-to-real-org resolution (135-166), `applyEvent()` (169, 211+) dispatches on `event.kind` (`subscription.updated`, `subscription.created`, `invoice.paid`, …), then `billingEvent.create()` (173) as the idempotency marker, then `entitlements.resolve(orgId)` (191) — described in its own comment as "warm the resolver; no enforcement here" | E |
| `apps/api/src/billing/providers/stripe-billing-webhook.provider.ts:35-69` | `verifyAndParse()` using `stripe.webhooks.constructEvent()`, throws `BadRequestException` on missing/invalid signature | R (untouched — signature verification already meets the dev doc's bar) |
| `apps/api/src/billing/billing-provider.config.ts` | `STRIPE_PRICE_MAP` mechanism (see Phase 0) — this phase adds module + storage-tier codes to it | E |
| `apps/api/src/billing/providers/stripe-buy-now.provider.ts` | `createCheckoutSession()` builds line items from plan + AV30 + storage + SMS; storage line items already exist (81-95, 100GB/200GB/1TB) | E (add module line items alongside the existing storage ones) |
| `packages/db/prisma/schema.prisma:970-988` (`PendingOrder`) | Holds `planCode`, `av30Cap`, `storageGbCap`, `smsMessagesCap`, `leaderSeatsIncluded`, `maxSites`, `flags` (Json), `pendingOrgDetails` — **no field for selected modules today** | E |
| `packages/platform` (Phase 1) | `OrgModule` model, `organisationHasModule()`/`getOrganisationCapabilities()` resolvers | R |
| — | **No dead-letter queue or retry mechanism exists** beyond Stripe's own webhook retry behaviour (which the current ordering already cooperates with correctly, see above) | — |

---

## PR breakdown

### PR 3.1 — Stripe products/prices for the 8 modules

**Scope:** Extend the `STRIPE_PRICE_MAP` price-code space to cover the 8 modules (Finance, Events, Transport, Meals, Asset Management, HR, AI Workspace, Advanced Reporting). Storage tiers already have codes (`STORAGE_100GB_*` etc. from the existing add-on system) — reused as-is, not duplicated.

**Key files:**
- `apps/api/src/billing/billing-provider.config.ts` (E) — new `ModulePriceCode` type (8 modules × monthly/yearly = 16 codes, e.g. `MODULE_FINANCE_MONTHLY`/`MODULE_FINANCE_YEARLY`, following the existing `AddonPriceCode` naming shape), folded into `PriceCode` and `ALLOWED_PRICE_CODES`.
- **Operational half (same pattern as Phase 0 D9):** create the 8 modules' Stripe Products/Prices, add their Price IDs to `STRIPE_PRICE_MAP`/`STRIPE_PRICE_MAP_TEST` per environment. Module pricing itself isn't specified in the dev doc (§4 lists the module catalogue with no prices) — **open decision**, needs product/commercial input before this PR's operational half can run.

**Failing test first:** `ALLOWED_PRICE_CODES` accepts all 16 new codes; pricing diagnostics endpoint (`pricing.controller.ts`) reflects them once the env var step is done in staging.

**Rollback:** revert the type/allow-list change; no Stripe objects need deleting to roll back the code.

---

### PR 3.2 — `PendingOrder` gains selected modules

**Scope:** Record which modules were selected at checkout time, so the webhook handler (PR 3.4) knows what to activate once payment completes.

**Key files:**
- `packages/db/prisma/schema.prisma` (E) — add `selectedModules Module[]` (or a `Json` field if an array-of-enum column doesn't fit the existing migration style — confirm against how `PendingOrder.flags` (`Json?`) is used elsewhere in this model for a similar "flexible bag of choices" case, and prefer matching that shape for consistency) to `PendingOrder`.
- New migration (N).

**Failing test first:** migration test — a `PendingOrder` can be created with a non-empty module selection and read back correctly.

**Rollback:** revert the migration; the column is additive and nothing reads it until PR 3.4.

---

### PR 3.3 — Checkout line items for modules

**Scope:** Extend `createCheckoutSession()` to add a line item per selected module, mirroring the existing storage-tier block.

**Key files:**
- `apps/api/src/billing/providers/stripe-buy-now.provider.ts` (E) — after the existing storage block (lines 81-95), add: for each module in `params.plan.selectedModules` (or equivalent param), look up `priceMap[`MODULE_${module}_${intervalSuffix}`]` and push a line item.
- `apps/api/src/billing/buy-now.service.ts` (E) — thread `selectedModules` through from the request into `PendingOrder` (PR 3.2) and into the checkout params.

**Failing test first:** checkout session for a plan + two modules produces exactly plan-line-item + two module-line-items, in the same shape as the existing storage/AV30 tests in this file's spec suite (`apps/api/src/billing/tests/`).

**Rollback:** revert the two files; module line items simply stop being added, plan/storage/AV30 checkout is unaffected (each add-on block in this file is independent).

---

### PR 3.4 — Webhook: module activation

**Scope:** On successful subscription/invoice events, upsert `OrgModule` rows for the org's selected modules, inside the existing `applyEvent()` path — before the idempotency marker, per the grounding finding above.

**Key files:**
- `apps/api/src/billing/webhook.controller.ts` (E) — inside `applyEvent()`'s `subscription.created`/`subscription.updated`/`invoice.paid` handling (`handleSubscriptionEvent`, called from line 218+), after resolving the org, read the originating `PendingOrder.selectedModules` (for a fresh purchase) or the subscription's current selection (for a renewal/change), and `prisma.orgModule.upsert()` per module: `status: ACTIVE`, `activatedAt: now` (only set on first activation), `expiresAt: subscription.periodEnd`.
- No new idempotency mechanism needed — the existing dedup (118-132) already prevents reprocessing the same Stripe event twice, and the upsert makes reprocessing safe even if it somehow did happen (this is the "idempotent handling of duplicate webhook deliveries" the dev doc asks for, satisfied by composition rather than new machinery).

**Failing test first:**
- Integration test: a webhook event for a subscription with two selected modules results in exactly two `ACTIVE` `OrgModule` rows with the correct `expiresAt`.
- Regression test: replaying the exact same webhook payload (simulating a Stripe retry) doesn't create duplicate rows or throw (relies on the `[orgId, module]` unique constraint + upsert).
- Test: a webhook event for a *renewed* subscription updates `expiresAt` on the existing `OrgModule` rows rather than creating new ones.

**Rollback:** revert the `applyEvent()` addition; existing plan/AV30/storage webhook handling is untouched (this is additive within the same function, not a rewrite of it).

---

### PR 3.5 — Module cancellation/expiry

**Scope:** When a subscription is cancelled or a module is removed, the corresponding `OrgModule` rows need to transition to `CANCELLED`/`EXPIRED` rather than being silently stale.

**Key files:**
- `apps/api/src/billing/webhook.controller.ts` (E) — extend `applyEvent()`'s handling of subscription-cancellation events (confirm exact event kind(s) already dispatched in `handleSubscriptionEvent` — likely alongside the existing `refundProratedAndCancelSubscription` call at line 383) to set affected `OrgModule.status = CANCELLED`.

**Failing test first:** a subscription-cancelled webhook event transitions only the active modules tied to that provider subscription to `CANCELLED`; `organisationHasModule()` (Phase 1) returns `false` for them immediately after.

**Rollback:** revert the handler addition; modules stay `ACTIVE` indefinitely until manually corrected, which is the pre-PR behaviour, not a regression from a revert.

---

## Acceptance criteria

- [ ] All 8 modules have Stripe Prices wired through `STRIPE_PRICE_MAP` in at least the staging environment; a `STRIPE_TEST`-mode checkout including modules succeeds end-to-end.
- [ ] `PendingOrder` records selected modules at checkout time.
- [ ] A completed checkout with modules results in the correct `OrgModule` rows, `ACTIVE`, with correct `expiresAt`.
- [ ] Replaying a webhook event (simulated Stripe retry) is provably idempotent — no duplicate rows, no thrown error.
- [ ] Subscription cancellation transitions only the affected subscription's modules to `CANCELLED`, reflected immediately by `organisationHasModule()` (no cache to invalidate, per the grounding finding — this should just work).
- [ ] Every new webhook code path is added to the existing `applyEvent()` function, not a parallel handler — signature verification and duplicate-detection continue to cover 100% of billing events, module-related or not.

## Open decisions

1. **Module pricing** — the dev doc's module catalogue (§4) lists no prices. Needs commercial input before PR 3.1's operational half.
2. **`PendingOrder.selectedModules` column shape** — typed `Module[]` array vs. folding into the existing `flags: Json?` field. Recommend confirming which pattern the rest of `PendingOrder` favours before deciding (see PR 3.2).
3. **Which exact Stripe event kind(s) represent "module removed" independent of full subscription cancellation** (PR 3.5) — e.g. a customer downgrading modules without cancelling their whole subscription. Confirm against `handleSubscriptionEvent`'s current dispatch table during implementation; may need a webhook event kind this handler doesn't parse yet.
