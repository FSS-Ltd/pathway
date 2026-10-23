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
6. Run focused unit/contract/database/UI tests and the controlled sandbox dry run, then local quality checks and a fresh branch review. Rebase on current GitHub master before raising the T17 PR. Require current-revision CI and confirmed merge before the evidence update and the model check before T18–T19.

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

The migration is additive: reconciliation state, scoped cases/history, API-recovery provenance for inbox evidence and a nullable, once-set refund provider-attempt timestamp. Existing approved Stripe refunds receive their approval time as a conservative earliest-possible attempt time; they do not receive a fresh retry window. This may hold a never-submitted older refund for review, which is safer than recreating an unknown refund. The backfill requires an administrative migration role with `BYPASSRLS` (or superuser) and fails explicitly without it. It does not weaken RLS policies. Issued snapshots, economic identities and append-only ledger rows remain intact. No live provider configuration or deployment is part of T17.

Live checkout remains subject to commercial approval. Bacs remains live-disabled. Finance pricing remains £29 monthly / £290 annually. After T17 is merged and its evidence recorded, continue into T18/T19 only if the current model is verified as Sol; otherwise retain the requested pause for switching models.

## Implementation checkpoint

The first T17 increment adds the read-only provider adapter for the eight streams above and prevents aged unknown Checkout attempts from being locally expired or retried past a 23-hour safety window. The original Checkout path could replace an unknown attempt after 25 hours; regression tests at 23, 24 and 26 hours now retain the original obligation and return checking status. Recent retries still reuse the original operation key.

Focused verification passed: three API suites / 29 tests, API typecheck, targeted ESLint, changed-file Prettier and whitespace checks. The adapter tests cover account and mode isolation, each resource path, resumed pagination, repeated/empty/malformed pages, stale cursors and provider outages.

The second increment adds `FinanceReconciliationState`, `FinanceReconciliationCase` and append-only `FinanceReconciliationCaseEvent`, plus immutable signed-webhook/API-reconciliation provenance on inbox records. Migration `20261130000000_finance_reconciliation_recovery` is additive and preserves existing financial snapshots; existing inbox rows default to signed-webhook provenance. It was applied only to a disposable local PostgreSQL 16 database. Scoped foreign keys and forced RLS protect all three new tables, and API-recovered evidence must match its stored school connection, environment and payload identity.

Database verification passed after observing the missing-table failures and correcting a NULL-sensitive money check: 14 reconciliation tests plus 10 existing ledger/RLS tests, all 24 passing. Prisma validation/client generation, API and database typechecks, targeted lint, formatting and whitespace checks passed. The strict RLS gate passed with the repository's existing accepted-exposure setting; it reported the unchanged `ChildGuardianContact`, `IdentityWebhookEvent` and `OrgDeletedUser` tables as RLS-disabled. All new Finance tables passed enforced RLS checks.

The third increment adds tenant-checked lease and page transactions, a fixed-window planner and a bounded runner. A page's durable work and cursor commit atomically; a stale worker cannot capture a page after lease reclamation. Invalid cursors restart the retained window after backoff and create a case. Retention gaps remain open after the available period completes. Repeated identical provider failures reuse one case without duplicate history, and a completed window resolves its transient provider/cursor/capture cases. Dry-run pages use inspection callbacks without claiming leases or writing state.

Verification for this increment: 11 real-database page/lease tests and 16 window/runner unit tests passed, following observed missing-behavior failures. API typecheck, targeted ESLint, formatting and whitespace checks passed. The API-observation handler and scheduled entry points are still pending; the runner is not yet registered for execution.

The fourth increment separates provider servicing credentials from collection configuration. Existing enabled collection settings remain compatible; an explicit servicing mode/key supports existing-record work with collection disabled. Test/live runtime and key checks reject mixed environments. Webhooks, account-status reads, reports and approved refunds use the servicing binding. Account webhook refresh reads Stripe between short tenant transactions, then locks and rechecks the connection before updating; a concurrent disconnection stays disconnected. The account parser/status mapping is shared with Connect onboarding.

Verification for the servicing increment: nine focused API suites / 56 tests passed, including collection-disabled servicing, environment/key rejection and disconnection races, after observed missing-behavior failures. API typecheck, targeted ESLint, formatting and whitespace checks passed. Configuration examples contain names only. No key, environment, account, live switch or deployment was changed.

