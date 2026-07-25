# ACE Child Merit Market Add-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an educational merit economy with a balanced ledger, child wallet, savings, giving/tithe, shop, simulated market, portfolio, positive leaderboards, reconciliation, and subscription entitlement.

**Architecture:** Merit is a non-cash, double-entry ledger. Behaviour core emits idempotent award intents; the add-on consumes them only when entitled. Savings, giving, purchases, and simulated trades post balanced transactions through one ledger command service. External market data is abstracted behind a licensed provider and stored only within accepted licence terms.

**Price and packaging:** £19/month or £190/year, **Proposed**. ACE-only. Included in All Included only for ACE organisations. Not eligible as an Operations-bundle slot unless `ADDON_PRICING.md` is changed.

## Global Constraints

- Stop launch if either commercial price approval or the market-data licence is unresolved.
- Merit units are not money, electronic money, stored value, withdrawable funds, or exchangeable for cash.
- Every posting balances to zero, is idempotent, immutable, tenant/child scoped, and traceable to an authorised command.
- Corrections are reversals and replacement postings, never row edits.
- Behaviour core remains usable with the add-on disabled.
- Do not use negative public leaderboards, shame mechanics, gambling language, leverage, short selling, real-money returns, or external trading.
- Parent/staff permissions, child self-access, RLS, and safeguarding/reporting apply to every surface.

---

### Task 1: ACE-MER01 - Add commercial, vertical, bundle, and licence gates

**Branch:** `feat/ace-merit-entitlement`

**Files:**
- Modify: `packages/platform/src/types.ts`
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Create: `apps/api/src/market-data/market-data-licence.config.ts`
- Test: `apps/api/src/merit/tests/merit-entitlement.e2e.spec.ts`

- [ ] Add `Module.CHILD_MERIT_MARKET` and typed capabilities/permissions.
- [ ] Encode £19/£190 Proposed, ACE-only applicability, and ACE-only All Included grant.
- [ ] Test non-ACE direct request, non-ACE All Included, ACE direct, ACE All Included, suspended, and duplicate-charge cases.
- [ ] Default market-data capability to denied until an accepted provider/licence configuration exists.
- [ ] Keep Stripe identifiers absent while Proposed.

**Acceptance:** Neither entitlement nor bundle logic can expose Merit to a non-ACE organisation.

**Rollback:** Remove inactive enum/catalog/config entries.

### Task 2: ACE-MER02 - Add balanced-ledger schema and strict RLS

**Branch:** `feat/ace-merit-ledger-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_merit_ledger/migration.sql`
- Create: `apps/api/src/merit/tests/merit-ledger-rls.e2e.spec.ts`

- [ ] Model accounts, immutable transactions, postings, idempotency keys, source references, reversals, wallet projections, and reconciliation runs.
- [ ] Enforce tenant/child/account scope, unique source/idempotency constraints, fixed integer units, and deferred balance validation.
- [ ] Enable and force RLS; test tenant, child self, guardian relationship, staff permission, and no-context SQL.
- [ ] Add indexes for ledger order, child balance, source lookup, and reconciliation.

**Acceptance:** The database rejects cross-scope access and cannot persist an unbalanced transaction through supported writes.

**Rollback:** Drop unused ledger tables before postings exist; never delete a live ledger.

### Task 3: ACE-MER03 - Create the pure merit ledger domain

**Branch:** `feat/ace-merit-ledger-domain`

**Files:**
- Create: `packages/merit-domain/package.json`
- Create: `packages/merit-domain/src/ledger.ts`
- Create: `packages/merit-domain/src/accounts.ts`
- Test: `packages/merit-domain/src/ledger.spec.ts`

```ts
export function createBalancedTransaction(input: MeritTransactionInput): MeritTransaction;
export function reverseTransaction(input: ReversalInput): MeritTransaction;
```

- [ ] Port useful balance/idempotency cases from Oasis `packages/domain/src/meritLedger.ts`.
- [ ] Test issue, transfer, spend, saving, giving, trade, reversal, zero, negative, overflow, duplicate source, and rounding prohibition.
- [ ] Use integer units and explicit account types; make impossible account combinations unrepresentable.

