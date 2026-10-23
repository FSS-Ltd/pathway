# Finance webhook event delivery implementation plan

> T18 assurance continuation. Use the executing-plans workflow within the current
> Finance T18 continuation PR. The actions below are internal verification actions, not new
> numbered delivery units. T19 cannot start before T18's merge gate passes.

**Goal:** Wake canonical Finance webhook processing after committed evidence,
without periodic discovery becoming the normal delivery mechanism.

**Architecture:** PostgreSQL emits an empty notification from the durable inbox
transaction. An explicitly enabled persistent worker listens before catching up,
loads a bounded authoritative wake plan, and uses the existing tenant-scoped
claim/replay pipeline. One timer follows the next persisted retry or lease deadline.

**Tech stack:** Existing PostgreSQL, Node.js, Prisma and authenticated internal
HTTP processor. A direct `pg` client and its TypeScript declarations are justified
because Prisma does not expose a PostgreSQL notification subscription API.

**Specification:** The owner's event-driven rules in `AGENTS.md`, the signed
durable-ingress contract and [recovery constraints](reconciliation-and-recovery.md).

## Global constraints

- This design is an implementation choice under the owner's instruction to
  continue autonomously; it is not a claim of separately approved infrastructure.
- No new paid service, production migration or worker deployment is authorized.
- Preserve signature verification, account/mode isolation, forced tenant RLS,
  current internal authentication, claim-token checks and append-only money.
- Notifications contain no tenant, account, payer, document or financial data.
  Notifications are hints and never grant authority.
- An explicit session/direct listener URL is required. Do not reuse the API's
  transaction-pooler URL or infer credentials from a migration connection.
- Keep existing scheduled recovery available until replacement activation is
  approved and verified. Do not silently turn off the current delivery mechanism.

## Current behavior and approaches

Signed ingress commits `FinanceStripeWebhookEvent` before acknowledging Stripe.
API reconciliation can also capture/requeue inbox evidence. The worker CLI drains
one bounded batch per scope and exits. A gated GitHub workflow normally discovers
work every five minutes. API hosting has a60-second request lifetime, and the
repository does not define an always-on worker deployment.

The implementation choice is a transactional PostgreSQL notification plus a
persistent listener. This uses the existing authoritative database and covers all
inbox writers. It needs a host, session connection and explicit runtime grants.
Supabase private Realtime would still need a persistent subscriber and additional
topic authorization. A synchronous post-capture HTTP call can accelerate one
arrival but cannot alone recover crashed leases, delayed retries and larger
backlogs. Database HTTP webhooks would need new extension, durable delivery and
due-scheduling arrangements that are not configured here.

## Review focus

- A notification before commit or a rolled-back write must never process money.
- A disconnected subscriber must catch up after reconnect without lost evidence.
- A coalesced notification must not strand more than50 runnable records.
- Opposite-mode or unauthorized records must not be processed by a wake hint.
- Dependency-delayed supported evidence must retry; unsupported evidence stays held.

## T18 correction: one complete worker delivery path

### Persistence boundary

Files: a new additive Finance migration under `packages/db/prisma/migrations/`,
and a database integration suite under `apps/api/src/finance/tests/`.

Interface: restricted backend function
`app.plan_finance_stripe_webhook_work(p_now timestamptz, p_livemode boolean, p_limit integer)`
returns bounded due tenant/org scopes and the earliest persisted future deadline.
Return exactly one row with `scopes` (a JSON array of `{tenantId, orgId}`) and
nullable `nextWakeAt` (timestamptz), even for empty or future-only work. Compute
the deadline across all eligible records independently of the scope page.
Validate non-null mode, finite timestamp and limit1–100; order scopes by earliest
due time, tenant ID and organisation ID. Never treat a query failure as no work.
Use a fixed five-minute claim lease, matching the current worker. Exclude
unmatched, opposite-mode, completed, dead-letter and held evidence. Cap scope
pages at100; the listener requests50. Schema-qualified dynamic SQL follows the
repository's app/public portability convention. Revoke public execution; grant
only the migration owner initially, with explicit runtime grants documented.

The inbox trigger emits `pg_notify('finance_webhook_work', '')` for runnable
inserts, transitions into runnable work, earlier deadlines and initial claims.
Do not notify on renewals or completion bookkeeping. Add mode/deadline indexes;
no existing money rows, amounts or invoice snapshots are rewritten.

- [x] Write and observe failing database tests for commit/rollback delivery,
      empty payloads, mode filtering, bounded pages, due retries/leases and denied grants.
