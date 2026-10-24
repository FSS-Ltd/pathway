# Step 1.2 — messaging event delivery

Spec: [approved event-driven plan](README.md) and the user-approved five-step plan.
Base: verified merge `0ae915f8c70b258056ec10164fff225da4c3d62a` from PR #736.

## Global constraints

- Implement only messaging conversion in this delivery step. Preserve existing
  messaging permissions, drafts, pagination, scope cancellation and idempotency.
- No recurring application-data polling, including outages. Authentication expiry
  timers and bounded reconnect backoff are permitted and measured separately.
- Subscription readiness precedes initial history reconciliation. Queue events
  during a read into one follow-up; deduplicate notification IDs with bounded memory.
- Renew healthy authentication in place. Scope changes must unsubscribe before
  joining the new authorized scope; late callbacks and responses must be ignored.
- Durable publication must commit with its intent and expose only opaque metadata.
  Recheck recipients and retain authenticated API reads as the data authority.
- Reuse Supabase. Do not add a polling discovery worker as a temporary replacement.
- Step 1.2 gets its own PR. Its merge/activation needs separate production
  authorization; the user's authorization covered #736 only.

## Pre-flight interfaces

- 1.1 capture produces existing OutboxEvent intents `realtime.message.created`
  and `realtime.conversation.read`; the generic worker excludes this namespace.
- Existing token endpoints return private grants; remove token renewal from their
  history-refetch contract while preserving event names and endpoint routes.
- Feature refresh handlers return promises so the connection can coalesce changes
  until authoritative reads settle. Feature handlers own visible read errors.

### Task 1: Messaging connection lifecycle and UI

1. Add request-count, renewal, coalescing, reconnect, cancellation, denial and
   initial-outage tests; observe missing behavior before implementation.
2. Implement a typed lifecycle with a Supabase transport adapter; remove the
   interval and outage refresh loop from the browser hook.
3. Keep refresh handlers in staff/parent features. Add disconnected feedback and
   manual refresh; preserve drafts and stale-read guards.
4. Verify platform and admin suites, types and targeted lint/formatting.

### Task 2: Durable private message publication

1. Verify existing Supabase database Broadcast and authorization primitives against
   an isolated local provider stack; do not touch other projects' containers.
2. Test committed/rolled-back delivery, duplicates, current recipient authority,
   revocation and isolation before converting best-effort publication.
3. Reuse durable intents and private Broadcast, without business data in events.
4. Verify API/database/provider suites and affected builds.

### Task 3: Review and delivery

1. Reinspect every changed file and run complete affected-package verification.
2. Obtain one fresh whole-branch review; fix important findings with regression tests.
3. Publish this step's PR and record exact revision, checks and remaining release
   gates. Do not start 1.3 before verified CI and merge.

## Rulings

- Initial metadata reads needed to discover a conversation remain feature-owned.
  History waits for the subscription attempt to settle. If initial setup fails,
  one initial read of the explicitly opened conversation is permitted; repeated
  failures never refresh it. Cost: disconnected readers need manual/foreground
  refresh until reconnect, as required by the approved outage behavior.

## Delivery implementation decisions

- Use commit-coupled writes into Supabase's existing `realtime.messages` queue.
  Provider logical replication exposes committed rows; no new discovery timer or
  HTTP publication dependency is needed for messaging.
- The inspected local provider's `realtime.send` catches insert errors and only
  warns. Use a strict, whitelisted queue insert instead so a failed enqueue cannot
  silently commit a message without its notification. A WebSocket outage does not
  block database writes; a database queue failure rolls back the source write.
  Cost: coupling to the documented provider queue schema requires provider-version
  integration tests and activation preflight.
- Extract the existing authorization predicate into a batch recipient helper.
  Private user/site inbox topics prevent revoked recipients from receiving new
  invalidations through an already-open channel. Preserve token endpoints/events.
- Install the consumer before activation. Bind an environment-specific capture
  default to the trigger function (rather than connection defaults), honoring an
  explicit `app.realtime_capture_enabled=off` override. Plain PostgreSQL fixtures
  remain inactive; a missing queue after activation must fail visibly.
- Activation reconciles at most 50 existing realtime intents, selected using the
  existing aggregate-type index; an unexpected larger backlog blocks activation.
  This is a one-time release check, not a periodic worker scan.
- Provider proofs use a dedicated local database and ES256 application grants.
  Reuse the existing strict local test-URL guard; never pass an unvalidated URI
  through to libpq. Other projects' containers remain untouched.
