# Phase 3 — Detailed build plan (billing integration: modules become purchasable)

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.3.0` (tag `v2.3.0`)
**Depends on:** Phase 0 (new tier plan codes + `STRIPE_PRICE_MAP` mechanism — merged in PRs #168–175), Phase 1 (`Module` enum, `OrgModule` model, `orgHasModule` resolver — merged in PRs #176–183), Phase 2 (`PlatformController` modules endpoints + the `metadata.billingSource` convention this phase populates — merged in PRs #185–190).
**Blocks:** Phase 5 (the configurator's checkout handoff needs modules to be purchasable), and turns Phase 2's non-production module toggle into a real, billing-driven activation path in production.
**Companion to:** [`03-billing-integration.md`](03-billing-integration.md) — that doc is the summary; this one pins down the exact type additions, checkout line-item code, webhook write-sites, upsert shapes, and test bodies so a build session can execute PR-by-PR with no invention.

---

## Purpose

Phase 1 shipped the `OrgModule` model and the `orgHasModule` resolver; Phase 2 shipped the Org Settings **Modules** card and a `POST /platform/modules/toggle` endpoint that is **server-rejected in production** (`platform.controller.ts:113`). So today the only way an `OrgModule` row gets written in production is… there isn't one. Modules are visible and gate-able, but nothing an org can pay for actually turns one on.

Phase 3 closes that loop: it makes the 8 modules **purchasable** through the existing Stripe checkout, and makes a completed payment **write the `OrgModule` rows** — activating on purchase, extending on renewal, cancelling on subscription end. It extends the existing billing path; it does **not** build a second billing integration.

### The finding that makes this phase narrower than the dev doc's diagram

The dev-doc billing flow (§10) shows a "Cache refreshed → navigation rebuilt" step between webhook processing and the module becoming usable. **There is no cache.** Grounded: `grep -rl "redis|ioredis" apps/api/src packages` returns nothing, and both entitlement paths read Postgres live on every call —

- `EntitlementsService.resolve()` (`entitlements.service.ts:81-94`) does three fresh `findFirst` reads per call, no memoization.
- `orgHasModule()` (`packages/platform/src/modules.ts:4-14`) does one fresh `findUnique` and checks `status === "ACTIVE"` + `expiresAt` on every call.

So "cache refreshed" and "navigation rebuilt" are not implementation steps here — they're automatic, because the resolvers are always-fresh. **This phase's entire job is: write the `OrgModule` row correctly and idempotently. There is nothing else to invalidate.**

### The second finding: the write path is already idempotency-friendly

`handleWebhook()` (`webhook.controller.ts:106-209`) already dedups by `billingEvent.findFirst` on `payloadJson.eventId` (118-132) **before** doing any work, and writes the `billingEvent` marker (173) **after** `applyEvent()` runs (169). If `applyEvent` throws, the marker is never written, so Stripe's retry re-attempts rather than being swallowed. Module activation is added **inside** this same `applyEvent` path, using `orgModule.upsert` against the `[orgId, module]` unique constraint (`schema.prisma:169`), so a redelivered event is naturally idempotent — no dead-letter machinery, no new dedup layer.

---

## Decisions locked (grounded)

1. **Module activation lives in three concrete write-sites, not one vague "inside applyEvent".** Grounded against the real call tree (`applyEvent` → `handleSubscriptionEvent` → `applyPendingOrder`):
   - **Fresh purchase** → inside the existing `$transaction` in `applyPendingOrder()` (`webhook.controller.ts:312-349`), right after `orgEntitlementSnapshot.create` (314-324). This is the only place a brand-new paid entitlement is written, and it already has the `pendingOrder` in hand — which is where the selected modules come from.
   - **Renewal** (`invoice.paid` / `subscription.updated` with an already-`COMPLETED` order or no order) → extend `expiresAt` on the org's active modules.
   - **Cancellation** (`subscription.canceled`, from Stripe's `customer.subscription.deleted`, mapped at `stripe-billing-webhook.provider.ts:79-80`) → flip active modules to `CANCELLED` (PR 3.5).

2. **`PendingOrder.selectedModules` is a typed `Module[]` column, not a `Json` bag.** Grounded: `PendingOrder` stores structured, known caps as typed columns (`av30Cap Int?`, `storageGbCap Int?`, `schema.prisma:1034-1038`) and reserves `Json?` (`flags`, `warnings`, `pendingOrgDetails`) for genuinely freeform data. A module selection is a structured, enumerable list, and the value is consumed as a typed `Module[]` to feed `orgModule.upsert` — so a typed enum-array column matches both the existing convention and the consumer. (The `03-…md` summary left this open; it is resolved here. See PR 3.2.)

3. **Billing-activated modules set `metadata: { billingSource: "subscription", subscriptionId }`.** Grounded: Phase 2 already reads `metadata.billingSource` to label a module's origin in Org Settings (`platform.controller.ts:60-66,96-104`), and its non-prod toggle writes **no** metadata (so those rows read as `billingSource: null`). Phase 3 populates `billingSource` so the settings screen distinguishes a paid module from a dev toggle with zero new plumbing — the field already exists and is already surfaced.

4. **`activatedAt` is set once, on first activation only.** The upsert's `create` branch sets `activatedAt: now`; the `update` branch never touches it. So a renewal or a redelivered event never resets the original activation timestamp.

5. **Cancellation cancels all of the org's active modules, scoped by `status`, via `updateMany`** (not `upsert`). Grounded: the code enforces a single active subscription per org (`cancelOtherActiveSubscriptionsForOrg`, `webhook.controller.ts:361-397`), so "the subscription was cancelled" means "every module it paid for is gone." `updateMany({ where: { orgId, status: ACTIVE }, data: { status: CANCELLED } })` is correct and, unlike an upsert, never fabricates a `CANCELLED` row for a module that was never active.

6. **No module tier-gating or module-level proration in this phase.** Any *valid* selected module gets a checkout line item and, on payment, an `ACTIVE` row. "Which tiers may buy which modules," bundle discounts, and mid-cycle single-module downgrades (partial removal without full cancellation) are **out of scope** — the current Stripe event parser doesn't even surface per-line-item module deltas (`mapSubscription` ignores `items.data` except for a nickname fallback, `stripe-billing-webhook.provider.ts:136-140`). Flagged as open decisions, not built.

7. **Versioning:** Phase 3 ends with a **bump-to-2.3.0** PR (root `package.json` + `packages/util/src/version.ts` `APP_VERSION`, currently `2.2.0`), mirroring Phase 2's PR 2.5.

---

## Grounded references (read once before starting)

| Purpose | Real file / anchor |
|---|---|
| Price-code type to mirror (`AddonPriceCode`) | `apps/api/src/billing/billing-provider.config.ts:6-16` (`AddonPriceCode`, `PriceCode`, `StripePriceMap`) |
| Allow-list to extend | `billing-provider.config.ts:49-70` (`ALLOWED_PRICE_CODES`, already carries Phase 0's `STARTER_49_*`/`GROWTH_99_*`/`PROFESSIONAL_149_*`) |
| Price-code env test to mirror | `apps/api/src/billing/tests/billing-provider.config.spec.ts:91-104` (Phase 0's "accepts new tier codes" test) |
| Checkout line-item block to mirror | `apps/api/src/billing/providers/stripe-buy-now.provider.ts:70-84` (the storage add-on block) + `intervalSuffix` (60) + `lineItems` init (62-65) |
| Checkout params type | `apps/api/src/billing/buy-now.provider.ts:8-19` (`BuyNowCheckoutParams`), `plan` is `BuyNowPlanSelection` |
| Checkout request types | `apps/api/src/billing/buy-now.types.ts:4-11` (`BuyNowPlanSelection`), `:31-40` (`OrgPurchaseRequest`) |
| Checkout request DTOs (class-validator) | `apps/api/src/billing/buy-now.controller.ts:33-62` (`BuyNowPlanSelectionDto`), `:108-147` (`OrgPurchaseRequestDto`); enum-validation precedent `@IsIn(Object.keys(SECTOR_LABELS))` (`:80`) |
| Both service entry points that build `PendingOrder` + params | `apps/api/src/billing/buy-now.service.ts` — `checkout()` public (`:67-205`, create at `:148-168`, params at `:170-177`); `purchaseForOrg()` authed (`:232-451`, create at `:387-401`, params at `:404-426`) |
| Checkout service test to mirror | `apps/api/src/billing/tests/buy-now.service.spec.ts:9-21` (module-level `prisma` mock), `:69-109` (assert on `pendingOrder.create` + `createCheckoutSession` args) |
| Webhook fresh-purchase write-site | `apps/api/src/billing/webhook.controller.ts:293-355` (`applyPendingOrder`), `$transaction` (312-349), snapshot create (314-324) |
| Webhook renewal/cancel dispatch | `webhook.controller.ts:211-237` (`applyEvent`), `:239-263` (`handleSubscriptionEvent`), `:265-291` (`upsertSubscription`) |
| Webhook controller test to mirror | `apps/api/src/billing/tests/billing-webhook.controller.spec.ts:17-53` (`prismaMock` + `$transaction` cb), `:184-237` (applies-pending-order case) |
| `Module`/`ModuleStatus`/`OrgModule` shapes | `packages/db/prisma/schema.prisma:131-146` (enums), `:157-171` (`OrgModule`; unique `[orgId, module]` at 169, `metadata Json?` at 165) |
| `PendingOrder` shape (target of PR 3.2) | `schema.prisma:1027-1057` (typed caps 1034-1038, `flags/warnings` Json 1039-1040) |
| Stripe → parsed event mapping | `apps/api/src/billing/stripe-billing-webhook.provider.ts:71-94` (`mapEvent`; `deleted → subscription.canceled` at 79-80) |
| Parsed event type | `apps/api/src/billing/billing-webhook.provider.ts:12-34` (`ParsedBillingWebhookEvent`; `periodEnd`, `subscriptionId`, `pendingOrderId`) |
| Fake webhook provider (tests post `test-signature`) | `billing-webhook.provider.ts:50-107`; `mapType` (117-130) — extend if a test needs a new synthetic kind |
| Module resolver activation must satisfy | `packages/platform/src/modules.ts:4-14` (`orgHasModule`: `ACTIVE` + unexpired) |
| Settings surface that consumes activation | `apps/api/src/platform/platform.controller.ts:86-105` (`GET /platform/modules`, reads `metadata.billingSource`) |
| Migration workflow | `packages/db/package.json` `prisma:migrate:dev`; naming `YYYYMMDDHHMMSS_snake_case`; Phase 1 precedent `prisma/migrations/20260718071741_add_org_vertical_and_module` |

---

## Conventions every PR follows

- **One branch per PR**, prefix `feat/` or `chore/`, lowercase commit subject (commitlint). PRs target `FSS-Ltd/pathway`. No AI attribution in commits/PRs. Stacked in order 3.1 → 3.6 (each based on the previous), as Phases 1–2 did.
- **TDD:** the failing test lands in the same PR as the code (README small-PR convention; `.env.test` + Jest; module-level `@pathway/db` mock is the house pattern, see the two spec files above).
- **No PR both writes a migration and consumes it.** PR 3.2 lands the `selectedModules` column; PR 3.3 (checkout) writes it; PR 3.4 (webhook) reads it. Each is separately revertible.
- **All module writes go through `orgModule.upsert`/`updateMany` on the `[orgId, module]` key** — never a bare `create` in the webhook path — so redelivery is idempotent by construction (Decision 4, Locked-decision 5).
- **No new webhook handler.** Every new code path is added inside the existing `applyEvent()` call tree, so signature verification (`stripe-billing-webhook.provider.ts:35-66`) and duplicate-detection (`webhook.controller.ts:118-132`) keep covering 100% of billing events, module-related or not.
- **The operational half is called out explicitly per PR.** Creating Stripe Products/Prices and wiring their IDs into `STRIPE_PRICE_MAP`/`STRIPE_PRICE_MAP_TEST` is a dashboard + env-var task no code PR can complete (Phase 0 D9). Where a PR has one, it says so.
- **After each code PR:** `graphify update .` (per repo CLAUDE.md gate).

---

## PR ordering (dependency-correct)

| PR | Branch | Scope one-liner |
|---|---|---|
| 3.1 — Module Stripe price codes | `feat/phase3-module-price-codes` | 16 `MODULE_*_{MONTHLY,YEARLY}` codes into the type + allow-list |
| 3.2 — `PendingOrder.selectedModules` column | `feat/phase3-pending-order-modules` | additive typed `Module[]` column + migration |
| 3.3 — Checkout line items for modules | `feat/phase3-checkout-modules` | thread `selectedModules` through both entry points + provider line items |
| 3.4 — Webhook: module activation | `feat/phase3-webhook-activation` | activate on purchase, extend on renewal |
| 3.5 — Webhook: module cancellation | `feat/phase3-webhook-cancellation` | cancel active modules on subscription end |
| 3.6 — Version bump `2.3.0` | `chore/phase3-version-2.3.0` | roadmap version bump |

> Code blocks below are verbatim targets. "Mirror X" means copy an existing file's shape exactly.

---

## PR 3.1 — Module Stripe price codes

**Scope:** extend the price-code space so the 8 modules can be looked up in `STRIPE_PRICE_MAP`. Storage tiers already have codes (`STORAGE_100GB_*` etc.) and are reused untouched. 8 modules × {monthly, yearly} = 16 new codes.

**Key facts (grounded):** `ALLOWED_PRICE_CODES` (`billing-provider.config.ts:49-70`) is a `Set<PriceCode>`; anything not in it is silently filtered out of the parsed map (`:171`). So adding the codes to *both* the `PriceCode` union and the allow-list is the whole code change — the parser, diagnostics endpoint, and single-quoted-JSON handling all flow through automatically (that's what Phase 0's tier-code test at `billing-provider.config.spec.ts:91-104` proves).

**`apps/api/src/billing/billing-provider.config.ts`** (E) — add a `ModulePriceCode` type mirroring `AddonPriceCode` (`:6-12`) and fold it into `PriceCode`:
```ts
export type ModulePriceCode =
  | "MODULE_FINANCE_MONTHLY"           | "MODULE_FINANCE_YEARLY"
  | "MODULE_EVENTS_MONTHLY"            | "MODULE_EVENTS_YEARLY"
  | "MODULE_TRANSPORT_MONTHLY"         | "MODULE_TRANSPORT_YEARLY"
  | "MODULE_MEALS_MONTHLY"             | "MODULE_MEALS_YEARLY"
  | "MODULE_ASSET_MANAGEMENT_MONTHLY"  | "MODULE_ASSET_MANAGEMENT_YEARLY"
  | "MODULE_HR_MONTHLY"                | "MODULE_HR_YEARLY"
  | "MODULE_AI_WORKSPACE_MONTHLY"      | "MODULE_AI_WORKSPACE_YEARLY"
  | "MODULE_ADVANCED_REPORTING_MONTHLY"| "MODULE_ADVANCED_REPORTING_YEARLY";

