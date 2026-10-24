# Messaging live updates — step 1.2

## Delivery and activation

The migration installs a consumer for the two reserved messaging notification
intents before enabling capture. A source write, its OutboxEvent intent, private
recipient queue rows and the intent's DISPATCHED transition share one transaction.
DISPATCHED means accepted by the durable database Broadcast queue. It does not
claim that an offline client received the event. APIs remain authoritative.

The consumer batches the existing authorization predicate across recipients.
Topics are `ace:conversation:site:<UTF-8 hex siteId>:user:<UTF-8 hex userId>`.
Signed grants retain their authorized conversation as `ace_realtime_conversation_id`
and recheck that anchor on join. One inbox subscription receives current eligible
changes across conversations, including those outside the open thread. Encoded
segments prevent delimiter collisions for legacy text IDs. Only currently
eligible recipients get queue rows, including when their old channel remains
open after revocation. Family threads also require an active guardian account
without a student identity in the site, matching the authenticated API. Pending
intents recheck this eligibility when reconciled. The signed allowlist, user, organisation and site must all
match when joining. Client publication remains forbidden. Notifications contain
IDs, an event name and opaque invalidation metadata; never message text or keys.

Supabase `realtime.send` in the tested provider catches insert failures and warns.
The consumer therefore uses a strict insert into `realtime.messages`. Queue SQL
failure rolls back the source mutation; an unavailable WebSocket server does not.
The client retains its draft and can retry with the existing client request ID.
No HTTP acceptance or best-effort publication marks an intent complete.

Production activation requires the step's approved deployment, the existing
private Broadcast policies and a compatible provider queue schema. The local
provider proof pins Postgres `17.6.1.165` and Realtime `v2.129.3`; rerun it for
provider upgrades. Hosted Supabase ownership/privileges must permit the migration
role to insert private Broadcast rows. A failure aborts the migration or write;
never bypass it by marking intents dispatched manually.

The trigger function's `app.realtime_capture_default` is `on` where the provider
queue exists at installation, otherwise `off` for plain PostgreSQL test databases.
This function setting takes effect for existing application pools immediately.
An explicit transaction/connection `app.realtime_capture_enabled=off` override
is reserved for controlled maintenance. Disabling capture while clients use
subscriptions leaves them dependent on manual/foreground/reconnect reconciliation.

Installation checks at most 51 pending REALTIME_CONVERSATION intents and consumes
at most 50. A larger unexpected backlog aborts installation. Investigate its cause
and reconcile in explicitly bounded tenant-scoped transactions before retrying
release. This check is not a recurring discovery scan. Ordinary message and
read-cursor writes enqueue synchronously; they need no polling worker.

The migration changes topic names and rejects old shared conversation grants.
Existing clients will disconnect until they load the matching application build.
Coordinate migration and application deployment; healthy new clients renew their
short-lived authentication on the existing channel.

## Production metadata preflight (2026-10-24)

Read-only checks identified the production API project from its existing Vercel
configuration and matched its database identity to the local production
configuration. No business rows or production changes were made. TLS certificate
and hostname verification used the public root certificate linked by Supabase's
[dashboard configuration](https://github.com/supabase/supabase/blob/7e866ef83e89e35cdda45a6c98abd069d5fa1b2f/apps/studio/hooks/custom-content/custom-content.json).

- The migration login is `postgres`, without superuser and with RLS bypass.
  It has USAGE on `realtime` and INSERT on the partitioned `realtime.messages` queue.
- Required queue columns and defaults are present, including generated UUID IDs,
  timestamps and `skip_broadcast=false`. Existing ACE SELECT policies call the
  topic authorizer; authenticated clients cannot publish to ACE topics.
- Core, identity and outbox tables live in `public`. Message tables live in `app`,
  with public bridge views. Partial app bridges include Tenant, SiteMembership,
  StudentIdentity and Child. Because app.PermissionDefinition is absent, the
  existing recipient selector correctly uses the complete public core schema.
- The bounded 51-row activation discovery found zero pending realtime intents.
  Recheck immediately before activation if release timing or configuration changes.

This verifies catalog compatibility, not a production mutation or hosted provider
upgrade. Deployment authorization and current-revision CI remain required.

## Client recovery and request budget

- Subscribe before fetching history. Initial subscription failure permits one
  read for the explicitly opened conversation. Subsequent failures never fetch.
- Healthy token renewal calls `setAuth` in place. Its expiry timer performs only
  authentication requests; it never refreshes history or creates a new channel.
- Reconnect with 1, 2, 4, 8, 16, then 30-second bounded backoff. Reconcile once
  after joining. Events during a read coalesce into one follow-up. Keep at most
  512 notification IDs for deduplication.
- Hidden tabs stop their subscription and timers. Foreground rejoins/reconciles.
  Focus and explicit refresh can reconcile loaded data without a periodic timer.
- A disconnected status and accessible manual refresh remain available. Keep
  drafts mounted during background refresh. Sign-out/scope changes abort reads,
  remove channels and ignore obsolete callbacks.

Zero recurring application-data requests is the idle acceptance criterion.
Measure token grants separately. Existing API permission guards still recheck
read authority; receiving an invalidation never grants access.

## Verification and recovery commands

Run `bash apps/api/scripts/realtime-provider/run.sh` from the repository root.
It creates only labeled disposable Docker resources, applies the full migration
history and exercises real ES256 grants, private WebSockets and application
services. Ports 15449–15451 must be free. Occupied ports fail startup; the script
never removes another stack to obtain them. Teardown removes only its resources.
Node 24 is used in CI; older supported local Node versions use their experimental
WebSocket flag when needed. Test credentials and generated keys are fixture-only.

The provider cases cover commit/rollback, duplicate API requests and consumer
calls, forced-RLS source writes, pre-commit silence, tag-only responder joins and
delivery, tag revocation, guardian deactivation/student conversion (including
pending-intent reconciliation), current recipient revocation,
user/organisation/signature boundaries, strict queue errors, three healthy token
renewals, transport outage and reconnect catch-up. Pure lifecycle and browser
workspace suites cover coalescing, stale responses, cleanup and manual refresh.
Authentication counts and history counts are asserted independently.

When a client is disconnected, inspect provider connectivity and token endpoint
responses without repeatedly reading message history. Restore connectivity and
let reconnect reconcile. A notification outage cannot delete committed messages.
Investigate a source write failure as a database enqueue/authorization failure;
retry only through the existing idempotent authenticated mutation.

The outage proof restarts the gateway while committing through the application
service. It verifies lost transport and reconciliation. It does not claim a hosted
provider upgrade/restart test; self-host bootstrap recreates provider auth state.

CI pulls the official Docker Hub provider releases. Local runs may reuse the
CLI's cached ECR images at the identical pinned versions; ECR's shared anonymous
download quota is unsuitable as the default for hosted CI. HTTP security checks
include open-handle detection to inspect application teardown directly.