**Acceptance:** Every domain transaction either balances exactly or is rejected.

**Rollback:** Remove the unconsumed package.

### Task 4: ACE-MER04 - Implement the ledger command service

**Branch:** `feat/ace-merit-ledger-api`

**Files:**
- Create: `apps/api/src/merit/merit-ledger.service.ts`
- Create: `apps/api/src/merit/merit.controller.ts`
- Create: `apps/api/src/merit/dto/post-merit-transaction.dto.ts`
- Test: `apps/api/src/merit/tests/merit-ledger.e2e.spec.ts`

- [ ] Test entitlement, permission, source idempotency, concurrent retry, reversal, insufficient balance, wrong child, and cross-tenant IDs.
- [ ] Persist transaction and postings atomically under strict RLS and serializable protection.
- [ ] Allow commands only through named domain operations, not arbitrary client-supplied debit/credit rows.
- [ ] Audit command metadata and reason without logging sensitive narrative.

**Acceptance:** All merit mutations share one protected, balanced, idempotent write boundary.

**Rollback:** Disable posting commands; ledger reads remain.

### Task 5: ACE-MER05 - Implement wallet projections and history

**Branch:** `feat/ace-merit-wallet`

**Files:**
- Create: `apps/api/src/merit/merit-wallet.service.ts`
- Create: `apps/api/src/merit/dto/list-wallet-transactions.dto.ts`
- Test: `apps/api/src/merit/tests/merit-wallet.e2e.spec.ts`

- [ ] Project available, savings, giving, shop-spent, and invested balances from postings.
- [ ] Test rebuild determinism, correction/reversal, cursor order, source label safety, student self, guardian relationship, and staff permission.
- [ ] Return age-appropriate descriptions and no internal account or staff-note data.

**Acceptance:** Wallet balance equals the ledger and history is scope-safe.

**Rollback:** Rebuild or hide projections; never alter postings.

### Task 6: ACE-MER06 - Consume behaviour award intents idempotently

**Branch:** `feat/ace-behaviour-merit-posting`

**Files:**
- Create: `apps/workers/src/merit/behaviour-merit-posting.job.ts`
- Create: `apps/api/src/merit/behaviour-merit.policy.ts`
- Test: `apps/workers/src/merit/behaviour-merit-posting.job.spec.ts`

- [ ] Test add-on enabled/disabled, merit/neutral/demerit behaviour types, corrected event, duplicate outbox, deleted category, suspended entitlement, and replay.
- [ ] Map approved core behaviour categories to configured non-negative award units.
- [ ] Post with the behaviour fact ID as source idempotency key; reverse when an authorised correction requires it.
- [ ] Do not block behaviour capture when Merit is unavailable.

**Acceptance:** Core behaviour remains independent and each eligible fact affects the ledger once.

**Rollback:** Pause the consumer; replay retained intents after recovery.

### Task 7: ACE-MER07 - Implement authorised manual adjustments and transfers

**Branch:** `feat/ace-merit-adjustments`

**Files:**
- Create: `apps/api/src/merit/merit-adjustment.service.ts`
- Create: `apps/api/src/merit/dto/create-merit-adjustment.dto.ts`
- Test: `apps/api/src/merit/tests/merit-adjustment.e2e.spec.ts`

- [ ] Test permission, reason requirement, configured limit, maker/checker threshold, duplicate retry, reversal, and cross-child transfer denial.
- [ ] Require a named reason code plus optional safe note; flag unusual volume for review.
- [ ] Use system issuance/reclamation accounts so adjustments balance.

**Acceptance:** Manual changes are explicit, limited, reviewable, and balanced.

**Rollback:** Disable manual adjustment permissions.

### Task 8: ACE-MER08 - Implement savings goals

**Branch:** `feat/ace-merit-savings`

**Files:**
- Create: `packages/merit-domain/src/savings.ts`
- Create: `apps/api/src/merit/merit-savings.service.ts`
- Test: `apps/api/src/merit/tests/merit-savings.e2e.spec.ts`

