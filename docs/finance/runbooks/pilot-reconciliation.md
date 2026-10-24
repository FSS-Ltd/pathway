# Live pilot: first payments and daily reconciliation

Use only after the owner has authorised the live pilot and every gate in
[T19 readiness](../t19-pilot-readiness.md) is recorded. This document proves no live exercise.

## Before the first payment

1. Confirm the staff workspace shows the school's live connection and the expected account.
2. Confirm collection and servicing settings match the design doc, with `FINANCE_STRIPE_LIVE_ENABLED=true`.
3. Confirm the pause procedure is understood by the person on call.
4. Create one small real invoice for the owner or school lead.

## For each payment

1. Pay the invoice with a real card through the hosted page. Do not repeat taps or refresh.
2. In Finance, confirm one receipt and one allocation, invoice outstanding reduced by exactly the amount.
3. In the school's Stripe account, find the charge. Gross must equal the receipt.
4. Record the fee and net from the balance transaction. They must not appear as family debt.
5. Log: time, invoice, receipt, charge ID, gross, fee, net, any difference.

## End of day

1. Sum receipts and compare with Stripe charges for the day. Difference must be zero.
2. Check no invoice is stuck processing and the webhook inbox is empty. If not, follow
   [missed webhooks](missed-webhooks.md).
3. When a payout arrives, match its constituents to the day's charges and fees in the settlement
   report. The family ledger must be unchanged.
4. Check open recovery cases. Target is zero.

## Stop and pause

Any unexplained difference, duplicate receipt, wrong amount or access error: stop, set
`FINANCE_STRIPE_LIVE_ENABLED=false`, redeploy, and open the matching runbook. Do not edit the
ledger by hand or mark anything paid manually to make a figure agree.

## Refunds

Refund through the normal Finance flow only, then follow [refunds and returns](refunds-and-returns.md).