export type PriceCode = PlanCode | AddonPriceCode | ModulePriceCode;
```
Then add all 16 to the `ALLOWED_PRICE_CODES` set (`:49-70`), under a `// Phase 3 PR 3.1: module add-on price codes.` comment. The code string is exactly `MODULE_${Module}_${MONTHLY|YEARLY}` where `${Module}` is the enum value verbatim (`FINANCE`, `ASSET_MANAGEMENT`, `AI_WORKSPACE`, `ADVANCED_REPORTING`, …) — this is what PR 3.3's lookup builds.

**Operational half (open decision — see below):** create the 8 Stripe Products, a monthly + yearly Price each, and add the 16 Price IDs to `STRIPE_PRICE_MAP` (live) and `STRIPE_PRICE_MAP_TEST` (test) per environment. **Module prices are not specified anywhere in the dev doc** (§4 lists the catalogue with no prices) — this needs commercial sign-off before the operational half can run. The code PR does not block on it; an unpriced module simply has no map entry and PR 3.3 skips its line item (see below).

**Failing test first** — extend `billing-provider.config.spec.ts`, mirroring the Phase 0 tier-code test (`:91-104`):
```ts
it("Phase 3 PR 3.1: accepts the module price codes in STRIPE_PRICE_MAP", () => {
  process.env.BILLING_PROVIDER = "STRIPE";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
  process.env.STRIPE_PRICE_MAP = JSON.stringify({
    MODULE_FINANCE_MONTHLY: "price_fin_m",
    MODULE_AI_WORKSPACE_YEARLY: "price_ai_y",
  });
  const config = loadBillingProviderConfig();
  expect(config.stripe.priceMap?.MODULE_FINANCE_MONTHLY).toBe("price_fin_m");
  expect(config.stripe.priceMap?.MODULE_AI_WORKSPACE_YEARLY).toBe("price_ai_y");
});

it("Phase 3 PR 3.1: filters out an unknown module price code", () => {
  process.env.BILLING_PROVIDER = "STRIPE";
  process.env.STRIPE_SECRET_KEY = "sk_test";
  process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
  process.env.STRIPE_PRICE_MAP = JSON.stringify({
    MODULE_FINANCE_MONTHLY: "price_fin_m",
    MODULE_NOT_A_REAL_ONE_MONTHLY: "price_bogus",
  });
  const config = loadBillingProviderConfig();
  const map = config.stripe.priceMap as Record<string, string> | undefined;
  expect(map?.MODULE_FINANCE_MONTHLY).toBe("price_fin_m");
  expect(map?.MODULE_NOT_A_REAL_ONE_MONTHLY).toBeUndefined();
});
```

