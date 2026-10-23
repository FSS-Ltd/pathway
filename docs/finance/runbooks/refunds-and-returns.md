# Finance refunds, later returns and disputes

## Scope and authority

Use for a confirmed receipt with a pending/unknown refund, later refund return,
provider dispute withdrawal or reinstatement, including a dispute after a refund.
Examples apply to an authorised disposable sandbox only; no exercise is claimed.
Live pilot, deployment and live operational actions require separate explicit
authorisation. See [recovery design](../reconciliation-and-recovery.md) and
[provider compatibility](../provider-compatibility.md).

## Establish the evidence

1. Use the permitted Finance staff role/access mode and verify tenant, legal
   entity, connection, provider account and mode. Servicing an existing record
   requires servicing access even when collection is disabled. Do not search
   another school's records or bypass RLS to match a refund.
2. Inspect the original confirmed receipt, principal/currency, allocations, local
   refund approval, immutable attempt timestamp and durable provider observations.
   Record restricted case references and UTC times. Keep credentials, provider
   identifiers, raw payloads, contact/bank details and IP data out of shared notes;
   preserve necessary evidence only in approved restricted storage.
3. Separate pending/processing from confirmed money. A redirect, bank-transfer
   notice, mandate or requested/approved refund is not confirmation. API recovery
   has API provenance; only verified webhook evidence has signed provenance.
4. Retain unknown refund identity and its approved reservation beyond 23 hours.
   A timeout does not prove failure. Use historical reads to recover an existing
   matching refund; never retry with a fresh key, replace the original identity,
   create a second refund or release its reservation merely because time passed.
   Any new financial correction retains the independent approval workflow.

## Recover without erasing movements

1. Request the supported scoped durable recheck/replay through the Finance staff
   workspace. Preview affected refund/dispute/event streams and unresolved
   operations before applying recovery. The delivered CLI supports:

   ```sh
   pnpm --filter @pathway/api finance:reconcile --tenant <tenant-id> --org <org-id> --connection <connection-id> --stream refunds --dry-run
   ```

   The command defaults to dry run, with no writes or cursor changes. It uses
   only the operator environment, requires the authorised database URL and
   explicit servicing binding, and emits only status/counts. Use `--help` for
   supported streams and exit codes. Run `--stream unresolvedOperations --dry-run`
   with the same scope to inspect unknown historical operations.
   Separately authorised `--apply`
   captures verified evidence, canonical replay and cursor progress only; it must
   not create a new provider refund or payment instruction.

2. Require scope, known receipt identity, amount and currency to match. Where
   history is missing or contradictory, hold a visible case. Processor debit and
   reversal pairs alone do not establish a previously successful refund. Recover
   proven success history before applying a later refund return.
3. Let canonical handlers retain the original `REFUND` and append
   `REFUND_RETURN` linked to that movement when a later failure follows proven
   success. Keep provider occurrence order distinct from recovery observation
   time; duplicate delivery must not append a second economic movement.
4. For an actual payment dispute/return, retain `DISPUTE_WITHDRAWAL` separately
   from the refund, even when both concern the same receipt. A proven later
   reinstatement appends `DISPUTE_REINSTATEMENT` linked to its withdrawal. Never
   delete a refund to make a dispute balance look simpler, or treat a refund
   return as a payment dispute reinstatement.
5. Review movement applications as well as gross movement totals. The canonical
   path caps applications to available allocations and links restoration to the
   original application. A later withdrawal after a full refund still needs its
   own economic record and exception review; do not force extra family debt by
   editing allocations. Investigate any unapplied amount and refund-plus-return
   case with the finance owner before a separately approved correction.

## Reconcile and close

- Compare principal in integer minor units, independently per currency. Dispute
  principal/time requires proven balance-transaction evidence. Fees and net
  settlement amounts are not dispute principal; payouts and processor fees are
  reconciled separately and never become family receipts.
- Verify the original receipt, every refund/return/dispute movement, original
  movement links, applications and audited refund status. Duplicate and reordered
  evidence must produce the same final economic history. Preserve issued
  statement snapshots; later activity appears in subsequent reporting.
- Complete interrupted fixed-window pages through the normal atomic cursor
  workflow. Include historical object reads when events exceed the 30-day window;
  a seven-day overlap cannot eliminate an older history gap. Keep unknown identity,
  unmatched money and missing-history cases open until evidence resolves them.
- Record restricted before/after totals, provider/canonical status comparison,
  coverage, remaining exposure and reviewer decision. Acknowledging a case or
  seeing a successful replay is insufficient without financial reconciliation.

Stop and escalate for account/mode/scope mismatch, amount/currency conflicts,
missing successful-refund history, a refund plus later dispute/return, unexplained
unapplied principal, unknown aged operations or settlement differences. Preserve
both movements and the evidence. Do not invent confirmation, net away history,
rewrite a frozen statement or submit compensating money without its separate
approval and live authority where applicable.
