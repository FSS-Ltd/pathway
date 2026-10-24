# Event-driven updates and worker wakeups

Approved 2026-10-23. The application database remains authoritative. Private
Supabase Broadcast carries invalidation metadata; authenticated API reads return
business data. Existing services are reused. No new paid service or production
activation is authorized by this delivery plan.

## Ordered delivery

| Step | Deliverable                                                        | Acceptance                                                                                                                                    |
| ---- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Build standard, read-model map, transactional notification capture | ID-only intents commit/roll back with source writes, duplicates are safe, generic dispatch leaves realtime work alone, capture defaults off   |
| 1.2  | Messaging event delivery and removal of polling                    | Durable private dispatch, no healthy/outage data polling or token-renewal refetch, disconnected/manual-refresh UI, subscribe-before-reconcile |
| 1.3  | Shared browser/native lifecycle and product app integration        | Scoped pooled connections; feature-owned invalidations; request-time mobile/Home tokens; cache/read cleanup on identity/site change           |
| 1.4  | Event-driven worker wakeups and due-time scheduling                | Durable authenticated ID/generation wakeups; existing leases/idempotency/retries; serialized earliest-due alarm; bounded recovery sweep       |
| 1.5  | CI enforcement and release evidence                                | Idle-count, committed-change, reconnect, duplicate, revocation, isolation, cleanup, shutdown and worker-failure proofs                        |

Each step has its own branch and PR. Passing current-revision CI and confirmed
merge are required before the next step begins. See [progress](PROGRESS.md).

## Read-model coverage map

Only implemented read models are covered. Register resource scopes against the
same read policies as their API routes; never accept arbitrary channel names.
New scopes use private per-user topics and recheck the audience before publishing.
Subscriptions do not replace API authorization. Mutation lists identify domain
owners, including webhook and worker writes, rather than only HTTP controllers.

| Read model / clients                                                | Source mutations                                                                            | Audience boundary                                                             | Feature-owned refresh                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Messaging / admin staff, school-team, parent                        | Messaging command services and monotonic read cursors                                       | Current conversation participation, selected site, staff/guardian permissions | Conversation list, open history, unread/read state              |
| Attendance / admin, mobile                                          | Attendance writes and register corrections                                                  | Selected site and approved staff/linked-family reads                          | Loaded registers and attendance summaries                       |
| Sessions, rota, assignments, swaps / admin, mobile                  | Sessions, assignments, preferences and swaps domain commands                                | Current site, staff membership and assigned/linked family scope               | Loaded schedules and assignment cards                           |
| Children and family / admin, mobile, Home                           | Children, parent/guardian relationships, enrolment and household setup commands             | Current site/household, linked children and legal-access rules                | Child lists/details and setup state                             |
| Household planner / Home                                            | Family-planner activities, tasks and calendar commands                                      | Current household organisation/site                                           | activities, tasks, calendar-items                               |
| Learning and progress / admin, mobile, Home                         | Lessons, learning logs, PACE facts/corrections and projections                              | Existing child/site/capability permissions                                    | Subjects, logs, progress and affected summaries                 |
| Reports and exports / admin, mobile, Home                           | Report publication and privacy/export completion                                            | Document owner, permitted staff or linked family                              | Report bundles, export status and authorized downloads          |
| Notices, homework, faith, permission slips / admin and family views | Domain commands, scheduled publication/release and recipient/read changes                   | Existing publication, recipient, guardian/student and visibility policies     | Loaded feeds, details and response summaries                    |
| Behaviour and compliance / admin and approved family views          | Behaviour commands/corrections and compliance/medical record changes                        | Existing sensitivity, site, child and operation permissions                   | Authorized lists/details and aggregate summaries                |
| Billing and finance / admin, mobile, Home                           | Subscription webhooks, billing operations, ledger facts and finance inbox/worker completion | Organisation billing roles or authorized family payer/servicing scope         | Entitlements, invoice/payment/statement status                  |
| Access and organisation / all signed-in apps                        | Membership/role/permission changes, active-site changes and organisation settings           | Current user, org/site and active permissions                                 | Access context, navigation and scope-bound caches               |
| Account and preferences / admin, mobile, Home                       | Provider session/account lifecycle and preference commands                                  | Current account and provider session                                          | Bootstrap, account sessions, planning/notification preferences  |
| Public website                                                      | Existing blog/content publication and configuration mutations                               | Publicly released content only                                                | Existing server cache/path revalidation; no unnecessary sockets |

Typing/presence are ephemeral. They do not create durable work. Static content
and unsaved drafts do not need automatic invalidation.

## Step 1.1 capture contract

The migration adds invoker-rights triggers to Message and
MessageParticipantReadCursor. They reuse the existing forced-RLS OutboxEvent table:

- Message insert: eventType `realtime.message.created`, aggregate type
  `REALTIME_CONVERSATION`, aggregate ID the conversation, payload exactly
  `{ type: "message.created", conversationId, messageId }`.
