# Plan-First Configurator Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public configurator plan-first, enforce exact-plan module policy at every billing boundary, provision customer-selected included modules after payment, and compose all selected artwork inside one accessible scene.

**Architecture:** `@pathway/pricing` owns a pure exact-plan policy shared by the web and API. The browser stores customer-selected included modules separately from paid optional modules. The API validates both sets against the policy and provider price configuration, stores and charges only validated paid add-ons, then provisions the selected inclusions during webhook activation. Older pending orders without explicit selections retain their historical fixed bundle. The visual stage derives one deduplicated entitlement scene from plan inclusions, paid selections, and storage.

**Tech Stack:** TypeScript, Next.js 14, React 18, NestJS 10, Prisma 5, Jest 29, Framer Motion 11, pnpm workspaces.

## Global Constraints

- Enterprise routes immediately to `/demo?plan=enterprise` and never enters checkout.
- Home remains absent.
- Growth plans allow three customer-selected included modules; Professional plans allow six. Starter allows none. All eligible self-serve modules may be chosen for those slots.
- Legacy plan codes keep no new included allowance; preserve established Growth and Professional legacy subscription bundles when activating older pending orders.
- Included modules are never stored as paid selections or sent as Stripe line items.
- The API rejects unknown, contact-only, ineligible, and unpriced module combinations before creating a pending order.
- No database migration or production rollout change is allowed.
- Use strict TypeScript without `any`, suppression comments, or new dependencies.
- Follow TDD for every production behavior: write and run a failing test, implement the minimum, then rerun the focused suite.

---

### Task 1: Shared exact-plan configurator policy

**Files:**

- Create: `packages/pricing/src/configurator-plan-policy.ts`
- Modify: `packages/pricing/src/index.ts`
- Create: `apps/web/__tests__/configurator-plan-policy.spec.ts`

**Interfaces:**

- Produces: `CONFIGURATOR_MODULE_CODES`, `ConfiguratorModuleCode`, `ConfiguratorPlanPolicy`, `getConfiguratorPlanPolicy(planCode: string)`.
- Policy shape: `{ outcome: "checkout" | "contact"; includedModuleLimit: number; eligibleOptionalModules: readonly ConfiguratorModuleCode[]; legacyIncludedModules: readonly ConfiguratorModuleCode[]; contactPath?: string }`.
- All policy arrays are immutable. New Growth and Professional choices come from the full eligible set; `legacyIncludedModules` is used only for pre-existing pending orders without explicit selections.

- [x] **Step 1: Write the failing policy contract test**

  Assert Starter, Growth, and Professional monthly/yearly slot limits and eligible module sets, Enterprise contact outcome/path, legacy plan codes with no new allowances and preserved historical bundles, unknown lookup returning `undefined`, valid module codes, and immutable policy arrays.

- [x] **Step 2: Verify RED**

  Run: `pnpm --filter @pathway/web exec jest --runInBand __tests__/configurator-plan-policy.spec.ts`

  Expected: FAIL because `configurator-plan-policy` is not exported.

- [x] **Step 3: Implement the pure policy**

  Define all nine current module codes once. New Starter allows zero included modules and exposes all nine as optional. New Growth allows three customer-selected modules; New Professional allows six. Both expose all nine as eligible choices. Preserve Growth's prior Finance/Events/Advanced Reporting and Professional's prior Finance/Events/Advanced Reporting/HR/Asset Management/AI Workspace as the legacy pending-order fallback. Existing Core/Minimum/Starter/Growth codes have no new allowance and expose all nine. Enterprise has `outcome: "contact"`, no modules, and `contactPath: "/demo?plan=enterprise"`.

- [x] **Step 4: Verify GREEN**

  Run the focused Jest command and `pnpm --filter @pathway/pricing typecheck`.

- [x] **Step 5: Commit**

  Commit: `feat: add exact configurator plan policy`

### Task 2: Authoritative checkout module validation

**Files:**

- Modify: `apps/api/package.json`
- Modify: `apps/api/tsconfig.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/api/src/billing/buy-now.service.ts`
- Modify: `apps/api/src/billing/tests/buy-now.service.spec.ts`

**Interfaces:**

- Consumes: `getConfiguratorPlanPolicy()` and `ConfiguratorModuleCode` from Task 1.
- Produces: one private resolver in `BuyNowService` that returns only validated paid `Module[]` values.

- [x] **Step 1: Write failing API tests**

  Cover public and authenticated checkout. Included modules submitted by the browser are stripped. Eligible priced optional modules are deduplicated, stored in `PendingOrder.selectedModules`, and passed to the provider. Ineligible, unknown-plan, contact-only, GoCardless module, and Stripe-unpriced selections reject before pending-order creation.

- [x] **Step 2: Verify RED**

  Run: `pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects unit --runInBand src/billing/tests/buy-now.service.spec.ts`

  Expected: new policy tests fail against the current permissive selection logic.

