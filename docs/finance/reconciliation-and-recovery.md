# T17 reconciliation and recovery

State: implementing. Base: `e3f6124d1ff2b2d48add3661d6063164de2c3f8b`, after T16 implementation and evidence PRs merged.

## Scope and invariants

T17 delivers a five-minute unresolved-operation sweep, a daily provider sync with a seven-day overlap, persisted coverage/cursors, settlement comparisons, staff cases, dry-run repairs and three incident runbooks. It consumes the existing durable webhook inbox, canonical receipt/refund/return handlers, tenant RLS, Finance servicing policy and staff workspace. The acceptance cases are A10, A17, A26, A30 and A45 from the supplied programme, plus interrupted pagination and lost-webhook recovery.

Reconciliation reads Stripe in the stored school account and environment. It never creates a payment, refund, mandate or collection instruction. It may recover provider identifiers, enqueue verified provider observations and replay existing evidence through the existing handlers. Unknown payments create cases; they never become inferred family receipts. Fees and payouts remain separate from family debt.

Staff reads and actions use Finance access modes, roles and tenant/legal-entity checks. Background servicing continues for existing connections after entitlement cancellation or disconnection; an inaccessible provider account creates a visible case and does not erase the last successful coverage.

## Delivery within the T17 PR

1. Add an account-scoped, read-only Stripe reconciliation adapter with page and object retrieval contracts. Validate account, environment, resource identity, pagination progress and response shape. Test malformed pages, stale cursors and outages before implementation.
2. Add tenant-scoped reconciliation state and case persistence, immutable evidence provenance and database constraints/RLS. Record migration impact and prove cross-tenant rejection.
3. Add bounded sync and unresolved-operation runners. Persist a fixed coverage window and advance only after durable page handling. Reuse the window after interruption. Scan events plus current payments, sessions, refunds, disputes and settlement records. Fetch unresolved historical objects independently of the recent window.
4. Feed recovered observations into the existing canonical handlers with explicit API-reconciliation provenance. Match immutable operation/account/amount/currency facts before linking a recovered identifier. Surface unmatched money, stale coverage, provider access failures, refund-plus-return and settlement differences.
5. Add gated staff case inspection and safe replay/recheck actions, worker entry points, a dry-run command and missed-webhook, provider-outage, and refund/return runbooks. Dry run does not write rows or move a cursor.
6. Run focused unit/contract/database/UI tests and the controlled sandbox dry run, then local quality checks and a fresh branch review. Rebase on current GitHub master before raising the T17 PR. Require current-revision CI and confirmed merge before the evidence update and the requested pause before T18–T19.

## Recovery and coverage rules

- Each connection and provider stream owns a cursor, fixed window, last completed cutoff and last successful sync time. A lease prevents concurrent writers; a crashed lease can be reclaimed without discarding progress.
- Daily sync starts from the previous completed cutoff minus seven days. An initial sync covers the preceding seven days. A retention gap is explicit and cannot be labelled fully reconciled.
- Stripe v1 events are available for up to 30 days and retain their creation API version. Events supplement current object reads; they are not the sole recovery source. [Stripe events](https://docs.stripe.com/api/events/list)
- A page cursor commits with that page's durable observations and cases. A failed page leaves the cursor unchanged. Invalid/stale pagination restarts the same fixed window with idempotent capture and a visible coverage case.
- Existing operation identity is retained beyond provider idempotency retention. Unknown outcomes are inspected, never recreated blindly. Stripe may prune v1 idempotency keys after 24 hours. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- A Checkout identifier lost after provider acceptance is recovered from account-scoped sessions and matched immutable metadata. A redirect, transfer notice, mandate or processing object never confirms a receipt. [Stripe Checkout sessions](https://docs.stripe.com/api/checkout/sessions/list)
- Settlement comparison uses integer minor units per currency. Balance transactions, fees and payouts are evidence for processor settlement, not a second receipt ledger.
- Case acknowledgements and repairs are audited. Repair actions enqueue/replay evidence only; financial corrections retain the existing independent approval flows.

## Data and release impact

The intended migration is additive: reconciliation state, scoped cases/history and API-recovery provenance for inbox evidence. It must preserve existing issued snapshots, economic identities and append-only ledger rows. All new financial records require forced tenant RLS, scoped foreign keys and indexes for bounded jobs. No live provider configuration or deployment is part of T17.

Live checkout remains subject to commercial approval. Bacs remains live-disabled. Finance pricing remains £29 monthly / £290 annually. After T17 is merged and its evidence recorded, pause before T18 or T19 as requested.

## Implementation checkpoint

The first T17 increment adds the read-only provider adapter for the eight streams above and prevents aged unknown Checkout attempts from being locally expired or retried past a 23-hour safety window. The original Checkout path could replace an unknown attempt after 25 hours; regression tests at 23, 24 and 26 hours now retain the original obligation and return checking status. Recent retries still reuse the original operation key.

Focused verification passed: three API suites / 29 tests, API typecheck, targeted ESLint, changed-file Prettier and whitespace checks. The adapter tests cover account and mode isolation, each resource path, resumed pagination, repeated/empty/malformed pages, stale cursors and provider outages.

The second increment adds `FinanceReconciliationState`, `FinanceReconciliationCase` and append-only `FinanceReconciliationCaseEvent`, plus immutable signed-webhook/API-reconciliation provenance on inbox records. Migration `20261130000000_finance_reconciliation_recovery` is additive and preserves existing financial snapshots; existing inbox rows default to signed-webhook provenance. It was applied only to a disposable local PostgreSQL 16 database. Scoped foreign keys and forced RLS protect all three new tables, and API-recovered evidence must match its stored school connection, environment and payload identity.

Database verification passed after observing the missing-table failures and correcting a NULL-sensitive money check: 14 reconciliation tests plus 10 existing ledger/RLS tests, all 24 passing. Prisma validation/client generation, API and database typechecks, targeted lint, formatting and whitespace checks passed. The strict RLS gate passed with the repository's existing accepted-exposure setting; it reported the unchanged `ChildGuardianContact`, `IdentityWebhookEvent` and `OrgDeletedUser` tables as RLS-disabled. All new Finance tables passed enforced RLS checks.

The third increment adds tenant-checked lease and page transactions, a fixed-window planner and a bounded runner. A page's durable work and cursor commit atomically; a stale worker cannot capture a page after lease reclamation. Invalid cursors restart the retained window after backoff and create a case. Retention gaps remain open after the available period completes. Repeated identical provider failures reuse one case without duplicate history, and a completed window resolves its transient provider/cursor/capture cases. Dry-run pages use inspection callbacks without claiming leases or writing state.

Verification for this increment: 11 real-database page/lease tests and 16 window/runner unit tests passed, following observed missing-behavior failures. API typecheck, targeted ESLint, formatting and whitespace checks passed. The API-observation handler and scheduled entry points are still pending; the runner is not yet registered for execution.

The feature is not complete: scheduled jobs, canonical recovered evidence processing, operator UI, dry-run/sandbox evidence, runbooks and full verification remain. Read-only recovery must use servicing credentials even when new collection is disabled.

The next implementation pass must inspect refund and Bacs submission timestamps and key-retention behavior as part of the unresolved-operation sweep. Provider reads must recover already accepted operations before any permitted retry; an unresolved outcome beyond the safe retry window requires a case and retains its reservation.