- Positive read-cursor insert/advance: eventType `realtime.conversation.read`,
  same aggregate, payload exactly
  `{ type: "conversation.read", conversationId, readerScope: "participant" }`.
- Idempotency keys use the source message ID or cursor ID plus sequence, scoped
  by the existing organisation unique constraint. No-op/backward cursor updates
  do not create intents. Reader IDs, bodies and credentials are excluded.
- Derive the organisation from the source site's Tenant row and require it to
  match transaction-local org context. Preserve existing source/outbox RLS and
  direct Data API restrictions. Cover app, public and restored mixed layouts.
- Reserve the `realtime.` event namespace for a dedicated dispatcher. The generic
  outbox worker excludes it, while explicitly typed dispatchers retain their
  current selection behavior. Existing message-email events remain independent.

In step 1.1, capture is disabled unless the backend transaction/database setting
`app.realtime_capture_enabled` is exactly `on`. Step 1.2 must prove the dedicated
consumer before activation. This avoids accumulating undeliverable intents between
separately gated PRs. No historic data is backfilled. Disabling capture preserves
committed pending intents; it is not permission to delete them. The migration is
ordered after the repository's existing 20261203 migrations; the filename is not a
production rollout date.

Step 1.2 replaces that inactive default with a verified commit-coupled private
Broadcast consumer. See [messaging activation and recovery](MESSAGING-RUNBOOK.md)
for its provider preflight, request budget and rollout limits.

## Recovery and activation

App-data polling stays disabled after its conversion, including outages. Use
bounded connection backoff, disconnected status, manual refresh and one catch-up
on reconnect/foreground. Renew authentication in place without reloading data.
Subscribe first, reconcile authoritative state, then coalesce any concurrent dirty
signal. Drop late responses from a previous user/org/site and preserve local drafts.

Worker wakeups use pg_net after commit. Its request queue is unlogged, so the
existing durable inbox/outbox and job completion state remain the source of truth.
Keep notification intent until processing acknowledgement; HTTP acceptance alone
is insufficient. Use fixed internal endpoints and server-held credentials, with
payloads limited to a wakeup ID and generation.

pg_cron has recurring schedules rather than native absolute one-shot alarms.
Step 1.4 must emulate one earliest-due alarm: minute-rounded UTC target, persisted
dueAt/generation, serialized rearming, stale-callback guard, and disarm when empty.
Rearm after earlier inserts, cancellation, retries and lease changes; do not keep
waking in-flight work. A recovery sweep runs every 15 minutes, limited to 50 IDs
and 10 seconds, with one indexed discovery and bounded batch updates. Oldest-due
work goes first; expose backlog/failure metrics so recovery cannot become normal
dispatch. Genuine calendar computations and retention retain their schedules.

Before activation, verify the actual Supabase project, signing key, private-channel
policies, deployed consumer, extension support and authorised environment. Exercise
allowed/denied subscriptions and committed delivery. Supabase delivery remains a
notification mechanism; startup/reconnect reconciliation is required.

The current master deployment workflow deploys migrations and apps on merge.
Merge therefore also requires the user's production-change authorization; a green
PR alone does not grant it. Never remove existing delivery paths before the
replacement is verified.

## Verification commands

- `pnpm --filter @pathway/workers test:unit --runInBand`
- `pnpm --filter @pathway/db test:unit`
- `REALTIME_NOTIFICATION_TEST_DATABASE_URL=<dedicated-local-url> pnpm --filter @pathway/db test:unit --runTestsByPath src/__tests__/realtime-notifications.integration.spec.ts`
- `pnpm --filter @pathway/workers typecheck` and `pnpm --filter @pathway/db typecheck`
- Targeted ESLint/Prettier for changed files and the workers build.

The SQL integration suite refuses any host except localhost/127.0.0.1 and requires
the database name `pathway_realtime_notifications_test`, a PostgreSQL URI scheme,
and no URI query options or fragments. It passes the canonical validated URI to
libpq. It rebuilds only its
minimal fixture there; never point it at a shared or production database. The
separate Realtime notification CI job runs these database proofs without secrets.

Sources: [Broadcast](https://supabase.com/docs/guides/realtime/broadcast),
[authorization](https://supabase.com/docs/guides/realtime/authorization),
[pg_net](https://supabase.com/docs/guides/database/extensions/pg_net),
[pg_cron](https://github.com/citusdata/pg_cron).

## Step 1.1 verification boundaries

The dedicated SQL fixture exercises the real capture migration and outbox RLS with
minimal source tables. Production source-table RLS, foreign keys and cursor guards
remain independently enforced by existing migrations; the fixture is not a claim
of full production authorization interoperability. Full migration chains were also
applied to separate app/public databases. Duplicate physical core-table copies and
bridge views must be inspected during deployment preflight before enabling capture.
Supabase delivery, delivery-time revocation and runtime lifecycle/idle proofs remain
acceptance requirements for steps 1.2–1.5.
