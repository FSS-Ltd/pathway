# Phase 0 — Foundation: versioning + four-tier plans

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.0.1` (tag `v2.0.1`)
**Depends on:** Nothing. This is the first phase.
**Blocks:** Every later phase reads the version constant (all) and the plan catalogue (Phase 3 billing, Phase 5 configurator).

---

## Goal

Put a real product version on the platform, and set the current Starter / Growth / Professional / Enterprise pricing to £49/100, £99/200, £149/500, custom/unlimited — without breaking a single existing subscriber or silently repricing anyone.

## Why this phase exists and isn't in the dev doc

The dev doc (`nexsteps-platform-architecture-dev-doc.md`, §5) states the target pricing table as if it were the starting point. It isn't. Grounding this doc set against the live code (2026-07-17) found:

- The live tiers are **Core / Starter / Growth / Enterprise**, not the target four. Core exists; Professional doesn't.
- **Critical: the live "Starter" and "Growth" are not discounted or renamed versions of the target tiers — they're different products that happen to share a name.**

**Also critical, and easy to miss from the code alone: the numbers below are not what customers are actually billed.** `packages/pricing/src/catalog.ts` and `apps/api/src/billing/billing-plans.ts` hold static **display/fallback** prices and limits. The amount Stripe actually charges is controlled entirely by a `STRIPE_PRICE_MAP` (and `STRIPE_PRICE_MAP_TEST`) environment variable — a JSON map of `PlanCode`/`AddonPriceCode` → Stripe Price ID (`apps/api/src/billing/billing-provider.config.ts:119-201`). `stripe-buy-now.provider.ts:41` reads `priceMap[planCode]` to build the checkout line item, and throws `"Price configuration missing for selected plan"` (line 47) if the map has no entry for that code. `BillingPricingService.listPrices()` (`pricing.service.ts:52-134`) fetches the live `unit_amount` from Stripe by that price ID for display, cached 5 minutes. So the table below states the catalogue's *fallback* numbers, which are assumed (not verified against the live Stripe dashboard — out of reach for a docs-only pass) to match what Stripe is actually configured to charge today:

| Tier label | Existing catalogue fallback | Current target price and active staff/volunteer allowance |
|---|---|---|
| Core | £49.99/mo, 15 AV30, 50 children, 1 site | *(retired for new signups)* |
| Starter | £149/mo, 50 AV30, 1 site | £49/mo, 100 active staff and volunteers, 1 site |
| Growth | £399/mo, 200 AV30, 3 sites | £99/mo, 200 active staff and volunteers, 2 sites |
| *(none)* | — | £149/mo, 500 active staff and volunteers, 5 sites (**Professional**, new) |
| Enterprise | Contact, no self-serve | Custom, unlimited |

If PR 0.2 just edited `PLAN_CATALOGUE["STARTER_MONTHLY"]`'s display price in place, every existing Starter subscriber would still be billed their original Stripe price (Stripe, not the catalogue, is authoritative) — but the UI would now lie about what they're paying, and any new signup routed to the old code would get the old Stripe price under new-looking copy. That's the mistake this phase is built to avoid, on both the billing side (D7) and the display side. See Open Decision 1 below.

There's no product version anywhere today either: root `package.json` has no `version` field, and `apps/api/src/health/health.controller.ts`'s `ok()` handler returns only `{ status: "ok", dbTime }`.

## Current state (grounded, R/E/N)

**Pricing/plan catalogue — four parallel copies, not three.** The original plan for this doc set assumed three. Grounding found a fourth:

| File | Role | R/E/N |
|---|---|---|
| `packages/pricing/src/types.ts` | `PlanTier` (`"core"\|"starter"\|"growth"\|"enterprise"`), `PlanCode` union (lines 10-17), `PlanDefinition`/`PricingFaq` interfaces | E |
| `packages/pricing/src/catalog.ts` | `PLANS` const (7-294), `orderedPlanCodes` (300-308), `getPlansByTier()`/`getSelfServePlans()`, `PRICING_FAQS` (329-365) | E |
| `packages/pricing/src/index.ts` | Barrel export only | R |
| `apps/api/src/billing/billing-plans.ts` | API-side `PlanTier`/`PlanCode` (adds Stripe-alias codes `MINIMUM_MONTHLY`/`MINIMUM_YEARLY` aliasing Core), `PlanDefinition` (different shape — adds `storageGbIncluded`, `smsMessagesIncluded`, `leaderSeatsIncluded`, `maxActiveClasses`, `flags`), `PLAN_CATALOGUE` (33-161), `getPlanDefinition()` | E |
| `apps/api/src/billing/billing-provider.config.ts` | `AddonPriceCode` (6-18: AV30 blocks ×2 sizes, storage ×3 tiers, SMS), `PriceCode = PlanCode \| AddonPriceCode`, `ALLOWED_PRICE_CODES` (55-75) | E |
| `apps/admin/lib/plan-info.ts` | Display-only third catalogue. **Its tier labels are only `"starter"\|"growth"\|"enterprise"` — Core plans map into tier `"starter"` here**, already inconsistent with the other two copies. `PLAN_CATALOGUE` (31-113) | E |
| `apps/admin/lib/buy-now-pricing.ts` | `PLAN_PRICES` (16-45), `ADDON_PRICES` (47-96), `calculateCartTotals()` (120-195), `mergeBillingPrices()` (197-242) | E |
| `apps/web/lib/buy-now-pricing.ts` | **Fourth copy**, not in the original plan: its own `PLAN_PRICES` (line 40), its own `AddonCode` type + `ADDON_PRICES` (line 85), its own `calculateCartTotals()` (line 190), `mergeBillingPrices()` (line 266) | E |
| `apps/web/lib/buy-now-client.ts` | `previewPlanSelection()` (line 84), `fetchPublicBillingPrices`, `createCheckoutSession` | R |

**The real price authority — Stripe, not the catalogue files above:**

| File | Role | R/E/N |
|---|---|---|
| `apps/api/src/billing/billing-provider.config.ts` | `parsePriceMap()` (119-201) parses `STRIPE_PRICE_MAP`/`STRIPE_PRICE_MAP_TEST` JSON into a `PriceCode → Stripe Price ID` map; filters against `ALLOWED_PRICE_CODES` (55-75); has a legacy-key rename table (163-180) for older env var key names | E (add the four new codes to the allow-list; the env var itself is deployment config, not a repo file) |
| `apps/api/src/billing/pricing.service.ts` | `BillingPricingService.listPrices()` (52-134) — for each `[code, priceId]` in the map, calls `stripe.prices.retrieve(priceId)` and returns the live `unitAmount`/`currency`/`interval`, 5-minute cache | R |
| `apps/api/src/billing/pricing.controller.ts` | Exposes a redacted diagnostics endpoint over `STRIPE_PRICE_MAP`'s parse result (which keys were extracted, no values) — useful for confirming a new code actually landed in the env var without exposing secrets | R |
| `apps/api/src/billing/providers/stripe-buy-now.provider.ts:41` | `createCheckoutSession()` reads `priceMap[planCode]` as `basePriceId`; throws if missing (line 47) | R (this is *why* the Stripe-side setup must exist before a new plan code is usable at all) |

**Billing logic that reads tier/plan identity:**

| File | What it does | R/E/N |
|---|---|---|
| `apps/api/src/billing/buy-now.service.ts` | `tierHierarchy` (507-511): `{ core: 1, starter: 2, growth: 3, enterprise: 4 }`, used by `validateUpgradePath()` (517-521) to block downgrades. `enforcePlanAddonPolicy()` (534-573): when `planTier === "core"`, zeroes `av30AddonBlocks`/`extraSites` and warns. Called from `checkout()` and `purchaseForOrg()` | E |
| `apps/api/src/billing/providers/stripe-buy-now.provider.ts` | `createCheckoutSession()` (34-182): AV30 block line items (68-79, Growth uses the 50-block price at `qty = floor(av30Blocks/2)`, Starter uses the 25-block price 1:1), storage (81-95), SMS (97-106, `qty = floor(extraSms/1000)`) | E |
| `apps/api/src/billing/entitlements-enforcement.service.ts` | `checkAv30ForOrg()` (43-102): soft/grace/hard-cap ratios and statuses. Has a pre-existing `TODO` (line 7) about the grace window being business-configurable — pre-existing, not this phase's concern | R (enforcement stays; only the addon *purchase* path changes) |
| `apps/web/app/(marketing)/pricing/page.tsx` (647 lines) | Card-style marketing page, reads `PLANS`/`PRICING_FAQS` from `@pathway/pricing`, overlays live Stripe prices | E |
| `apps/web/app/buy/page.tsx` (768 lines) | Single self-serve funnel, local state incl. `smsBundles`, imports from `apps/web/lib/buy-now-pricing.ts` and `buy-now-client.ts` | E |

**Versioning:**

| File | Current state | R/E/N |
|---|---|---|
| `/package.json` | No `version` field at all | E |
| `apps/api/src/health/health.controller.ts` | `ok()` (31-37) returns `{ status, dbTime }`, no version | E |
| `packages/util/src/index.ts` | Real package, has `crypto.ts` + Jest tests today | E (add `APP_VERSION` export) |
| `packages/config` | No `src/`, stub `echo` scripts — **not used**, see D8 | — |
| Web/admin footer components | *(to be located during PR 0.1 — no existing shared footer confirmed; expect a small new component in each app)* | N |

---

## PR breakdown

### PR 0.1 — Product version plumbing

**Scope:** Add the version constant and surface it in the API and both footers.

**Key files:**
- `package.json` (E) — add `"version": "2.0.1"`.
- `packages/util/src/index.ts` (E) — export `export const APP_VERSION = "2.0.1"`.
- `apps/api/src/health/health.controller.ts` (E) — `ok()` returns `{ status, dbTime, version: APP_VERSION }`.
- Web + admin footer components (N) — render `APP_VERSION`.

**Failing test first:**
- `apps/api/src/health/tests/health.controller.spec.ts` (N if it doesn't exist, else E) — asserts `GET /health` response includes `version: "2.0.1"`.
- One render test per app asserting the footer shows the version string.

**Rollback:** Revert the four files; no data migration involved, fully independent of every other PR in this phase.

---

### PR 0.2 — Introduce the four target tiers without touching existing plan codes

**Scope:** Add new `PlanCode` values for Starter/Growth/Professional/Enterprise-at-new-pricing across all four catalogue files, with new **fallback display** prices and real limits. **Existing codes (`CORE_*`, `STARTER_MONTHLY`, `STARTER_YEARLY`, `GROWTH_MONTHLY`, `GROWTH_YEARLY`, `MINIMUM_*`) are untouched** — they keep resolving to their current definitions for grandfathered subscribers (PR 0.6). This PR has a code half and a Stripe-config half; neither works without the other.

**Open decision (flag before starting):** naming for the new codes. Recommended: version-tagged, e.g. `V2_STARTER_MONTHLY` / `V2_STARTER_YEARLY`, `V2_GROWTH_MONTHLY` / `V2_GROWTH_YEARLY`, `V2_PROFESSIONAL_MONTHLY` / `V2_PROFESSIONAL_YEARLY`, `V2_ENTERPRISE_CONTACT`. Anything is fine as long as it can't collide with a code already in `ALLOWED_PRICE_CODES` (`apps/api/src/billing/billing-provider.config.ts:55-75`). This needs a human decision, not an engineering default — it becomes customer-visible in Stripe metadata and in the `STRIPE_PRICE_MAP` env var key names.

**Key files (code half):**
- `packages/pricing/src/types.ts` (E) — add `"professional"` to `PlanTier`; add the four new `PlanCode` values.
- `packages/pricing/src/catalog.ts` (E) — add four `PLANS` entries with the new *fallback display* prices/limits; add to `orderedPlanCodes`.
- `apps/api/src/billing/billing-plans.ts` (E) — mirror the same four entries in `PLAN_CATALOGUE`; add `"professional"` to `PlanTier`.
- `apps/api/src/billing/billing-provider.config.ts` (E) — add the four new `PlanCode`s to `ALLOWED_PRICE_CODES` (`PriceCode` type, line 20, already covers any `PlanCode`, so this is the allow-list entry, not a type change).
- `apps/api/src/billing/buy-now.service.ts` (E) — `tierHierarchy` becomes `{ core: 1, starter: 2, growth: 3, professional: 4, enterprise: 5 }`. Core stays in the map (value 1) so `validateUpgradePath()` still resolves for grandfathered Core subscribers; it's just unreachable for new signups after PR 0.6.
- `apps/admin/lib/plan-info.ts` (E) — add the four entries; fix the pre-existing Core→`"starter"` tier-label mapping only if touching this file anyway, otherwise leave it (pre-existing, out of scope per Karpathy surgical-changes rule — mention it, don't fix it here).

**Operational half (not a git diff — do this in Stripe + deployment secrets, per environment):**
- Create four (or eight, if monthly/yearly are separate Stripe Prices, matching the existing pattern) new Stripe Products/Prices at £49, £99, £149; Enterprise stays contact-only, no self-serve Stripe Price needed (matches `ENTERPRISE_CONTACT`'s existing no-price pattern).
- Add the new code → Stripe Price ID pairs to `STRIPE_PRICE_MAP` (production) and `STRIPE_PRICE_MAP_TEST` (staging/test-mode) as new JSON keys matching the codes chosen above. This has to happen in **every** environment independently (it's an env var, not code) — local dev, staging, production.
- Until this step lands in a given environment, `createCheckoutSession()` in that environment throws `"Price configuration missing for selected plan"` for the new codes (`stripe-buy-now.provider.ts:47`) — expected and correct, not a bug, until Stripe setup is done.

**Failing test first:**
- Unit test asserting `getPlanDefinition("V2_STARTER_MONTHLY")` (or the chosen code) returns the new fallback display price/100-limit, and that `getPlanDefinition("STARTER_MONTHLY")` **still** returns its original definition unchanged.
- `tierHierarchy` ordering test: `professional` sits strictly between `growth` and `enterprise`.
- Integration test (staging, once the Stripe-side step is done): `GET` the pricing diagnostics endpoint (`pricing.controller.ts`) and confirm the four new codes appear in `keysExtracted`; a `STRIPE_TEST`-mode checkout for a new code succeeds end-to-end and the returned Stripe session's price matches what was configured.

**Rollback:** Revert the six code files; no existing plan code's definition changes, so no subscriber is affected by a code-only revert. The Stripe-side price objects can be left in place harmlessly (unreferenced) or removed independently — they don't need to move in lockstep with a code revert.

---

### PR 0.3 — Remove the SMS add-on

**Scope:** Strip SMS from the purchase path. Grounded: SMS lives in three files, not the "web + admin" the plan assumed — the API's `ALLOWED_PRICE_CODES` also has to change, since it's the gate that accepts the code at all.

**Key files:**
- `apps/api/src/billing/billing-provider.config.ts` (E) — remove `SMS_1000_MONTHLY`/`SMS_1000_YEARLY` from `AddonPriceCode` and `ALLOWED_PRICE_CODES`.
- `apps/api/src/billing/providers/stripe-buy-now.provider.ts` (E) — remove the SMS line-item block (lines 97-106).
- `apps/admin/lib/buy-now-pricing.ts` (E) — remove SMS entries from `ADDON_PRICES`.
- `apps/web/lib/buy-now-pricing.ts` (E) — remove SMS entries from its own `ADDON_PRICES` and `AddonCode` type.
- `apps/web/app/buy/page.tsx` (E) — remove the `smsBundles` state and its input.
- `packages/pricing/src/catalog.ts` (E) — remove the SMS entry from `PRICING_FAQS` if one exists (confirm during implementation — the FAQ list includes an AV30 entry at minimum).
- **Leave `UsageCounters.smsMonth` and `PendingOrder.smsMessagesCap` in `schema.prisma` dormant** — no Prisma migration in this PR. Removing live columns is a separate, later decision (not flagged as needed).

**Failing test first:** checkout attempt with an SMS price code returns a validation error (`ALLOWED_PRICE_CODES` rejects it); `apps/web/app/buy/page.tsx` render test confirms no SMS input.

**Rollback:** Revert the six files. Dormant DB columns mean no migration to reverse.

---

### PR 0.4 — Remove the Active People (AV30) add-on packs, keep the cap

**Scope:** Stop selling `AV30_BLOCK_25_*`/`AV30_BLOCK_50_*` as purchasable add-ons. **Do not touch `entitlements-enforcement.service.ts`** — the AV30 hard cap itself stays fully enforced; only the "buy more AV30 headroom" purchase path goes away.

**Key files:**
- `apps/api/src/billing/billing-provider.config.ts` (E) — remove the four `AV30_BLOCK_*` codes.
- `apps/api/src/billing/providers/stripe-buy-now.provider.ts` (E) — remove the AV30 block line-item logic (lines 68-79). Note this logic had per-tier branching (Growth used the 50-block price, Starter the 25-block price) — both branches go, not just one.
- `apps/api/src/billing/buy-now.service.ts` (E) — `enforcePlanAddonPolicy()`'s AV30-block-zeroing branch becomes dead code once the addon can't be purchased at all; **leave the Core-gating shape intact** (it still zeroes `extraSites` for Core, which PR 0.4 doesn't touch) rather than deleting the whole method — confirm during implementation whether AV30-specific zeroing can be safely deleted or whether it's cheaper to leave as an inert branch.
- `apps/admin/lib/buy-now-pricing.ts` / `apps/web/lib/buy-now-pricing.ts` (E) — remove AV30 block entries from both `ADDON_PRICES` copies.
- `apps/web/app/buy/page.tsx` (E) — remove the `av30Blocks` input.

**Failing test first:** checkout with an AV30 block code is rejected; a test against `entitlements-enforcement.service.ts`'s existing spec suite confirms `checkAv30ForOrg()` behaviour is byte-for-byte unchanged (regression guard, not a new test).

**Rollback:** Revert the five files. The enforcement service was never touched, so there's nothing to roll back there.

---

### PR 0.5 — Display: four cards, Storage-only add-on

**Scope:** Update the marketing pricing page and buy page to show Starter/Growth/Professional/Enterprise, with Storage as the only remaining add-on. Price shown is the **live Stripe price** fetched through `fetchPublicBillingPrices()` (`apps/web/lib/buy-now-client.ts:173`) → `BillingPricingService.listPrices()`; the catalogue's fallback number (PR 0.2) only renders if that fetch is unavailable (`pricing_unavailable` warning path in `pricing.service.ts:74-80`) — i.e. this PR is depends on PR 0.2's operational half actually being done in whichever environment it's tested in, or the cards will render the fallback price instead of the real one.

**Key files:**
- `apps/web/app/(marketing)/pricing/page.tsx` (E) — four cards from the new `PlanCode`s (PR 0.2), drop Core.
- `apps/web/app/buy/page.tsx` (E) — four-tier selector, Storage-only add-on section.
- `packages/pricing/src/catalog.ts` (E) — `PRICING_FAQS` copy updated for the new tiers; fallback prices kept roughly in sync with whatever Stripe is actually configured to charge, but not authoritative (see PR 0.2).

**Failing test first:** render test asserting exactly four plan cards and exactly one add-on control (Storage) on the buy page; a second test (mocking `fetchPublicBillingPrices` to return the fallback-unavailable case) asserts the card falls back to the catalogue's display price rather than showing blank/zero.

**Rollback:** Revert the three files. Purely presentational; the underlying catalogue and Stripe config from PR 0.2 are unaffected either way.

---

### PR 0.6 — New-signup default + grandfather existing subscribers

**Scope:** Point new checkouts at the new plan codes. Existing `Subscription.planCode` rows are never touched by this PR — that's what "grandfathered" means here. Document the deferred upgrade-flow migration as explicitly out of scope.

**Key files:**
- `apps/web/app/buy/page.tsx` / `apps/admin` equivalent purchase surface (E) — default tier selector to the new codes; old codes (`CORE_*`, `MINIMUM_*`) become unreachable from the UI (still valid server-side for anything that resolves an existing subscription).
- No `schema.prisma` change — `Subscription.planCode` is a plain string field (line 917), not an enum-backed FK, so old values remain valid without a migration.

**Failing test first:**
- Integration test: an org with an existing `Subscription.planCode = "STARTER_MONTHLY"` still resolves its original £149/50-AV30 entitlements via `getPlanDefinition()` after this PR ships.
- Integration test: a new checkout session created after this PR uses a new-tier plan code by default.

**Rollback:** Revert the UI default; no data was written or migrated, so rollback is a pure code revert.

---

## Acceptance criteria

- [ ] `GET /health` returns a `version` field matching `package.json`'s `version`.
- [ ] Four new plan codes exist in the catalogue files with the dev-doc's target display prices/limits; none of the six existing plan codes (`CORE_MONTHLY`, `CORE_YEARLY`, `STARTER_MONTHLY`, `STARTER_YEARLY`, `GROWTH_MONTHLY`, `GROWTH_YEARLY`) changed definition.
- [ ] The four new codes have real Stripe Prices behind them in every environment they're tested/launched in, wired via `STRIPE_PRICE_MAP`/`STRIPE_PRICE_MAP_TEST`; a `STRIPE_TEST`-mode checkout for each succeeds end-to-end.
- [ ] SMS and AV30-block price codes are rejected by `ALLOWED_PRICE_CODES`; Storage remains purchasable.
- [ ] The AV30 hard-cap enforcement path (`entitlements-enforcement.service.ts`) has zero diff, verified by its existing test suite passing unmodified.
- [ ] Pricing/buy pages show four cards with Storage as the only add-on, priced from the live Stripe fetch with the catalogue as a display fallback only.
- [ ] A new checkout defaults to a new-tier plan code; an existing Starter/Growth/Core subscription's entitlements *and Stripe subscription* are provably unchanged (integration test, not just inspection) — grandfathering relies on Stripe itself continuing to bill the original subscription's original Price ID, which this phase never touches.
- [ ] Tag `v2.0.1` cut once all six PRs are merged and green **and** the Stripe-side setup for PR 0.2 is confirmed live in production (not just staging).

## Open decisions

1. **New plan-code naming** (PR 0.2) — needs a human decision before implementation starts; this is customer/Stripe-metadata-visible and becomes part of the `STRIPE_PRICE_MAP` env var's key names.
2. **`enforcePlanAddonPolicy()`'s exact post-PR-0.4 shape** (delete the dead AV30 branch vs. leave it inert) — an implementation-time call, not a design decision, flagged so it isn't missed.
3. **Whether the catalogue's fallback prices for the four new tiers currently match what anyone has actually configured in Stripe** — this doc set has no visibility into the live Stripe dashboard. Confirm the real Price IDs/amounts with whoever owns Stripe before PR 0.2's operational half, rather than assuming the dev doc's figures are already set up there.