- [x] Implement the additive trigger/function/indexes and run those tests green
      against a disposable database, including app/public portability where applicable.

### Worker boundary

Files: focused listener, PostgreSQL subscription adapter and opt-in CLI modules
beside the current `apps/workers/src/finance/` job/store; focused worker tests;
package manifest/lockfile and environment documentation.

Interfaces: a typed wake plan contains `scopes` and nullable `nextWakeAt`.
`FinanceStripeWebhookJob.runScopes(scopes, signal?)` processes already-discovered
scopes through existing claims. Its current `run(now)` remains available for the
bounded recovery fallback. The listener owns subscription, coalescing, deadline
timer, reconnect backoff and shutdown; it does not duplicate ledger logic.

Listen first, then load committed work in a fresh transaction. Catch up at every
reconnect. Serialise pumps and coalesce wake hints; drain bounded scope/batch
continuations until no work remains. Calculate retry deadlines from failure time.
Supported Bacs/reversal evidence with missing dependencies must receive a durable
retry rather than an unsupported-handler hold. Exhausted retries remain visible
for manual review; do not fabricate a match or new payment.

Known missing-dependency branches in the supported Bacs/reversal services throw
a safe retryable `ServiceUnavailableException` through the existing
worker failure path. Unsupported types and unknown Checkout states retain their
`deferred` hold semantics. Test persisted RETRY, later successful processing and
exhaustion visibility. Do not infer support merely from a notification.

Initial claim notifications may cause one coalesced rescan. If a stale scope page
yields no claims, reload once; repeated zero-progress contention uses bounded
backoff rather than an immediate loop. Connection failures reconnect with bounded
backoff. Permission/configuration failures stop intake and report unhealthy state;
they cannot silently park the worker as an empty successful plan.

No deadline means no timer and no ongoing SQL discovery. Use TCP keepalive for
connection liveness; no SQL heartbeat. Lost connections use bounded reconnect
backoff, and each reconnect re-establishes LISTEN before durable catch-up. Stop
intake on shutdown, clear timers and listeners, allow bounded in-flight work,
then close the dedicated client and Prisma. Log safe state/counts, not URLs,
credentials or notification payloads.

Check the stop signal between scopes/events and before continuation. Pass it to
the existing20-second HTTP request deadline; do not launch remaining claimed
events after shutdown starts. Leave unresolved claims recoverable by lease expiry.
Cancel pending pump, deadline and reconnect callbacks. Bound shutdown to30 seconds
and report failure if draining/closing cannot finish; do not claim clean exit.

- [x] Verify worker behavior for duplicate wakes, backlog continuation,
      zero idle queries, scheduled retry/lease expiry, supported dependencies,
      reconnect races, permission revocation and shutdown/unsubscribe cleanup.
      Include a future-only plan, a deadline outside the first scope page, many silent
      renewals after one claim, and shutdown during the first event of a large batch.
- [x] Implement the listener and subscription adapter, preserving existing
      one-shot CLI behavior and requiring explicit opt-in for persistent mode.
- [x] Run worker types, lint, unit/build checks and real local PostgreSQL
      subscription/claim tests. Do not emit worker build files into API source lookup.

### Delivery and activation

- [x] Review every changed file and final diff; obtain independent review.
- [ ] Publish the T18 continuation PR with actual checks and limitations.
- [ ] Verify fresh current-revision CI before any merge. Record checked SHA,
      conclusions and host-confirmed merge in `docs/finance/PROGRESS.md`.
- [ ] Before runtime activation, obtain an approved persistent host, an explicit
      least-privilege session/direct connection and runtime function grants. Prove
      reconnect, zero idle SQL, isolation and graceful shutdown on that environment.

The runtime prerequisite is a release gate, not satisfied by local tests or by
merging dormant code. Scheduled provider reconciliation remains separately
necessary to recover evidence missing from Stripe delivery. After replacement
activation, an optional inbox safety fallback can use one bounded discovery
query every15 minutes (96/day), dispatching only actual due work. Record its
degraded latency, query budget and reason before changing the existing schedule.

## Source basis

PostgreSQL delivers transactional notifications only after commit and documents
the LISTEN-before-snapshot startup sequence: [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html),
[LISTEN](https://www.postgresql.org/docs/current/sql-listen.html).
The dedicated client uses documented notification and connection events:
[node-postgres client](https://node-postgres.com/apis/client).
Connection selection must respect session versus transaction pooling:
[Supabase connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres).