**Rollback:** revert the type + allow-list additions. No Stripe objects need deleting to roll back the code; unmapped codes are inert.

---

## PR 3.2 — `PendingOrder.selectedModules` column

**Scope:** record which modules were chosen at checkout, so the webhook (PR 3.4) knows what to activate. Additive, typed, defaulted-empty — nothing reads it until PR 3.4, so it ships dark.

**`packages/db/prisma/schema.prisma`** (E) — add to `PendingOrder` (near the typed caps at `:1034-1038`):
```prisma
  selectedModules  Module[]  @default([])
```
Typed `Module[]` (Decision 2), defaulted `[]` so every existing and future row is valid without a data backfill. This generates a Postgres `"Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[]` column.

**Migration** (N) — `pnpm --filter @pathway/db prisma:migrate:dev --name add_pending_order_selected_modules`. Review the generated SQL: it must be a single `ALTER TABLE "PendingOrder" ADD COLUMN "selectedModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[];` with **no** table rewrite of existing rows beyond the default. Follows Phase 1's additive-enum-model precedent (`migrations/20260718071741_add_org_vertical_and_module`).

**Failing test first** — a schema/migration round-trip test. Two acceptable homes, both DB-test-only (guarded by `requireDatabase()` + localhost assertion, the guard Phase 1 added after the production-DB incident; **never** point it at a pooler host):
- Extend an existing `PendingOrder`-touching e2e, **or**
- A focused spec: create a `PendingOrder` with `selectedModules: [Module.FINANCE, Module.EVENTS]`, read it back, assert the array is `["FINANCE", "EVENTS"]`; create one with the field omitted, assert it reads back `[]` (the default). The `@pathway/db`-importing test runs only under `requireDatabase()`.