The fifth increment applies the same 23-hour safety window to Checkout, Bacs and refunds. An aged unknown Bacs attempt retains its identity and pauses its plan for review; a historical scheduling date cannot extend the wall-clock retry window. Refund preparation locks the receipt/request and commits a once-set attempt timestamp before the provider call. After the window expires, the provider may recover a matching existing refund but cannot create one. Refund lookup pagination is bounded and rejects a repeated cursor. The service distinguishes an unresolved outcome from a permanent failure and retains the approved reservation.

Verification for the retention increment: four focused API suites / 29 tests passed; four database suites / 39 tests passed, including the four new refund timestamp/approval constraints and existing reconciliation/ledger/RLS cases. The three Finance schema-contract tests, Prisma validation/generation, API/database typechecks, targeted lint, formatting and whitespace checks passed. The database tests ran only against the disposable local PostgreSQL instance. The scheduled unresolved-operation sweep and visible reconciliation cases still need to consume these retained operations; no automated repair path is registered yet.

The sixth increment implements the first recovered-object path: Checkout. It matches the stored tenant, legal entity, connection, provider account/mode, operation and invoice identifiers, amount and currency before linking a lost session. It preserves known PaymentIntent IDs. A projected evidence payload removes customer details, client secrets, arbitrary metadata and hosted Checkout URLs; an open session's verified URL remains only in the existing private operational record. Stable observation identities avoid duplicate inbox rows. Current-object envelopes use the observation time, rather than claiming the object's creation time was its later payment confirmation time.

Confirmed/processing/expired observations go through the existing canonical Checkout handler; open-session observations do not create receipts. Unmatched paid money and unresolved unpaid operations retain private evidence and scoped cases with explicit funds-confirmation context. A genuine accepted payment is recorded after a payer grant is revoked. Dry run performs no link, evidence or case writes. These helpers are not yet registered as a scheduled sync.

Verification for Checkout recovery: 20 projection/matching tests, nine runner tests and seven window tests passed (36 unit tests). Nine Checkout database tests plus 11 page/lease tests passed (20 database tests). The known-PaymentIntent regression was observed failing before its fix. API typecheck, targeted ESLint, formatting and whitespace checks passed. Provider-event, Bacs, refund, dispute and settlement ingestion, scheduled sweeps, the console, tooling, sandbox proof, runbooks and full branch verification remain in this same T17 step.

The seventh increment fixes the non-card Charge identifier gap found during a read-only sandbox check. Existing synthetic Bacs payments use `py_` Charge IDs, while the recovery/refund/dispute validators previously accepted only `ch_`. Both documented card and observed non-card shapes are now accepted; arbitrary resource IDs remain rejected. Refund metadata may be null, matching provider evidence, without becoming an operation identity. Five regression assertions failed before the fix; four focused suites / 37 tests, API typecheck, targeted lint, formatting and whitespace checks passed. The actual adapter listed four test charges and retrieved the matching successful non-card Charge. Full sandbox sync, cancellation/return and signed-event assurance remain outstanding; see [provider-compatibility.md](provider-compatibility.md).

The eighth increment adds recovered refund/dispute observations through the existing ledger handlers. Current refunds use observation time; dispute withdrawals and reinstatements use their proven balance-transaction time and principal, without fees or net settlement amounts. Original provider-event identities/times can be retained in API evidence. The matching path checks confirmed receipt scope, provider environment, amount/currency and any explicit local refund request. It does not infer successful refunds from processor debit/reversal pairs. Missing success history remains a coverage case; pending unknown operations and confirmed unmatched money remain distinct. Dry run reads the same history and reports the exception without writing.

Verification: refund projection and origin assertions failed before implementation; five initial real-database recovery tests failed before wiring. Two additional case assertions and one dry-run history-gap assertion failed before their fixes. Normal Node 24 verification passed: six focused unit suites / 70 tests, three database suites / 28 tests, API typecheck, targeted ESLint, Prettier and whitespace checks. Temporary isolated-transform diagnostics helped investigate local test latency; they do not replace the normal typed suites or typecheck, which passed. Repository test setup emitted its existing dotenv/reset informational logs. Scheduled ingestion and the remaining T17 deliverables still need implementation.

