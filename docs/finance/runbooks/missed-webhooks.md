# Missed Finance webhooks and interrupted recovery

## Scope and authority

Use for missing or delayed provider evidence, inbox backlog, or interrupted page
capture. These procedures describe T17 recovery; they do not record a completed
incident exercise. Examples are for an authorised disposable sandbox only. A live
pilot, production deployment or live operational action needs separate explicit
authorisation and release gates. See [recovery design](../reconciliation-and-recovery.md)
and [environment safety](../environment-and-backup-safety.md).

## Triage

1. Open the Finance staff workspace with the permitted Finance role/access mode.
   Verify tenant, legal entity, stored connection, provider account and test/live
   mode before inspecting evidence. Never broaden scope or bypass RLS to find a
   match. Existing-record servicing access is distinct from new collection.
2. Record the affected stream, UTC incident interval, last successful sync,
   completed cutoff, active fixed window/cursor, case reference and inbox status
   in the restricted incident record. Keep credentials, raw payloads, provider
   identifiers, contact/bank details and acceptance IP data out of tickets, chat,
   shell history and this runbook. Use approved restricted evidence storage.
3. Distinguish missing delivery from stored-but-unprocessed evidence. Webhook
   acknowledgement follows durable inbox capture; a successful HTTP response or
   queue delivery alone does not prove a receipt. Check the inbox's canonical
   processing result and the scoped receipt/allocation independently.
4. Do not request another payment while its outcome is unknown. Preserve the
   original Checkout/debit/refund operation and its key beyond 23 hours. An aged
   unknown identity requires historical reads and review, never blind resubmission
   or replacement with a fresh key. Redirects, transfer notices, mandate acceptance
   and `processing` states do not confirm funds.

## Recover

1. Restore the correct environment's webhook verification and worker dependency
   if unavailable; follow [provider outage](provider-outage.md). Do not accept an
   unsigned payload or relabel API evidence as signature verified.
2. For durable inbox backlog, request the supported scoped replay/recheck action
   in the staff workspace. It must create durable audited work and use canonical
   handlers; do not edit inbox status, receipts or allocations directly.
3. Preview affected streams with the scoped reconciliation command. Inspect
   `pnpm --filter @pathway/api finance:reconcile --help` for the supported streams.
   Supply the authorised database and explicit environment-specific servicing
   binding through the operator environment; the command loads no environment
   files or full application bootstrap:

   ```sh
   pnpm --filter @pathway/api finance:reconcile --tenant <tenant-id> --org <org-id> --connection <connection-id> --stream events --dry-run
   ```

   The command requires `DATABASE_URL`, `FINANCE_STRIPE_SERVICING_MODE` and the
   matching `FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST` or
   `FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE` when servicing is enabled. Live
   servicing also requires the approved Production runtime. Use secret names
   only in shared notes; never paste values into commands or shell history.

   The command defaults to dry run. Dry run does not claim a lease, write
   evidence/cases, replay or move a cursor. It prints only mode, status and counts.
   Use `pnpm --silent --filter @pathway/api` when saving output: pnpm otherwise
   echoes command arguments.
   Exit `0` means completed/help; `1` means invalid arguments/configuration or a
   failed run; `2` means disabled, continued, busy or lost. A completed dry run
   does not prove complete historical coverage. Each invocation processes a
   bounded page. Repeat the same scoped command to continue durable work; do
   not bypass backoff or replace retained cursors manually.
   Review exceptions and scope before any separately authorised `--apply`. Apply
   may capture verified evidence, replay and advance recovery cursors; it must
   never create a payment, refund, mandate or collection instruction.

4. Recover current objects and unresolved historical operations as well as
   events. Check the five-minute unresolved-operation sweep as well as daily
   sync. Daily sync uses a seven-day overlap; events have a 30-day retention
   bound. A missing older event remains an explicit coverage gap. Do not mark an
   interval complete merely because the provider returns an empty recent page.
5. Resume the retained fixed window after interruption. Page evidence and cursor
   commit atomically. Failed capture must leave that page unadvanced. A stale or
   invalid cursor restarts the same window with idempotent evidence and a visible
   case. Respect active leases, backoff and bounded runs; `continued`, `busy`,
   `lost` or `failed` are not completed coverage. Do not manually clear a lease or
   set a completion cutoff.

## Prove recovery and close

- Compare confirmed principal and currency with the original obligation and
  provider account/mode. Confirm one receipt/allocation for duplicate or reordered
  evidence. Keep processing separate from confirmed money and unmatched money in
  a case. Verify refunds/returns via [their runbook](refunds-and-returns.md).
- Compare balance transactions, actual fees and payouts separately per currency
  in integer minor units. They do not create additional family receipts.
- Confirm durable replay results, refreshed cutoff/last-success time, no remaining
  affected backlog, and explicit unresolved cases/coverage gaps. Preserve issued
  statement snapshots; use subsequent activity rather than rewriting history.
- Record redacted before/after counts, window, result, reviewer and remaining
  exceptions. Acknowledging a case is not financial reconciliation or proof of
  repair. Close only with recorded evidence; retain gaps until resolved.

Stop and escalate to the incident owner for scope/mode mismatch, contradictory
principal/currency/identity, malformed evidence, repeated provider/capture errors,
missing history, unmatched confirmed money or unexplained settlement differences.
Retain evidence and unknown-operation identity. Do not manufacture a receipt,
force a cursor, waive a coverage gap or send external messages without authority.