**Rollback:** revert the migration + schema line. The column is additive with a default and has no readers until PR 3.4, so a revert is data-safe.

---

## PR 3.3 — Checkout line items for modules

**Scope:** let a buyer select modules at checkout, persist the selection to `PendingOrder.selectedModules`, and add one Stripe line item per selected module. Threads through **both** entry points (`checkout()` public + `purchaseForOrg()` authed) — grounded: both build a `PendingOrder` and a `BuyNowCheckoutParams` independently.

**`apps/api/src/billing/buy-now.types.ts`** (E) — add the field to the selection and the authed request:
```ts
import type { Module } from "@pathway/db";           // add to imports
// in BuyNowPlanSelection (:4-11):
  selectedModules?: Module[];
// in OrgPurchaseRequest (:31-40):
  selectedModules?: Module[];
```

**`apps/api/src/billing/buy-now.controller.ts`** (E) — validate on both DTOs, mirroring the `@IsIn(Object.keys(SECTOR_LABELS))` enum precedent (`:80`):
```ts
import { IsArray } from "class-validator";           // add to imports
import { Module } from "@pathway/db";                // add to imports
// in BuyNowPlanSelectionDto (:33-62) and OrgPurchaseRequestDto (:108-147):
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(Module), { each: true })
  selectedModules?: Module[];
```

