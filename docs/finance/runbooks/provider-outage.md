# Finance provider outage, disconnection and queue recovery

## Scope and authority

Use when account access, provider reads, webhook processing or queue dispatch
fails. Examples apply only to an authorised disposable sandbox. This document
proves no incident exercise. Live pilot, deployment and live operational actions
require separate explicit authorisation. Follow [environment safety](../environment-and-backup-safety.md)
and [recovery design](../reconciliation-and-recovery.md).

## Contain and classify

1. Verify the permitted Finance staff role/access mode and exact tenant, legal
   entity, connection and stored account/mode. Classify provider unavailability,
   denied account access, deliberate disconnection, disabled servicing, queue
   failure or capture failure using restricted diagnostics. Do not expose keys,
   raw payloads, provider identifiers, bank/contact details or IP data in shared
   incident notes. Store private evidence only in approved restricted storage.
2. Record UTC onset, scope, last successful coverage, active windows/cursors,
   affected cases, pending cancellations and inbox backlog. Retain the last
   successful cutoff; a provider failure does not prove zero activity.
3. Keep unknown Checkout/debit/refund identities and reservations intact,
   including beyond 23 hours. Never compensate for an outage with a new operation
   key or blind resubmission. Processing stays pending. Redirects, notices and
   mandates provide no receipt confirmation.
4. Respect collection/disconnection controls. Do not reconnect or enable new
   collection to repair existing records. A concurrent disconnection must remain
   disconnected. Local mandate/plan cancellation persists even when provider
   cancellation remains pending; do not reinstate the plan.

## Restore the failed dependency

1. Ask the authorised operator to restore the existing environment's provider or
   worker dependency through its approved process. Never copy local/Preview
   secrets into Production or use SaaS webhook secrets for Finance. Do not read
   or paste secret values into diagnostics.
2. Existing-record servicing can continue after entitlement cancellation or
   disconnection under the servicing access policy. It requires the correct
   environment's servicing binding and permissions; collection configuration is
   not a substitute for permission. Explicit disabled servicing is an incident
   stop. Keep account-access failures visible until restored by the authorised
   account operator; do not change account ownership or bypass access controls.
3. Restore queue/worker availability, then request the supported scoped durable
   recheck/replay in the Finance staff workspace. A dispatch acknowledgement alone
   is not completion. Inspect the durable request and canonical processing result.
   Respect leases/backoff; never run a second unrestricted replay or manually
   rewrite processing claims.
4. Recheck pending historical mandate cancellation with the existing servicing
   workflow. Only verified matching resources may be cancelled by that workflow.
   Reconciliation submits no money instruction; it retries only pending
   cancellation of the verified existing target.

## Catch up and verify

1. Run the scoped reconciliation preview for each affected stream. Confirm the
   delivered CLI interface before use:

   ```sh
   pnpm --filter @pathway/api finance:reconcile --tenant <tenant-id> --org <org-id> --connection <connection-id> --stream events --dry-run
   ```

   The command loads no environment files. Supply the authorised `DATABASE_URL`
   and explicit environment-specific servicing binding in the operator environment.
   It defaults to dry run, which makes no writes or cursor changes. Output contains
   only mode, status and counts; detailed diagnostics remain restricted. Exit `2`
   (`disabled`, `continued`, `busy` or `lost`) is not completion. Review the preview;
   separately authorised `--apply` captures verified evidence/replays/cursors
   only. It creates no new provider money instruction.

2. Resume each retained fixed window and let page capture commit atomically with
   its cursor. Respect `busy`, `lost`, `continued` and failed runs. Stale-cursor
   recovery restarts the same window idempotently, with a case. The daily overlap
   is seven days; lost event history beyond the 30-day event window remains a
   recorded gap. Include current-object reads and unresolved historical
   operations; recent events alone cannot settle older unknown outcomes.
3. Reconcile confirmed receipts and reversals against account-scoped evidence,
   by principal/currency. Keep fees, balance transactions and payouts separate
   from family debt. Do not infer a receipt from processing or a successful queue
   job. See [missed webhooks](missed-webhooks.md) and
   [refunds and returns](refunds-and-returns.md).
4. Confirm the backlog is processed or explicitly held, last successful coverage
   advances only after completed windows, and restored account access does not
   re-enable collection. Verify pending cancellations and unresolved cases remain
   visible. Issued statement snapshots remain immutable.
5. Record restricted before/after evidence, scopes, windows, operation counts,
   canonical results and unresolved gaps. Close transient cases only after their
   recovery proof; acknowledgement alone does not prove a repair.

Stop and escalate for repeated failure, inaccessible accounts, credential/mode or
scope mismatch, contradictory money facts, missing historical evidence, unmatched
confirmed money or settlement discrepancies. Keep recovery paused on the affected
scope, preserve its identity and coverage, and obtain the responsible operator's
decision. No direct ledger edits, blind refund/payment resubmission, live switch,
production deployment or external communication is authorised by this procedure.