The ninth increment adds original provider-event projection and durable ingestion. Valid events retain their actual provider identity, type and creation time; current-object reads retain the separate observation-time rule. Checkout event types share the canonical handler's definition. Provider events can recover a lost session and post its confirmed receipt once. Contradictory type/status pairs remain held. Known card PaymentIntents are observations only after checking the linked operation's account/mode, principal, currency and event status. Unmatched confirmed money remains explicit, with supported-currency amounts on its case; unsupported currencies remain in minimal private evidence. Bacs event projections share canonical schemas and remove expanded customer/bank details. Current Bacs-object recovery and historical mandate reads are still pending.

Read-only enrichment resolves missing refund/dispute PaymentIntent references through their scoped Charge and expands dispute balance-transaction references before opening the page transaction. A page-local cache and four-object concurrency bound avoid repeated charge reads. A provider failure leaves the cursor unchanged. A lease lost during enrichment prevents capture. This does not register a scheduled job.

Verification: seven preparation/runner assertions, thirteen provider projection assertions, two original-Checkout database assertions and four event-ingestion assertions failed before implementation. Later regressions caught contradictory status/money, setup Checkout classification and dropped unmatched-money facts before their fixes. Normal Node 24 results: five unit suites / 49 tests; four real-database suites / 36 tests; six event-ingestion database tests passed again after extracting matching. API typecheck, targeted ESLint, Prettier and whitespace checks passed. Full T17 suite/build, scheduled integration, sandbox sync, fresh review and its PR gate remain outstanding.

The tenth increment adds current PaymentIntent recovery, using the shared observation persistence and canonical Bacs replay. It validates mode, safe principal/currency and supported status, strips secrets and private metadata, and retains unsupported/unconfirmed states for review. A real synthetic GBP fixture proves processing without a receipt followed by a single confirmed Bacs receipt/allocation. A changed principal remains held; dry run performs no link or inbox write. Original-event recovery remains unchanged through the same matching and case code. The Bacs webhook constructor now accepts only the access read and provider cancellation capability that it consumes; new collection methods are absent from its dependency type.

Verification for this increment: three new database behavior tests were observed failing before implementation, then passed. Final normal Node 24 runs passed five database suites / 39 tests and five unit suites / 41 tests, API typecheck, targeted lint, Prettier and whitespace checks. This adds no schema migration or provider mutation. Historical mandate/provider servicing and scheduling remain pending.

The eleventh increment separates historical mandate reads and existing-mandate cancellation from new Bacs collection. The collection provider now exposes only customer/setup/debit creation and remains test-only. The servicing provider exposes three scoped reads plus verified setup expiry and Bacs-method detachment. It checks the stored account/environment, customer and resource before cancellation; an already detached method or expired matching setup is a successful observation. A completed or mismatched setup cannot be expired. Local plan cancellation persists during outages, with provider cancellation pending for retry. Existing payer-grant and servicing access checks remain in the caller. The revoked-setup webhook cleanup uses this same binding.

Seven provider assertions and two database assertions failed before the behavior was added. Normal Node 24 verification passed four unit suites / 39 tests, two database suites / five tests, API typecheck, targeted lint, formatting and whitespace checks. The two old cancellation tests moved from the collection client to the stronger servicing contract suite; collection creation tests remain. A read-only proof against the existing synthetic Sandbox school exercised the actual historical reader: SetupIntent succeeded, mandate active, Bacs method/customer references agreed, and both generic and customer-bound method GETs agreed. No real cancellation or provider mutation was performed. The historical sweeper is still pending.

The twelfth increment fixes case-key overflow for valid 255-character provider IDs. The bounded key helper preserves existing short keys and hashes only an oversized provider reference. It never truncates the reference identity or stored evidence. Two database regressions failed on column length before the fix; two suites / 21 database tests, API typecheck, targeted lint, formatting and whitespace passed. Full T17 delivery remains in progress.

The thirteenth increment retains uncertain mandate setup identity. Missing session persistence and local expiry do not prove provider failure. These states become UNKNOWN for evidence-led recovery, with no replacement setup; valid sessions remain reusable. Three regressions were RED before the fix. Two database suites / six tests, API typecheck, targeted lint, formatting and whitespace passed.