**`apps/api/src/billing/buy-now.service.ts`** (E) — thread `selectedModules` **alongside** the existing add-on plumbing, deliberately **not** through `enforcePlanAddonPolicy` (that function gates capacity add-ons on the core tier; modules aren't capacity add-ons, so routing them through it would only risk them being stripped). Two edits per entry point:
- `checkout()` — read `const selectedModules = sanitisedPlan.selectedModules ?? [];`, add `selectedModules` to the `pendingOrder.create` data (`:148-168`), and add it to `providerParams.plan` (`:170-177`): `plan: { ...gatedPlan, selectedModules }`.
- `purchaseForOrg()` — read `const selectedModules = request.selectedModules ?? [];`, add to the `pendingOrder.create` data (`:387-401`), and to `providerParams.plan` (`:404-426`).

**`apps/api/src/billing/providers/stripe-buy-now.provider.ts`** (E) — after the storage block (`:70-84`), add the module block, mirroring its shape exactly (`intervalSuffix` from `:60`; `MONTHLY`/`YEARLY`):
```ts
// Module add-ons: one line item per selected module, at the plan's billing interval.
const selectedModules = params.plan.selectedModules ?? [];
for (const module of selectedModules) {
  const id = priceMap[`MODULE_${module}_${intervalSuffix}` as keyof StripePriceMap];
  if (id) {
    lineItems.push({ price: id, quantity: 1 });
  } else {
    this.logger.warn(
      `No Stripe price for MODULE_${module}_${intervalSuffix}; skipping module line item`,
    );
  }
}
```
An unmapped module (no Price ID yet — see PR 3.1's operational half) logs and is skipped, exactly like the storage block silently skips an unmapped tier. It never aborts checkout.

**Failing test first** — extend `buy-now.service.spec.ts` (mirror `:69-109`): a `checkout({ plan: { planCode: "STARTER_49_MONTHLY", selectedModules: [Module.FINANCE, Module.EVENTS] } })` call asserts `pendingOrder.create` was called with `data: expect.objectContaining({ selectedModules: ["FINANCE", "EVENTS"] })`, and that `createCheckoutSession` received `plan.selectedModules` of length 2. Add a matching `purchaseForOrg` case. (Line-item **count** assertions belong in a `StripeBuyNowProvider` spec with a stubbed `priceMap`; if none exists, the service-level `createCheckoutSession` arg assertion is the reviewable contract, since the provider is faked in the service suite.)

**Rollback:** revert the four files. Module line items stop being added and `selectedModules` stops being persisted; plan/storage/AV30 checkout is unaffected (each block is independent). The PR 3.2 column simply goes back to always-empty.

---

## PR 3.4 — Webhook: module activation

**Scope:** on a completed purchase, write `OrgModule` rows `ACTIVE` for the order's selected modules with `expiresAt = subscription periodEnd`; on renewal, push `expiresAt` forward on the org's already-active modules. Both live inside the existing `applyEvent()` call tree (no new handler).

**Key facts (grounded):** the fresh-purchase path is `applyEvent` → `handleSubscriptionEvent` → `applyPendingOrder` (only when `pendingOrder.status !== COMPLETED`, `webhook.controller.ts:255-257`), and `applyPendingOrder` already wraps its writes in a `$transaction` (`:312-349`) and holds the `pendingOrder`. The renewal path is `handleSubscriptionEvent` returning after `upsertSubscription` for an already-`COMPLETED`/absent order. So there are exactly two insertion points.

**`apps/api/src/billing/webhook.controller.ts`** (E):

1. Add `Module, ModuleStatus` to the `@pathway/db` import (`:13-21`).

2. Two private helpers:
```ts
/**
 * Activate the modules chosen at checkout. Called inside applyPendingOrder's
 * transaction so activation commits atomically with the entitlement snapshot.
 * Idempotent: upsert on [orgId, module]; activatedAt is set once (create only).
 */
private async activateModulesFromPendingOrder(
  tx: Prisma.TransactionClient,
  orgId: string,
  pendingOrder: PendingOrderRecord,
  event: ParsedBillingWebhookEvent,
): Promise<void> {
  const modules = pendingOrder.selectedModules ?? [];
  if (modules.length === 0) return;
  const now = new Date();
  const metadata = {
    billingSource: "subscription",
    subscriptionId: event.subscriptionId ?? null,
  };
  for (const module of modules) {
    await tx.orgModule.upsert({
      where: { orgId_module: { orgId, module } },
      create: {
        orgId,
        module,
        status: ModuleStatus.ACTIVE,
        activatedAt: now,
        expiresAt: event.periodEnd ?? null,
        metadata,
      },
      update: {
        status: ModuleStatus.ACTIVE,
        expiresAt: event.periodEnd ?? null,
        metadata,
      },
    });
  }
}

/**
 * Renewal: push expiry forward on the org's currently-active modules.
 * No-op when the org has none, or when the event carries no periodEnd.
 */
private async extendActiveModulesExpiry(
  orgId: string,
  periodEnd: Date | null | undefined,
): Promise<void> {
  if (!periodEnd) return;
  await prisma.orgModule.updateMany({
    where: { orgId, status: ModuleStatus.ACTIVE },
    data: { expiresAt: periodEnd },
  });
}
```

3. Call the activation helper inside `applyPendingOrder`'s transaction (`:312-349`), immediately after the `orgEntitlementSnapshot.create` (`:314-324`):
```ts
await this.activateModulesFromPendingOrder(tx, actualOrgId, pendingOrder, event);
```

4. Call the renewal helper in `handleSubscriptionEvent` (`:239-263`) on the two non-fresh, active exits. After the `if (pendingOrder) { … }` block's `upsertSubscription`, and again after the trailing `upsertSubscription`/`maybeSnapshotEntitlements`, guard on active status:
```ts
if (status === SubscriptionStatus.ACTIVE) {
  await this.extendActiveModulesExpiry(event.orgId, event.periodEnd);
}
```
(The fresh-purchase branch already activated with the right `expiresAt`; re-extending it to the same `periodEnd` is a harmless no-op, so the guard needn't special-case it.)

**Failing test first** — extend `billing-webhook.controller.spec.ts`. Add `orgModule: { upsert: jest.fn(), updateMany: jest.fn() }` to `prismaMock` (`:17-53`); the existing `$transaction` mock already passes `prismaMock` as `tx`, so `tx.orgModule.upsert` resolves to the mock. Then:
```ts
it("activates selected modules on a completed purchase", async () => {
  const pending = { /* …as :185-201… */ selectedModules: ["FINANCE", "EVENTS"] };
  prismaMock.pendingOrder.findUnique.mockResolvedValue(pending);
  prismaMock.billingEvent.findFirst.mockResolvedValue(null);
  (provider.verifyAndParse as jest.Mock).mockResolvedValue({
    ...baseEvent, pendingOrderId: pending.id,
  });

  await controller.handleWebhook({ dummy: true }, "test-signature");

  expect(prismaMock.orgModule.upsert).toHaveBeenCalledTimes(2);
  expect(prismaMock.orgModule.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { orgId_module: { orgId: baseEvent.orgId, module: "FINANCE" } },
      create: expect.objectContaining({
        status: "ACTIVE",
        expiresAt: baseEvent.periodEnd,
        metadata: expect.objectContaining({ billingSource: "subscription" }),
      }),
    }),
  );
});

it("is idempotent when the same purchase event is redelivered", async () => {
  // Second delivery: dedup marker already present → no writes at all.
  prismaMock.billingEvent.findFirst.mockResolvedValue({ id: "existing" });
  const result = await controller.handleWebhook({ dummy: true }, "test-signature");
  expect(result.status).toBe("ignored_duplicate");
  expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
});

it("extends module expiry on renewal instead of creating rows", async () => {
  // No pending order (or a COMPLETED one) → renewal path.
  prismaMock.pendingOrder.findUnique.mockResolvedValue(null);
  prismaMock.pendingOrder.findFirst.mockResolvedValue(null);
  prismaMock.billingEvent.findFirst.mockResolvedValue(null);
  (provider.verifyAndParse as jest.Mock).mockResolvedValue({
    ...baseEvent, kind: "invoice.paid",
  });

  await controller.handleWebhook({ dummy: true }, "test-signature");

  expect(prismaMock.orgModule.updateMany).toHaveBeenCalledWith({
    where: { orgId: baseEvent.orgId, status: "ACTIVE" },
    data: { expiresAt: baseEvent.periodEnd },
  });
  expect(prismaMock.orgModule.upsert).not.toHaveBeenCalled();
});
```
The middle test proves the composed idempotency the dev doc asks for (§10): the dedup marker stops a redelivery before any work, and the upsert would make it safe even if it slipped through. Keep the existing "applies pending order caps" test (`:184-237`) passing unchanged — activation is additive to it.

**Rollback:** revert the two helpers and their two call-sites. The existing plan/AV30/storage snapshot writes are untouched (activation is additive within the same transaction, not a rewrite). `OrgModule` rows already written stay valid.

---

## PR 3.5 — Webhook: module cancellation

**Scope:** when a subscription ends, flip the org's active modules to `CANCELLED` so `orgHasModule()` returns `false` for them immediately (no cache — Locked-decision 6 / the no-cache finding). Additive to PR 3.4.

**Key facts (grounded):** Stripe's `customer.subscription.deleted` is already mapped to `kind: "subscription.canceled"` with `status: CANCELED` (`stripe-billing-webhook.provider.ts:79-80,152`), and `applyEvent` already routes it to `handleSubscriptionEvent(event, CANCELED)` (`webhook.controller.ts:230-231`). So the dispatch exists; this PR only adds the module write. There is **no** Stripe event here for *partial* module removal (dropping one module while keeping the subscription) — the parser doesn't surface per-line-item deltas — so this PR handles full-subscription cancellation only (see Open decisions).

**`apps/api/src/billing/webhook.controller.ts`** (E) — one helper + one call-site:
```ts
/** Subscription ended: revoke every module it entitled. */
private async cancelActiveModules(orgId: string): Promise<void> {
  await prisma.orgModule.updateMany({
    where: { orgId, status: ModuleStatus.ACTIVE },
    data: { status: ModuleStatus.CANCELLED },
  });
}
```
In `handleSubscriptionEvent` (`:239-263`), right after the valid-orgId guard (`:244-250`):
```ts
if (status === SubscriptionStatus.CANCELED) {
  await this.cancelActiveModules(event.orgId);
}
```
Placed before the pending-order/upsert logic so it runs regardless of which downstream branch a cancel event falls into. `updateMany` scoped by `status: ACTIVE` never fabricates rows and is a no-op for an org with no active modules (Locked-decision 5).

**Failing test first** — in `billing-webhook.controller.spec.ts`:
```ts
it("cancels active modules when the subscription is canceled", async () => {
  prismaMock.billingEvent.findFirst.mockResolvedValue(null);
  (provider.verifyAndParse as jest.Mock).mockResolvedValue({
    ...baseEvent, kind: "subscription.canceled", status: "CANCELED",
  });

  await controller.handleWebhook({ dummy: true }, "test-signature");

  expect(prismaMock.orgModule.updateMany).toHaveBeenCalledWith({
    where: { orgId: baseEvent.orgId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
});
```
Optionally, a DB-backed assertion (test-DB only) that after a cancel event, `orgHasModule(orgId, Module.FINANCE)` returns `false` — the end-to-end proof that no cache hides a stale `ACTIVE`.

**Rollback:** revert the helper + call-site. Modules stay `ACTIVE` until manually corrected — which is exactly the pre-PR-3.5 behaviour, so a revert is not a regression.

---

## PR 3.6 — Version bump `2.3.0`

**Scope:** bump the product version to match the roadmap (Phase 3 ships as `2.3.0`).

**Key files:**
- Root `package.json` — `"version": "2.2.0"` → `"2.3.0"`.
- `packages/util/src/version.ts` — `APP_VERSION = "2.2.0"` → `"2.3.0"`.

**Failing test first:** update the existing version assertions that pin `2.2.0` — grep `"2.2.0"` / `2\.2\.0` across `apps` + `packages` (the admin footer test and the `/health` version check are the ones Phase 2's PR 2.5 last touched) and update each expectation. `/health` and the web/admin footers read `APP_VERSION`, so bumping the constant flows through; the tests prove the surfaced value changed.

**Release note (human/CI, not a code change):** annotated tag `v2.3.0` + GitHub release; the release body is the changelog (no `CHANGELOG.md`, per D4). Call out in the body that modules are now purchasable and that the **Stripe module Products/Prices must exist and be mapped** in the target environment (PR 3.1's operational half) for the feature to function.

**Rollback:** revert the two constants + test expectations.

---

## Acceptance criteria

- [ ] All 16 `MODULE_*_{MONTHLY,YEARLY}` codes are accepted by `ALLOWED_PRICE_CODES` and reachable via `STRIPE_PRICE_MAP` in at least staging; a `STRIPE_TEST`-mode checkout including a module succeeds end-to-end (PR 3.1 + operational half).
- [ ] `PendingOrder.selectedModules` records the checkout selection; the column defaults to `[]` and needs no backfill (PR 3.2).
- [ ] A checkout with N selected modules produces exactly plan-line-item + N module-line-items; an unmapped module is skipped with a warning, never an abort (PR 3.3).
- [ ] A completed purchase writes `ACTIVE` `OrgModule` rows with correct `expiresAt` and `metadata.billingSource = "subscription"`, so Org Settings labels them as billing-driven (PR 3.4).
- [ ] Redelivering a purchase webhook is provably idempotent — dedup stops it first, and the upsert would make it safe regardless: no duplicate rows, no throw (PR 3.4).
- [ ] A renewal event advances `expiresAt` on existing active modules rather than creating rows (PR 3.4).
- [ ] A subscription-cancel event flips the org's active modules to `CANCELLED`; `orgHasModule()` returns `false` for them on the very next call, with nothing to invalidate (PR 3.5).
- [ ] Every new code path lives inside the existing `applyEvent()` tree; signature verification and duplicate-detection still cover 100% of billing events (all PRs).
- [ ] Product version reads `2.3.0` in `/health` and the admin footer (PR 3.6).

## Open decisions

1. **Module pricing (blocks PR 3.1's operational half, not its code).** The dev-doc module catalogue (§4) lists no prices. Needs commercial sign-off on monthly/yearly amounts for all 8 modules before the Stripe Products/Prices can be created and mapped. Recommend one Product per module, two recurring Prices each.
2. **Whether any module is tier-gated** (e.g. Advanced Reporting only on Professional+). This phase gates nothing — any valid selected module is purchasable. If gating is wanted, it belongs in `enforcePlanAddonPolicy` (or a sibling) and should be its own small PR with its own tests; flagged, not built.
3. **Partial module removal without full cancellation.** Dropping one module mid-subscription while keeping the plan produces a `customer.subscription.updated` whose line-item delta the current parser (`mapSubscription`, `stripe-billing-webhook.provider.ts:126-161`) does not surface. Supporting it needs the parser to read `items.data` prices back to module codes — a real extension, deferred. Until then, module set changes go through cancel-and-repurchase or the Phase 2 non-prod toggle.
4. **`metadata.billingSource` value string.** This plan uses `"subscription"`. If Org Settings copy wants something more specific (e.g. the plan code or `"stripe"`), it's a one-line change in `activateModulesFromPendingOrder`; confirm the desired label with whoever owns the settings screen wording.
5. **Grandfathering / existing active subscriptions.** Orgs that bought before Phase 3 have no modules and no `selectedModules` history; they acquire modules only through a new purchase or the future upgrade flow (D5). No backfill is attempted here.