- [ ] Test create/update/complete/archive goal, save, withdraw, insufficient available units, duplicate retry, and guardian read.
- [ ] Transfer units between child available and savings accounts; preserve goal transaction history.
- [ ] Avoid interest or financial-return claims unless separately approved.

**Acceptance:** Savings totals reconcile to ledger postings and goals cannot create units.

**Rollback:** Disable new goal operations; balances remain in accounts.

### Task 9: ACE-MER09 - Implement giving/tithe policy and destinations

**Branch:** `feat/ace-merit-giving`

**Files:**
- Create: `packages/merit-domain/src/giving.ts`
- Create: `apps/api/src/merit/merit-giving.service.ts`
- Test: `apps/api/src/merit/tests/merit-giving.e2e.spec.ts`

- [ ] Port useful concepts from Oasis `packages/domain/src/tithe.ts` without hard-coding religious terminology.
- [ ] Test site terminology, enabled destinations, voluntary transfer, insufficient balance, duplicate retry, correction, and public-total privacy.
- [ ] Transfer units to configured non-withdrawable community accounts; never imply cash donation.

**Acceptance:** Giving is voluntary, terminology-aware, balanced, and clearly non-cash.

**Rollback:** Disable destinations and retain history.

### Task 10: ACE-MER10 - Implement shop catalogue and stock

**Branch:** `feat/ace-merit-shop-catalog`

**Files:**
- Create: `packages/merit-domain/src/shop.ts`
- Create: `apps/api/src/merit/merit-shop.service.ts`
- Create: `apps/api/src/merit/dto/create-shop-item.dto.ts`
- Test: `apps/api/src/merit/tests/merit-shop-catalog.e2e.spec.ts`

- [ ] Test draft/published/archived item, integer price, site visibility, stock, per-child limit, age restriction, image safety, and cross-tenant access.
- [ ] Keep stock and price versions so historical purchases remain reproducible.
- [ ] Store images privately or through the approved safe asset path.

**Acceptance:** Staff can publish a safe, site-scoped catalogue with versioned terms.

**Rollback:** Unpublish items; historical purchases remain.

### Task 11: ACE-MER11 - Implement reservation, purchase, fulfilment, and refund

**Branch:** `feat/ace-merit-shop-purchase`

**Files:**
- Create: `apps/api/src/merit/merit-purchase.service.ts`
- Create: `apps/workers/src/merit/expire-merit-reservation.job.ts`
- Test: `apps/api/src/merit/tests/merit-purchase.e2e.spec.ts`

- [ ] Test final-stock concurrency, insufficient balance, duplicate tap, reservation expiry, fulfilment, cancellation, refund/reversal, and removed item.
- [ ] Reserve stock and units atomically for a short period; finalise through one idempotent purchase command.
- [ ] Post spend to the shop sink account and reverse/refund through linked transactions.
- [ ] Audit fulfilment without storing unnecessary child detail.

**Acceptance:** Stock cannot oversell and purchase/refund balances reconcile.

**Rollback:** Close purchases and fulfil/refund existing reservations under runbook.

### Task 12: ACE-MER12 - Define and approve the market-data provider boundary

**Branch:** `docs/ace-merit-market-provider`

**Files:**
- Create: `docs/adr/ace-merit-market-data-provider.md`
- Create: `apps/api/src/market-data/market-data-provider.ts`
- Create: `apps/api/src/market-data/disabled-market-data.provider.ts`
- Test: `apps/api/src/market-data/disabled-market-data.provider.spec.ts`

- [ ] Document candidate provider, display/storage/derived-data rights, attribution, delay, symbol coverage, cache duration, environments, costs, revocation, and exit plan.
- [ ] Obtain explicit human/legal acceptance before adding a live provider credential or enabling market routes.
- [ ] Default to a disabled provider that returns a stable unavailable result.
- [ ] Prohibit scraping or unlicensed redistribution.

**Acceptance:** The application is safe and truthful with no provider, and live data cannot be enabled without recorded licence acceptance.