- [x] **Step 3: Wire the shared package and implement validation**

  Add `@pathway/pricing` as a workspace dependency and TypeScript path/include. Replace `normalizeSelectedModules` plus the separate price assertion with one policy-driven resolver. Resolve after plan-code normalization, reject unknown/contact plans, remove included modules, reject anything outside `eligibleOptionalModules`, then validate provider price availability. Use the returned paid set everywhere the service computes add-on presence, persists the order, or calls the provider.

- [x] **Step 4: Verify GREEN**

  Run the focused service suite and API typecheck.

- [x] **Step 5: Commit**

  Commit: `fix: enforce module eligibility before checkout`

### Task 3: Server-derived module provisioning

**Files:**

- Modify: `apps/api/src/billing/webhook.controller.ts`
- Modify: `apps/api/src/billing/tests/billing-webhook.controller.spec.ts`

**Interfaces:**

- Consumes: exact plan inclusions from Task 1 and paid selections validated in Task 2.
- Metadata keeps `billingSource: "subscription"` and `subscriptionId`, and adds `entitlementSource: "plan" | "add-on"`.

- [x] **Step 1: Write failing webhook tests**

  Assert Growth activates up to three customer-selected included modules plus one purchased module, Professional activates up to six customer-selected included modules without an add-on charge for those selections, explicit empty choices grant no new bundle, legacy orders without explicit selections retain established bundles, duplicates activate once, and renewal/cancellation still filter modules by `subscriptionId`.

- [x] **Step 2: Verify RED**

  Run: `pnpm --filter @pathway/api exec jest -c jest.projects.config.ts --selectProjects unit --runInBand src/billing/tests/billing-webhook.controller.spec.ts`

  Expected: selected inclusions are missing and metadata has no entitlement source.

- [x] **Step 3: Implement server-derived union activation**

  Resolve `pendingOrder.planCode` through the shared policy inside webhook handling. Use explicit included selections when the order carries the selection marker (including an explicit empty list); for older orders without that marker, preserve the established Growth/Professional bundle. Build a deduplicated union of included and paid module codes, convert at the Prisma boundary, and upsert each module with its correct source metadata. Do not change renewal or cancellation queries.

- [x] **Step 4: Verify GREEN**

  Run the webhook suite, the checkout service suite, and API typecheck.

- [x] **Step 5: Commit**

  Commit: `feat: provision bundled plan modules after payment`

### Task 4: Plan-first state machine and safe optional selections

**Files:**

- Modify: `apps/web/app/configure/state.ts`
- Modify: `apps/web/lib/module-catalog.ts`
- Modify: `apps/web/__tests__/configurator-state.spec.ts`
- Modify: `apps/web/__tests__/configurator-steps.spec.ts`

**Interfaces:**

- State field becomes `selectedOptionalModules: WebModule[]`.
- Produces: `includedModulesForState(state)`, `configuredModulesForState(state)`, and policy-aware selection reconciliation.
- `selectPlan` and `selectFrequency` receive live module prices and remove included, ineligible, or unpriced optional modules.

- [x] **Step 1: Write failing reducer tests**

  Assert Plan is initial and first progress step, School alone uses the setting step, single-vertical types resolve immediately on selection, state stores only optional modules, changing plans/frequency reconciles safely, a downgrade does not convert a formerly included module into a paid selection, and the configured union is deduplicated.

- [x] **Step 2: Verify RED**

  Run the two focused web state suites.

- [x] **Step 3: Implement the minimum state transition changes**

  Reorder progression to Plan, Organisation, School Setting when required, Included, Modules, Storage, Summary. Derive inclusions from the shared policy. Reuse the shared module code type in `module-catalog.ts`. Guard module toggles with the selected policy and live interval price.

- [x] **Step 4: Verify GREEN**

  Run the focused suites and web typecheck.

- [x] **Step 5: Commit**

  Commit: `feat: make configurator state plan first`

### Task 5: Plan-first screens, checkout payload, and totals

**Files:**

- Modify: `apps/web/app/configure/page.tsx`
- Modify: `apps/web/app/configure/steps/plan.tsx`
- Modify: `apps/web/app/configure/steps/modules.tsx`
- Modify: `apps/web/app/configure/steps/summary.tsx`
- Modify: `apps/web/components/configurator/running-total.tsx`
- Modify: `apps/web/lib/configurator-checkout.ts`
- Modify: `apps/web/lib/buy-now-pricing.ts`
- Modify: `apps/web/__tests__/configurator-checkout.spec.ts`
- Modify: `apps/web/__tests__/configurator-steps.spec.ts`
- Modify: `apps/web/__tests__/module-catalog.spec.ts`

**Interfaces:**

