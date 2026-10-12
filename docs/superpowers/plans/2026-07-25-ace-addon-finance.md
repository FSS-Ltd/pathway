# ACE Finance Add-on Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver tenant-safe family invoicing, fee assignment, manual payment allocation, private documents, family views, and finance reporting as a separately entitled add-on.

**Architecture:** Finance uses a dedicated domain package and ledger-like immutable financial events. It is isolated from NexSteps SaaS subscription billing. NestJS applies tenancy, permissions, relationship/release, audit, and outbox rules; private object storage holds generated documents.

**Price and packaging:** £15/month or £150/year, **Proposed**. Included in Growth and Professional. Eligible for Operations and All Included. Never charge an organisation again when its plan or bundle already grants Finance.

## Global Constraints

- Feature implementation may merge behind an inactive entitlement while pricing is Proposed.
- Do not create, update, or activate Stripe Products/Prices until `docs/ADDON_PRICING.md` marks Finance Approved.
- A family invoice is not a NexSteps subscription invoice. Use separate services, identifiers, webhooks, and permissions.
- Issued invoices and allocations are not silently edited. Correct with void, credit, reversal, or new event.
- No raw payment card data enters NexSteps.
- Every family read derives child scope from an active guardian relationship.

---

### Task 1: ACE-FIN01 - Add the commercial and entitlement gate

**Branch:** `feat/ace-finance-entitlement`

**Files:**
- Modify: `packages/platform/src/capability-maps.ts`
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Test: `apps/api/src/billing/addon-catalog.spec.ts`
- Test: `apps/api/src/finance/tests/finance-entitlement.e2e.spec.ts`

- [ ] Encode £15/£150 Proposed, Growth/Professional inclusion, and Operations/All Included eligibility from `ADDON_PRICING.md`.
- [ ] Test direct add-on, plan-included, bundle-included, suspended, wrong tenant, and duplicate-charge cases.
- [ ] Keep Stripe identifiers absent while Proposed.

**Acceptance:** Finance capability and charge resolution are correct for every plan/bundle state.

**Rollback:** Remove the inactive catalogue entry and capability map.

### Task 2: ACE-FIN02 - Add Finance schema, indexes, and strict RLS