**Rollback:** Select the disabled provider and purge provider data as required by licence.

### Task 13: ACE-MER13 - Implement licensed instrument and quote caching

**Branch:** `feat/ace-merit-market-data`

**Files:**
- Create: `apps/api/src/market-data/market-data.service.ts`
- Create: `apps/workers/src/market-data/refresh-market-data.job.ts`
- Create: `apps/api/src/market-data/market-data-cache.repository.ts`
- Test: `apps/workers/src/market-data/refresh-market-data.job.spec.ts`

- [ ] Proceed only after ACE-MER12 acceptance.
- [ ] Test attribution, delayed timestamp, stale data, market closed, delisted instrument, symbol change, rate limit, provider outage, and cache expiry.
- [ ] Store only licence-permitted fields for permitted duration and display delay/source clearly.
- [ ] Fail closed for orders when quote freshness exceeds the educational policy threshold.

**Acceptance:** Market data is licensed, attributable, bounded, and degrades safely.

**Rollback:** Disable refresh/routes and purge cached data per licence.

### Task 14: ACE-MER14 - Implement simulated orders and portfolio accounting

**Branch:** `feat/ace-merit-market-orders`

**Files:**
- Create: `packages/merit-domain/src/market.ts`
- Create: `apps/api/src/merit/merit-market.service.ts`
- Create: `apps/api/src/merit/dto/create-simulated-order.dto.ts`
- Test: `apps/api/src/merit/tests/merit-market-orders.e2e.spec.ts`

- [ ] Test buy/sell, whole/fraction policy, stale quote, insufficient units/holding, duplicate order, market closure, delisted instrument, and reversal.
- [ ] Convert at the recorded simulated execution price using an explicit integer scale and deterministic rounding policy.
- [ ] Post balanced ledger transactions and immutable position lots; no real broker or payment API.
- [ ] Label every surface “simulated” and “educational”.

**Acceptance:** Simulated trades reconcile to cash-like merit accounts and position lots without creating units.

**Rollback:** Disable order entry; retain portfolio valuation/read history.

### Task 15: ACE-MER15 - Build staff Merit administration

**Branch:** `feat/ace-merit-admin-ui`

**Files:**
- Create: `apps/admin/app/merit/page.tsx`
- Create: `apps/admin/app/merit/merit-admin-workspace.tsx`
- Test: `apps/admin/e2e/merit-admin.spec.ts`

- [ ] Build entitlement/licence status, award mappings, adjustment review, shop catalogue/fulfilment, giving destinations, reconciliation, and exception states.
- [ ] Use explicit confirmations for adjustments, reversals, refunds, mapping changes, and market enablement.
- [ ] Never show misleading currency symbols or permit arbitrary posting rows.

**Acceptance:** Authorised staff can operate the system through governed commands only.

**Rollback:** Hide write actions and retain reconciliation/read access.

### Task 16: ACE-MER16 - Build child wallet, savings, giving, and shop UI

**Branch:** `feat/ace-merit-child-ui`

**Files:**
- Create: `apps/mobile/app/(student)/(tabs)/merit/index.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/merit/savings.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/merit/giving.tsx`
- Create: `apps/mobile/app/(student)/(tabs)/merit/shop.tsx`
- Test: `apps/mobile/e2e/merit-wallet.e2e.ts`

- [ ] Show clear merit-unit balances, age-appropriate history, goals, voluntary giving, catalogue, stock, confirmation, reservation, fulfilment, and refund.
- [ ] Test offline, duplicate tap, insufficient units, expired reservation, revoked entitlement, 320pt, 200% font, and screen readers.
- [ ] Use no cash-withdrawal, gambling, debt, or guaranteed-reward language.

**Acceptance:** Children can understand and use their own merit units safely.

**Rollback:** Disable transactions and retain read-only history.

### Task 17: ACE-MER17 - Build the simulated market and guardian view

**Branch:** `feat/ace-merit-market-ui`