- Enterprise selection invokes immediate navigation to `/demo?plan=enterprise` without recording a checkout plan.
- Modules step receives `includedModules`, `selectedOptionalModules`, policy eligibility, and live module prices.
- Summary receives and labels included modules separately from paid add-ons.

- [x] **Step 1: Write failing screen and payload tests**

  Assert Enterprise uses the contact path, Plan is rendered first, included cards are locked and labelled by plan, ineligible cards are absent, unpriced eligible cards are disabled, totals exclude inclusions, summary separates inclusions/add-ons, and checkout payload contains optional modules only.

- [x] **Step 2: Verify RED**

  Run the three focused web suites.

- [x] **Step 3: Implement screen orchestration**

  Pass policy-derived data through typed props. Keep module fallback prices out of selectable live module state. Replace Enterprise mailto with an immediate router navigation. Update total and checkout builders to consume `selectedOptionalModules` only.

- [x] **Step 4: Verify GREEN**

  Run focused web suites and web typecheck.

- [x] **Step 5: Commit**

  Commit: `feat: surface bundled modules in configurator`

### Task 6: Composed scene and truthful organisation previews

**Files:**

- Create: `apps/web/components/configurator/scene-layout.ts`
- Modify: `apps/web/components/configurator/stage.tsx`
- Modify: `apps/web/lib/module-catalog.ts`
- Modify: `apps/web/__tests__/configurator-assets.spec.ts`

**Interfaces:**

- Produces: deterministic percentage-based `sceneSlots(count)` for 1-3 large foreground objects, 4-6 compact one-row objects, and 7-10 staggered two-row objects.
- Stage consumes the deduplicated configured-module union from Task 4.

- [x] **Step 1: Write failing scene tests**

  Assert single vertical art appears immediately, School preview contains Independent/ACE/State images before subtype selection, a chosen subtype replaces the preview, all module/storage images render inside the 3:2 frame, no external grid/card/shelf remains, slot layouts are stable for 1, 4, and 7 objects, decorative images have empty alt text, the stage has one concise accessible description, and reduced motion uses opacity-only transitions.

- [x] **Step 2: Verify RED**

  Run: `pnpm --filter @pathway/web exec jest --runInBand __tests__/configurator-assets.spec.ts __tests__/configurator-state.spec.ts`

- [x] **Step 3: Implement the composed scene**

  Keep the organisation or School preview as the base layer. Place included modules, paid optional modules, and storage as absolute transparent foreground layers within the same frame using `sceneSlots`. Remove the separate thumbnail strip and object cards. Keep the surface background when imagery fails.

- [x] **Step 4: Verify GREEN**

  Run focused asset/state suites and web typecheck.

- [x] **Step 5: Commit**

  Commit: `feat: compose configurator artwork in one scene`

### Task 7: Cross-slice verification and documentation closure

**Files:**

- Modify only files required to fix findings from verification.
- Update: `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and `graphify-out/graph.html` through Graphify, not manual edits.

- [x] **Step 1: Run integration coverage**

  Run all pricing, relevant web, API unit, API integration/e2e, typecheck, lint, and build commands that cover the changed packages. Confirm Starter plus a priced module, Growth with three customer-selected included modules plus one priced module, Professional with six customer-selected included modules without module charges, explicit zero selections, legacy pending-order fallback, and Enterprise direct contact behavior.

- [x] **Step 2: Run Graphify update**

  Run `graphify update .` after all code and documentation changes. Read the updated report and query the checkout-to-webhook path again.

- [x] **Step 3: Inspect every changed file and self-review the complete diff**

  Check strict types, imports, exports, accessible semantics, responsive behavior, error states, tenant boundaries, Stripe line items, webhook renewal/cancellation behavior, debug output, and requirement coverage.

- [x] **Step 4: Fix every Critical or Important review finding and rerun its covering checks**

- [x] **Step 5: Commit**

### Verification closure (2026-07-23)

- Pricing typecheck/lint, focused configurator and compatibility suites (99 tests), focused API billing unit suites (59 tests), web/API typecheck/lint/build, and Graphify update/query passed.
- Product decision recorded 2026-10-11: Growth has three and Professional six customer-selected included modules. Existing plan subscriptions retain their historical fixed bundle; pending orders without the explicit-selection marker use that bundle only for webhook compatibility. Module Stripe prices remain Proposed and must not be created by this change.
- Verified: Starter paid module selection, Growth customer-selected included modules plus one paid module, Professional customer-selected inclusions without module charges, explicit zero selections, legacy pending-order fallback, Enterprise direct contact, and subscription-scoped renewal/cancellation module metadata queries.
- E2E is deterministic but skipped because the required local database at `localhost:5433` is unavailable. Workspace build is blocked by missing admin API build configuration. `pnpm audit --prod` is blocked because audit metadata cannot be sent to npm without explicit approval.

  Commit: `test: verify plan-first configurator entitlements`