**Branch:** `feat/ace-finance-schema`

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_finance/migration.sql`
- Create: `apps/api/src/finance/tests/finance-rls.e2e.spec.ts`

- [ ] Model fee schedules, invoice drafts, issued invoice versions, line items, credits, payments, allocations, document records, and outbox links with `tenantId`.
- [ ] Add unique invoice number/idempotency constraints and indexes for family, child, status, issue date, and due date.
- [ ] Enable and force RLS; test same-tenant, cross-tenant, missing-context, guardian relationship, and finance-permission paths.
- [ ] Document forward-only mitigation for rows already issued.

**Acceptance:** Direct SQL cannot cross tenant or family scope and issued records have immutable identifiers.

**Rollback:** Drop unused tables only before data is issued.

### Task 3: ACE-FIN03 - Create the pure finance domain

**Branch:** `feat/ace-finance-domain`

**Files:**
- Create: `packages/finance-domain/package.json`
- Create: `packages/finance-domain/src/invoice.ts`
- Create: `packages/finance-domain/src/allocation.ts`
- Test: `packages/finance-domain/src/invoice.spec.ts`
- Test: `packages/finance-domain/src/allocation.spec.ts`

```ts
export function calculateInvoice(input: InvoiceCalculationInput): InvoiceTotals;
export function allocatePayment(input: AllocationInput): AllocationResult;
```

- [ ] Port useful calculation cases from Oasis `packages/domain/src/invoice.ts`.
- [ ] Test currency precision, discounts, credits, overpayment, partial allocation, reversal, zero/negative invalid values, and deterministic totals.
- [ ] Keep the package pure and strict; represent money in minor units.

**Acceptance:** Invoice totals and allocation results are deterministic and independently testable.

**Rollback:** Remove the unconsumed package.

### Task 4: ACE-FIN04 - Implement fee schedules and invoice drafts

**Branch:** `feat/ace-finance-drafts`

**Files:**
- Create: `apps/api/src/finance/finance.controller.ts`
- Create: `apps/api/src/finance/invoice-draft.service.ts`
- Create: `apps/api/src/finance/dto/create-invoice-draft.dto.ts`
- Test: `apps/api/src/finance/tests/finance-drafts.e2e.spec.ts`

- [ ] Test one-off and recurring fee assignment, sibling households, discount permission, duplicate cycle, archived child, and cross-tenant denial.
- [ ] Resolve billed parties from explicit finance relationships, not display-name matching.
- [ ] Keep drafts editable and clearly non-issued; audit discounts and manual line changes.

**Acceptance:** Authorised finance staff can produce correct, reviewable household drafts.

**Rollback:** Disable draft generation; no issued facts exist.

### Task 5: ACE-FIN05 - Implement issue, void, credit, and correction commands

**Branch:** `feat/ace-finance-issue`

**Files:**
- Create: `apps/api/src/finance/invoice-command.service.ts`
- Create: `apps/api/src/finance/dto/issue-invoice.dto.ts`
- Create: `apps/api/src/finance/dto/credit-invoice.dto.ts`
- Test: `apps/api/src/finance/tests/finance-issue.e2e.spec.ts`

- [ ] Test issue numbering, concurrent issue, duplicate idempotency key, invalid draft, void-before-payment, credit-after-payment, and revoked issuer.
- [ ] Freeze line items, totals, household, terms, and due date when issued.
- [ ] Correct issued records only with traceable void/credit/new-version links.
- [ ] Emit family notification and document-render outbox records atomically.

**Acceptance:** Issued invoice history is immutable and corrections reconcile.

**Rollback:** Disable issue while retaining draft and historical read routes.

### Task 6: ACE-FIN06 - Implement manual payments, confirmation, and allocations

**Branch:** `feat/ace-finance-payments`

**Files:**
- Create: `apps/api/src/finance/payment.service.ts`
- Create: `apps/api/src/finance/dto/record-payment.dto.ts`
- Create: `apps/api/src/finance/dto/allocate-payment.dto.ts`
- Test: `apps/api/src/finance/tests/finance-payments.e2e.spec.ts`

- [ ] Test pending/confirmed/rejected manual payment, reference duplication, partial/multi-invoice allocation, overpayment credit, reversal, and concurrent allocation.
- [ ] Separate recorder from confirmer where configured; require reason and evidence metadata.
- [ ] Apply payments and allocations in a serializable transaction and write balanced outstanding totals.
- [ ] Audit every state change without storing sensitive bank detail.

**Acceptance:** Confirmed payment allocations reconcile to invoice and household balances.

**Rollback:** Disable new payment entry; historical balances remain readable.

### Task 7: ACE-FIN07 - Render private invoices, credits, and receipts

**Branch:** `feat/ace-finance-documents`

**Files:**
- Create: `apps/workers/src/finance/render-finance-document.job.ts`
- Create: `apps/workers/src/finance/finance-document.template.tsx`
- Create: `apps/api/src/finance/finance-document.service.ts`
- Test: `apps/workers/src/finance/render-finance-document.job.spec.ts`

- [ ] Render only from frozen versions and include organisation identity, invoice number, dates, lines, totals, currency, and status.
- [ ] Test long household names, pagination, credits, void watermark, deterministic checksum, provider retry, and revoked family relationship.
- [ ] Store in private storage and issue short-lived downloads after entitlement, permission, relationship, and RLS checks.

**Acceptance:** Every issued finance fact has a reproducible, private document.

**Rollback:** Pause PDF rendering and expose authorised HTML records.

### Task 8: ACE-FIN08 - Build the finance administration workspace

**Branch:** `feat/ace-finance-admin-ui`

**Files:**
- Create: `apps/admin/app/finance/page.tsx`
- Create: `apps/admin/app/finance/finance-workspace.tsx`
- Create: `apps/admin/app/finance/invoice-editor.tsx`
- Test: `apps/admin/e2e/finance-admin.spec.ts`

- [ ] Build entitlement-locked, draft, review, issue confirmation, payment record/confirm, allocation, credit, void, and document states.
- [ ] Show money in locale-aware currency while sending minor units to APIs.
- [ ] Handle loading, empty, permission revoked, conflict, validation, partial failure, retry, and export states.
- [ ] Require explicit confirmations for issue, void, credit, payment confirmation, and reversal.

**Acceptance:** Finance staff can complete the invoice lifecycle without editing immutable records.

**Rollback:** Hide administration navigation and keep APIs gated.

### Task 9: ACE-FIN09 - Build family web and mobile finance views

**Branch:** `feat/ace-family-finance-ui`

**Files:**
- Create: `apps/mobile/app/(family)/(tabs)/finance/index.tsx`
- Create: `apps/mobile/app/(family)/(tabs)/finance/[invoiceId].tsx`
- Create: `apps/admin/app/family/finance/page.tsx`
- Create: `apps/admin/app/family/finance/[invoiceId]/page.tsx`
- Test: `apps/mobile/e2e/family-finance.e2e.ts`

- [ ] Show household balance, invoice/credit/receipt timeline, status, due date, allocation summary, and private download.
- [ ] Test two children, two guardians with different finance access, ended relationship, revoked document, offline metadata, and 200% font.
- [ ] Never expose internal notes, bank evidence, other households, or NexSteps subscription data.

**Acceptance:** Authorised guardians can understand and retrieve their family finance records.

**Rollback:** Disable family finance release while retaining staff records.

### Task 10: ACE-FIN10 - Add finance notifications and reminders

**Branch:** `feat/ace-finance-notifications`

**Files:**
- Create: `apps/workers/src/finance/finance-notification.job.ts`
- Create: `apps/api/src/finance/finance-notification.policy.ts`
- Test: `apps/workers/src/finance/finance-notification.job.spec.ts`

- [ ] Test issued, due-soon, overdue, payment-confirmed, credit, void, duplicate job, quiet hours, and removed guardian.
- [ ] Use safe lock-screen copy and authenticated deep links; never include balances in push previews.
- [ ] Make reminder cadence configurable and auditable per organisation.

**Acceptance:** Finance notifications are preference-aware, idempotent, and privacy-safe.

**Rollback:** Pause the worker.

### Task 11: ACE-FIN11 - Add finance reports, exports, and reconciliation

**Branch:** `feat/ace-finance-reporting`

**Files:**
- Create: `apps/api/src/finance/finance-reporting.service.ts`
- Create: `apps/api/src/finance/finance-export.service.ts`
- Test: `apps/api/src/finance/tests/finance-reporting.e2e.spec.ts`

- [ ] Define billed, paid, credited, outstanding, overdue, and unallocated calculations with windows, denominators, and exclusions.
- [ ] Test empty data, correction events, multi-site scope, currency mismatch, export permission, and small-family privacy.
- [ ] Produce streamed CSV with formula-injection protection and audit export purpose.
- [ ] Reconcile invoice totals, credits, payments, allocations, and outstanding balance nightly.

**Acceptance:** Operational totals reconcile and exports remain tenant/permission scoped.

**Rollback:** Disable export and keep read-only summaries.

### Task 12: ACE-FIN12 - Add Stripe subscription billing after commercial approval

**Branch:** `feat/ace-finance-addon-billing`

**Files:**
- Modify: `apps/api/src/billing/addon-catalog.ts`
- Modify: `apps/api/src/billing/stripe-webhook.service.ts`
- Test: `apps/api/src/finance/tests/finance-addon-billing.e2e.spec.ts`

- [ ] Stop if the catalogue row is still Proposed; record the block rather than inventing Stripe IDs.
- [ ] After Approved, create/link monthly and annual Prices exactly once and store environment-specific identifiers.
- [ ] Test direct purchase, included plan, included bundle, upgrade, annual switch, suspension, cancellation, webhook replay, and no duplicate line item.
- [ ] Keep finance-family payments completely separate.

**Acceptance:** Approved Finance billing activates capability once and never double-charges included customers.

**Rollback:** Stop new checkout, cancel or schedule subscription item per policy, and retain customer finance data read-only.

### Task 13: ACE-FIN13 - Complete security, lifecycle, and release hardening

**Branch:** `security/ace-finance-release-gate`

**Files:**
- Create: `apps/api/src/finance/tests/finance-access-matrix.e2e.spec.ts`
- Create: `apps/api/src/finance/tests/finance-retention.e2e.spec.ts`
- Create: `docs/runbooks/finance-addon.md`
- Create: `docs/evidence/finance-addon-release-gate.md`

- [ ] Run entitlement, permission, tenant, household relationship, RLS, storage, export, and IDOR matrices.
- [ ] Test concurrent issue/allocation, webhook replay, correction chain, document access, legal hold, retention, and restore.
- [ ] Verify audit coverage and alerts for reconciliation mismatch, failed documents, payment conflict, and abnormal export.
- [ ] Record commercial approval evidence before enabling checkout.

**Acceptance:** Finance is operationally supportable and cannot cross subscription, tenant, or household boundaries.

**Rollback:** Revoke the add-on entitlement while preserving historical records under retention policy.

## Completion Evidence

- The £15/£150 Proposed commercial state and inclusion rules match `ADDON_PRICING.md`.
- Invoice, credit, payment, and allocation totals reconcile.
- Issued records and documents are immutable/private.
- Family access is relationship-scoped.
- Stripe work remains blocked until pricing is Approved.