The fourteenth increment adds historical mandate-object projections and stored-operation matching shared by current reads and original events. Only explicit setup success/cancellation, mandate inactivity and method detachment queue canonical transitions. Unconfirmed current setup stays observed. Setup success is not money. Active provider events cannot acknowledge an outstanding cancellation. Node24 verification: three unit suites /30 tests, three database suites /19 tests, typecheck, lint and formatting passed. These helpers await sweeper registration.

The fifteenth increment bounds capture pages at ten provider objects, adds account-scoped SetupIntent discovery and an independent unresolved-operation state stream. The latter scans all historical ages at a fixed five-minute cutoff and resumes its original cursor across later intervals. The selector reads at most a page plus lookahead from each operation class, then returns one scoped page. It does not write state or cases. Refund/dispute receipt scope is proved through canonical Checkout/Bacs identities, since receipts have no connection FK. Approved/submitted/confirmed refunds remain inspectable for later returns; reinstated withdrawals leave the unresolved set. The additive recovery-jobs migration extends the stream allowlist and adds five indexes supporting scoped keyset paging. Index creation takes ordinary migration locks and must run under the planned release procedure; no production migration was run. Verification: 49 unit and 18 database tests, typecheck, Prisma validation, lint and formatting passed. Runtime coordination remains outstanding.

## Integrated T17 runtime

Recovery runs one durable page per authenticated internal request. Provider reads
share a twenty-second deadline; ordinary discovery requests ten objects, payout
discovery one payout, and payout preparation one page of twenty-five constituents.
Historical sweeps inspect one stored operation. Page capture and cursor advance
remain atomic. The API function ceiling increases from thirty to sixty seconds
for remote preparation, bounded database capture and bootstrap overhead; this is
configuration only, with no deployment performed.

The gated worker launches at most four requests concurrently, five hundred per
run, and stops launching after four minutes. In-flight requests have a fifty-five
second timeout. Its five-minute schedule remains off until
`ENABLE_FINANCE_RECONCILIATION=true` is explicitly configured with
`FINANCE_RECONCILIATION_MODE=test|live`, database URL, internal API URL and secret.
The workflow drains the existing canonical inbox afterward with its own five-minute
limit. Claims use the selected environment so opposite-mode evidence is not
repeatedly retried against an incompatible API. Worker discovery exposes stored
scope IDs only; request callers cannot supply a provider account or mode.

Staff case actions append durable audited requests. Acknowledgement does not
resolve a case. Rechecks retrieve a verified stored resource or exact local
operation and capture through canonical handlers. Unsupported references require
manual review; they never report a repair. Replays revalidate immutable inbox
scope and leave active processing claims untouched. The scoped CLI defaults to
dry run, uses explicitly supplied operator environment and prints only status
and counts. See the [missed-webhook](runbooks/missed-webhooks.md),
[provider-outage](runbooks/provider-outage.md) and
[refund/return](runbooks/refunds-and-returns.md) procedures.

Settlement observations and payout continuation pointers are private and forced
through tenant RLS. Immutable evidence preserves account, environment, digest and
observation cutoff. A complete automatic payout compares only same-currency net
constituents with its principal; manual, pending, incomplete, mixed-currency and
differing payouts stay explicit. Reports read this persisted evidence, group fees
by currency, and expose stream cutoffs, stale/missing coverage, bounded truncation
and an unproven historical start. Neither a balance transaction nor a payout
creates family debt or a second receipt.

### Controlled Sandbox runtime evidence

A full read-only dry run exercised all twelve streams against the previously
authorised synthetic school in the verified test platform. Events returned one
bounded page of ten and `continued`; Checkout, SetupIntent, PaymentIntent, Charge,
refund, dispute, balance transaction and payout reads completed their first page.
The three local historical/request continuation streams completed empty pages.
No stream failed. Historical objects without matching local fixture obligations
remained exceptions; the proof did not manufacture matches or claim complete
event coverage. Seven scoped record counts (inbox, state, cases, receipts,
movements, settlement evidence and payout pointers) stayed zero. The transport
rejected every non-GET request. This proves reads and dry-run isolation; it does
not exercise an actual provider payout or authorise a live pilot.

The additive settlement migration introduces two private evidence/pointer tables,
scoped indexes, forced-RLS policies and integrity triggers. The dispatcher migration
extends the stream allowlist, adds request/completion indexes and a backend-only
scope-discovery function. Both require an administrative migration role; the
runtime role must receive explicit function execution rights if distinct from the
migration role. No production migration has been run.
