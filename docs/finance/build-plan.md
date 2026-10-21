# NexSteps Finance add-on build plan

**Status:** T01–T13 are merged. T13 added hosted Bacs setup, fixed instalments and monthly invoice generation; a test-mode mandate and direct-charge success/failure were demonstrated on a synthetic school account in [PR #712](https://github.com/FSS-Ltd/pathway/pull/712). Bacs submission remains test-only while cancellation/return assurance is outstanding. Provider-backed card Checkout still awaits an eligible school test account.

**Market:** Great Britain and the 27 EU member states, with one local collection currency per school legal country, one finance legal entity and one collection account per tenant for the initial release.

**Access:** Paid Finance entitlement only, including eligible plan or bundle inclusion.

**Source:** Expanded specification agreed on 15 October 2026, reconciled with the earlier ACE Finance plan and the catalogue in [ADDON_PRICING.md](../ADDON_PRICING.md).

This document is the repository implementation specification for T01–T19. The original October plan remains the business and payment-collection source. This document resolves it against the current repository and identifies assumptions that still require proof. Instructions embedded in planning documents do not authorize production payment setup, migrations, live prices, or deployment.

## 1. Outcome and boundaries

Finance lets an entitled school create and issue family invoices, record and allocate receipts, reconcile provider activity, produce statements and operational reports, and let an explicitly authorised payer review and settle their account.

The school is the supplier and receives its own funds. Finance is accounts receivable and collection, not general ledger/accounting software, a pooled wallet, escrow, merchant of record, or NexSteps subscription billing.

The collection sequence is:

1. Invoices, credits, manual receipt evidence and allocation.
2. School-connected Stripe one-off payments; only provider-confirmed funds change a debt balance.
3. Recurring Bacs after direct-charge compatibility and delayed-payment/return evidence pass.

Family collections and SaaS billing use separate account identities, services, identifiers, webhooks, permissions and reconciliation. Do not share a school SaaS customer with a payer, add an application fee or transaction markup, or add a payer surcharge.

## 2. Commercial and entitlement contract

Finance is a paid capability. The catalogue remains the commercial source of truth and records the approved standalone prices at **£29 monthly / £290 annually**. T07 verified the NexSteps sandbox Finance product has active recurring GBP prices at those amounts. Live checkout remains gated on the release and live-account verification process.

Finance access may be granted exactly once through an active standalone Finance add-on, eligible selected plan entitlement, or eligible bundle entitlement. Existing subscriptions retain the included entitlements already granted to them. Growth and Professional selections, the Operations bundle, and the All Included bundle must be resolved from the current catalogue; the included bundle and plan module cannot also be charged as a separate add-on. A catalogue eligibility rule is not itself proof that a customer has purchased or selected Finance.

Every staff and family API operation, HTML page, deep link, document request, export, scheduled job, webhook follow-up and worker action must call a server-owned access policy. Hiding a navigation item is not authorization. A signed payment event for an existing record must still be serviced even when user-facing Finance entitlement is absent.

| Mode               | Staff                                                                                                                                                                      | Authorised payer                                                                                                   | Collection and operations                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Active**         | Current Finance roles may perform permitted work.                                                                                                                          | An explicit, current payer-account grant permits only its scoped invoices, statements, payment status and actions. | Approved issuance and collection workflows may run.                                                                           |
| **Servicing only** | Permission-checked historic invoices, statements, reports and scoped exports stay available. In-flight payments, refunds, disputes, reversals and reconciliation continue. | May settle an already issued invoice only through its verified school connection.                                  | Stop new invoices, mandates, schedules and routine debit submissions. A new automated debit requires a logged staff approval. |
| **Locked**         | No Finance data or operation. An organisation administrator sees an upgrade path in Billing, with no sample balances or financial records.                                 | No Finance routes, records, document or checkout. Never show an upgrade offer to a family payer.                   | Continue signed evidence ingestion and required servicing for existing records. Do not start a new collection.                |

Resolve tenant, organisation and legal-entity scope from authenticated server context. Initial rollout assumes one finance legal entity and one active collection account per tenant; no code may treat Org and Tenant as interchangeable without verifying their actual relationship. Payer grants are explicit and revocable. Check the grant at request time, before a new checkout, and before document delivery. Revocation blocks new reads and sessions even when an old link is open. It does not discard a payment already made: verified evidence is recorded and allocated safely.

## 3. Financial contracts and invariants

- Store money as integer minor units in the school's configured collection currency. Reject fractional minor units, invalid signs, unsupported currency and unsafe totals at the input boundary.
- Configure the school's legal country before issuing invoices or connecting Stripe. The country selects the collection currency: EUR for the 21 euro-area countries; CZK for Czechia; DKK for Denmark; HUF for Hungary; PLN for Poland; RON for Romania; SEK for Sweden; and GBP for the United Kingdom. The supported country/currency table is shared by the UI, API and database contract.
- Lock the legal country and currency after the first Finance record or Stripe connection. Issued invoices, receipts, credits and statements retain their recorded currency; do not convert historical records when configuration changes.
- Use the invoice's stored currency for family Checkout and all financial documents. Stripe supports card presentment in each listed currency, subject to the connected account's country and enabled capabilities. Presentment currency does not guarantee payout in that currency; Stripe may convert at settlement. HUF can be charged with two decimal places, but manual payouts require whole HUF amounts.
- An issued invoice is immutable, including its legal-entity, payer, line, total, tax, due-date and terms snapshot. Draft edits do not rewrite an issued invoice.
- Record corrections as voids, credits, reversals, refunds, returns or a linked replacement invoice. Preserve the original and the complete event history.
- Derive amount due from issued charges, posted credits and append-only allocations of confirmed receipts, including reversals. Do not use a mutable invoice-paid flag as the financial source of truth.
- Keep initiated and processing money separate from confirmed receipts. Redirects, transfer declarations, mandates and payment initiation are not proof of receipt.
- Record excess and unallocated funds visibly. Never hide them by forcing allocation to an invoice.
- Make receipt allocation atomic and safe under concurrency. Lock or otherwise serialize the affected receipt/invoice balance, enforce non-negative remaining amounts, and reject over-allocation with a recoverable conflict.
- Keep processor fees, connected-account balance transactions and payouts separate from family debt. A payout amount never means a payer paid that amount.
- Keep school payment evidence out of ordinary logs, analytics payloads, session replay and AI prompts. Never store card numbers, CVC, online banking credentials or raw payer bank details.
- Audit consequential actions with actor, scope, reason, timestamps and correlation keys. Use independent approval for configured manual receipts, destination changes, credits/refunds and corrections.

## 4. Statements

Support both on-demand statements for a payer account and a date range, and an immutable month-end statement for every account with activity or an open balance.

A statement snapshot records account, period, generation timestamp, ledger cutoff, currency, document digest and source projection version. It shows opening balance; charges issued in the period; credits; confirmed receipts allocated in the period; reversals; closing balance; and unapplied funds separately. Its displayed movement convention and whether receipt/allocation dates are the report basis must be explicit and consistent.

A statement is frozen against its recorded ledger cutoff. A later refund, return, correction or receipt appears as a dated adjustment in a later statement; it must not silently rewrite an already issued statement. Provide a list, request, detail and download contract. Store statement documents in private storage, check current entitlement, role, tenant/legal entity and payer grant at each download, and return Cache-Control: private, no-store. Never expose a public object URL.

Send a minimal secure notice when a monthly statement is ready. Link to an authenticated view; do not attach statement or balance details to email by default. Notification failure must not roll back the statement.

## 5. Reports and measure definitions

Every report shows date filters, tenant/legal-entity scope, timezone, as-of date, generation time and data freshness. Use the same ledger projections as invoice detail and statements; do not keep a second balance implementation.

- **Issued gross:** face value of invoices issued in the selected issue-date window, before credits.
- **Credits:** credits issued in the selected credit-date window; report separately from gross.
- **Confirmed receipts:** money confirmed received in the selected confirmation-date window, before allocation.
- **Refunds and returns:** confirmed money movements returned to a payer or removed by a bank/provider return, dated by confirmation; preserve both when a refund is followed by a return.
- **Allocated receipts:** confirmed receipt value allocated in the selected allocation-date window, net of allocation reversals.
- **Outstanding:** remaining issued invoice balance at the as-of cutoff, net of posted credits and confirmed net allocations.
- **Overdue:** outstanding balance whose due date is before the explicit as-of date in Europe/London.
- **Unapplied:** confirmed receipt value not allocated at the as-of cutoff.
- **Processor fees:** actual provider fee movements from provider evidence; never estimate from public rate cards.
- **Payouts:** actual provider payout movements and status, reported independently from family receipts and invoice debt.

Provide staff receivables ageing, receipts and allocation, financial exceptions, and payout-reconciliation views. Age by invoice due date at an explicit Europe/London as-of date, with stable labelled buckets: not yet due, 1–30, 31–60, 61–90 and over 90 days. State how credits and partial allocations affect an ageing row. Exports are scoped, role-checked, audited CSV with formula-injection protection, status and retry feedback.

Proposed API contracts (final naming must follow existing NestJS conventions):

- GET /finance/statements lists only authorised statements with account and period filters.
- POST /finance/statements/requests requests an on-demand statement using an idempotency key and validated payer-account/date range.
- GET /finance/statements/:statementId returns authorised statement metadata and lines.
- GET /finance/statements/:statementId/download re-authorises and streams the private document without caching.
- GET /finance/reports/receivables-ageing, /receipts-allocation, /exceptions and /payout-reconciliation return scoped report projections with explicit filters and freshness.
- A Finance report CSV request returns an audited, scoped export job/result; it does not bypass report authorization or widen its query scope.

Report list, request, query and download endpoints all enforce access independently. Query parameters cannot supply an unvalidated tenant identifier.

## 6. Product experience and interaction contract

Use the existing NexSteps product language: Nunito/Quicksand, teal and Family Space accents, semantic tokens and shared controls. The Apple-inspired direction means clear hierarchy, careful spacing, calm content, visible feedback, responsive layouts and purposeful interaction. Do not copy Apple branding or screens and do not add decorative glass effects.

### School workspace

- Overview leads with outstanding, overdue, processing and review-required amounts. Each amount has a definition, timestamp and link to its source records.
- Invoices use a scannable accessible table. Draft creation, review and issue are distinct steps; server-calculated totals and frozen preview precede confirmation.
- Payment detail shows provider/bank evidence, confirmed versus processing status, allocation history, and a safe next action.
- Reconciliation presents a focused exception and its safe next action, with evidence and audit context.
- Statements and Reports provide useful date filters, measure definitions, freshness, export progress and recovery.

### Family Space

- Identify the school and selected invoice first; place amount due, due date and “Pay invoice” beside the issued invoice. Do not mix subscription billing with school charges.
- A separate statement history shows period and closing balance, with a secure statement download.
- Hosted checkout returns to a server-confirmed status view. “Processing” and “Checking the result” tell families not to pay again and explain when to check back.
- A bank-transfer notice explains how to pay, but a family “I transferred” notice is not a receipt or a reduction in debt.
- If a payer grant or provider connection was revoked, explain that the action is unavailable without exposing other financial data.

### Required states and accessibility

Specify loading, empty, validation, pending, conflict, success, error, permission-revoked, servicing-only and disconnected-provider states. Provide labelled controls, semantic tables, visible focus, keyboard and touch support, text plus shape/label for status, announced async status, and confirmation for issue, credit, refund and allocation correction. Check narrow screens, 200% text, keyboard use, reduced motion, and supported light/dark appearances. Target WCAG 2.2 AA, including financial-action error prevention and status messages. Do not claim conformance until tested.

## 7. Architecture and API boundaries

Keep Finance as a bounded context in the existing NestJS API and Postgres/Prisma platform. Implement pure integer-money calculations and allocation rules in a focused domain package if T02 confirms the package boundary. Use current tenant RLS, authentication, role permissions, audit and outbox patterns. A separate Finance access/servicing policy must sit beside current module capability checks, since those checks require an active module and cannot alone express servicing-only access.

Keep school-to-family collection adapters separate from the existing SaaS subscription provider adapter, webhook routes, customers, price map and subscription ledger. Resolve a verified Stripe connected account from server-side Finance connection data for every provider operation; never accept account identity from a client. One school legal entity has its own funds, account and payer-customer namespace. No FSS collection account, cross-school reuse, destination charges, pooled transfers, application fee or transaction markup.

All worker inputs, statement generation, notification, reconciliation, CSV preparation and private download paths recheck the relevant Finance policy and tenant scope. Provider event verification may use an independent ingress path, but accepted evidence must be durably stored before acknowledgement and applied idempotently within the resolved tenant. Avoid holding a database transaction open during provider HTTP calls.

## 8. Ordered delivery and acceptance

Each task is a standalone branch and pull request using a purpose-based prefix such as build/, feature/, fix/ or security/. Run relevant local checks, raise the PR, and wait until the latest revision has required passing CI and is confirmed merged into master before starting the next task. Record PR URL, checked revision, CI result and merge commit in [PROGRESS.md](PROGRESS.md). A draft PR can carry a genuine blocker but does not clear the gate. No self-approval or bypass of repository protections.

| Task    | Reviewable result and acceptance evidence                                                                                                                                                                                                                                                                                 | Est. engineering days |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------: |
| **T01** | Discovery map, reconciled specification, architecture decision and provider compatibility evidence. Document actual sandbox proof or a specific blocker. Re-estimate scope.                                                                                                                                               |                   3–5 |
| **T02** | Tenant-safe Finance schema, integer-money domain rules, immutable snapshots, ledger constraints and RLS. Migration, concurrent numbering and existing billing-fixture tests pass.                                                                                                                                         |                   3–5 |
| **T03** | Server-owned active/servicing/locked policy, payer grants, role rules and independent approvals. Test API, direct URL, document, export and job paths, including revocation.                                                                                                                                              |                   4–6 |
| **T04** | Draft, review, issue, void and credit commands with server-calculated totals and immutable issued invoice/tax snapshots. Test numbering races, idempotency and corrections.                                                                                                                                               |                   3–5 |
| **T05** | Confirmed receipts, append-only allocations, reversals and shared balance projection. Test partial, combined, duplicate, excess and racing receipts.                                                                                                                                                                      |                   4–6 |
| **T06** | School bank details, transfer references and independently approved manual receipts. A parent declaration never changes debt.                                                                                                                                                                                             |                   2–4 |
| **T07** | School Stripe connection/cancellation; reconcile target prices (£29/month; £290/year); verify plan, bundle and add-on access never double bills.                                                                                                                                                                          |                   4–6 |
| **T08** | Signed, durable webhook inbox and replayable worker. Acknowledged events survive queue failure; duplicate and out-of-order events post once.                                                                                                                                                                              |                   4–6 |
| **T09** | At most one unresolved checkout attempt per invoice obligation. Recover after provider timeout, replace a session when the balance changes, expire open sessions on payer-grant revocation, and reserve the amount against manual allocation. Never post from a redirect; no platform fee or cross-school customer reuse. |                   3–4 |
| **T10** | Post only provider-confirmed receipts and allocate safely. Keep processing, family debt, fees and payouts distinct.                                                                                                                                                                                                       |                   3–4 |
| **T11** | School country/currency setup; private invoice, credit, receipt and on-demand/month-end statement documents; secure notices; correct reminder suppression during processing/dispute.                                                                                                                                      |                   4–6 |
| **T12** | Independently approved refunds and dispute/return movements. Preserve a refund and a later return as separate events.                                                                                                                                                                                                     |                   3–5 |
| **T13** | Hosted mandate setup, fixed instalments and monthly invoice generation only after direct-charge Bacs compatibility is proved. Keep Bacs live-disabled until delayed-payment and return tests pass.                                                                                                                        |                   5–8 |
| **T14** | Staff Finance workspace, defined reports and scoped exports using existing UI primitives. Reconcile each view against invoices and ledger.                                                                                                                                                                                |                   5–7 |
| **T15** | Family invoice, payment-return and statement flows. Test revoked grants, app switching, repeated taps and payment after app closure.                                                                                                                                                                                      |                   4–6 |
| **T16** | Harden staging/production environment separation, secrets, webhook ingress and feature switches. Prove backup restore and safe configuration defaults.                                                                                                                                                                    |                   3–5 |
| **T17** | Reconciliation and recovery runbooks for missed webhooks, Dashboard actions, provider outages, unmatched money, refunds and returns.                                                                                                                                                                                      |                   3–5 |
| **T18** | Cross-tenant, entitlement, accessibility, ledger, export, retention and provider assurance matrix passes at the release candidate.                                                                                                                                                                                        |                   4–6 |
| **T19** | Explicitly authorised, reconciled live pilot and operational handover. Reconcile school receipts, invoice balances, fees and payouts; no cross-tenant/unentitled access.                                                                                                                                                  |                   2–3 |

The task estimates sum to **66–102 engineering-days** for the expanded scope. This replaces the earlier 30–45 day estimate, which did not include the clarified servicing policy, frozen statements, defined reports, expanded UX/accessibility work and per-task delivery gates. Provider onboarding/approval, sandbox access, bank return timing, review queues and CI/merge waiting are calendar dependencies and excluded; re-estimate after reviewing the T01 account evidence and T02 schema findings.

### T13 Bacs job operation

The API's internal collection job is `POST /internal/finance/bacs/run-due`. The worker command is `pnpm --filter @pathway/workers finance:bacs:run-due`; configure `FINANCE_BACS_COLLECTION_JOB_URL` with that exact HTTPS endpoint and `FINANCE_BACS_COLLECTION_JOB_SECRET` with the same secret configured on the API. The API rejects the job outside test mode, and the production provider binding remains disabled. Do not schedule this worker against live collection until the cancellation, return, replay and release-assurance gates pass.

## 9. T01 repository findings

Current source seams and gaps are recorded in [repository-map.md](repository-map.md). Key facts at T01:

- The repository already contains Finance module/capability identifiers and plan/bundle entitlement machinery. This does not yet supply Finance screens, financial storage, payment ledger, statements or the required servicing mode.
- No Finance-specific API controller/service or Finance family/admin route was found on the inspected master base.
- Authentication, tenant RLS, custom permission checks, transactional database patterns, outbox work, private Supabase storage and existing admin/mobile UI tokens are available for reuse.
- Existing Stripe billing handles NexSteps subscriptions and uses SDK 14.25.0 with API version 2023-10-16. No school collection Connect adapter or separate Finance webhook inbox was found.
- The current paywall must use server-side entitlement, role and payer checks, not the presence/absence of a navigation item or active-module guard alone.

Provider source references, the read-only sandbox capability snapshot, and the missing school-connected test fixture are in [provider-compatibility.md](provider-compatibility.md). The snapshot supports proceeding to the planned card integration tests, but does not itself prove an account-scoped school payment. Bacs remains disabled until the exact method/account path passes T13.