**Files:**
- Create: `apps/mobile/app/(student)/(tabs)/merit/market.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/merit/index.tsx`
- Create: `apps/admin/app/family/merit/page.tsx`
- Test: `apps/mobile/e2e/merit-market.e2e.ts`

- [ ] Gate the market screen on entitlement plus accepted/licensed provider configuration.
- [ ] Show delayed timestamp, attribution, educational disclaimer, instrument search, order review, simulated execution, holdings, cost basis, and value change.
- [ ] Show guardians a read-only child summary with no ability to transfer or trade for the child.
- [ ] Test stale/outage/closed/delisted states and prohibit language that implies real ownership.

**Acceptance:** The market is transparent, simulated, age-appropriate, and unavailable when licensing/freshness fails.

**Rollback:** Disable market routes while wallet/shop remain.

### Task 18: ACE-MER18 - Add positive, privacy-safe leaderboards

**Branch:** `feat/ace-merit-leaderboards`

**Files:**
- Create: `apps/api/src/merit/merit-leaderboard.service.ts`
- Create: `apps/mobile/src/features/merit/merit-leaderboard.tsx`
- Test: `apps/api/src/merit/tests/merit-leaderboard.e2e.spec.ts`

- [ ] Define approved positive dimensions such as participation or goal completion; exclude demerits, losses, low balances, and negative rank.
- [ ] Test opt-out/pseudonym, minimum cohort threshold, tie handling, period reset, cross-site denial, and small group suppression.
- [ ] Allow an organisation to disable leaderboards independently.

**Acceptance:** Leaderboards reward positive participation without shaming or exposing small cohorts.

**Rollback:** Disable leaderboards; ledger and wallet remain.

### Task 19: ACE-MER19 - Add reconciliation, observability, retention, and incident runbook

**Branch:** `security/ace-merit-operations`

**Files:**
- Create: `apps/workers/src/merit/reconcile-merit-ledger.job.ts`
- Create: `apps/api/src/merit/tests/merit-reconciliation.e2e.spec.ts`
- Create: `docs/runbooks/child-merit-market.md`

- [ ] Reconcile transaction balance, account totals, wallet projections, stock/reservations, holdings/lots, and source idempotency.
- [ ] Test corrupted projection detection, duplicate source, job retry, provider outage, licence withdrawal, storage retention, and restore.
- [ ] Alert on any unbalanced transaction, projection drift, unusual adjustment volume, oversold stock, stale data, or order failure spike.
- [ ] Document licence disable/purge, transaction freeze, rebuild, reversal, and child-access incident procedures.

**Acceptance:** Operators can detect, freeze, explain, and recover every merit subsystem.

**Rollback:** Freeze all new postings and serve last-known authorised read state.

### Task 20: ACE-MER20 - Add approved billing and complete the release gate

**Branch:** `feat/ace-merit-addon-billing`

**Files:**
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Modify: `apps/api/src/billing/stripe-webhook.service.ts`
- Create: `apps/api/src/merit/tests/merit-release-gate.e2e.spec.ts`
- Create: `docs/evidence/child-merit-market-release-gate.md`

- [ ] Stop Stripe and launch work while price is Proposed or market-data licence is unaccepted.
- [ ] After approval, link £19/£190 Prices and test ACE direct purchase, ACE All Included, non-ACE denial, suspension, cancellation, and webhook replay.
- [ ] Run entitlement, permission, tenant, child, RLS, ledger balance, idempotency, concurrency, stock, market, privacy, accessibility, retention, and restore matrices.
- [ ] Verify cancellation disables new earning/spending/trading under policy while preserving required history and export.

**Acceptance:** Merit launches only for entitled ACE organisations with approved pricing, accepted licensing, and balanced release evidence.

**Rollback:** Revoke entitlement, select disabled provider, freeze postings, and retain read-only history.

## Completion Evidence

- £19/month and £190/year Proposed pricing is exact.
- ACE-only and ACE-only All Included rules pass.
- Every ledger transaction balances and every source is idempotent.
- Market data has documented accepted licence terms or remains disabled.
- Children cannot cash out, borrow, gamble, privately message, or see negative leaderboards.
