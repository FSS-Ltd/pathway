# T19 Finance go-live readiness

**Owner:** Technical Agent. **Status:** Draft, awaiting owner sign-off. **Created:** 24 October 2026.
**Related:** [build plan](build-plan.md), [environment safety](environment-and-backup-safety.md),
[recovery design](reconciliation-and-recovery.md), [provider compatibility](provider-compatibility.md),
[T18 evidence](release-evidence/t18-scenario-matrix.md), [availability checklist](availability-checklist.md).

This prepares live collection for any school that buys Finance. It switches nothing on. The live
settings below are the owner's to change.

## Problem

Finance is built and purchasable, but live family payments are off in production. Customers can
buy the add-on today and cannot yet collect real money through it. This document says what must
be true to switch collection on for every Finance customer, and how to watch and stop it.

## Scope

| In scope                                                                  | Out of scope                                  |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| Live card payments via hosted Checkout in the school's own Stripe account | Application fee, surcharge or pooled funds    |
| Live Bacs Direct Debit, after its own code change (below)                 | Accounting-ledger replacement                 |
| Invoices, receipts, credits, refunds, statements, reports                 | A separate pilot school or extra payment caps |

No pilot school is needed and no extra caps are set. The product's own per-payment limits already
apply (card minimum and maximum, Bacs limits) and are unchanged.

## Platform gates (once, before the live switch)

| #   | Gate                                                                                  | Owner             |
| --- | ------------------------------------------------------------------------------------- | ----------------- |
| P1  | Live webhook endpoint registered with its own signing secret, Production only         | Technical         |
| P2  | Backup freshness and point-in-time recovery confirmed on the production database      | Technical         |
| P3  | Hosted document bucket confirmed private (the T18 proof used a local stack)           | Technical         |
| P4  | Webhook processing mode decided: persistent-host listener, or scheduled recovery only | Technical + owner |
| P5  | Terms and data-processing wording for Finance accepted                                | Product owner     |
| P6  | Tagged-PDF decision made (see the Technical Note in PROGRESS.md)                      | Product owner     |
| P7  | A named person to act on the pause procedure, and it has been rehearsed once          | Product owner     |

## Per customer (at onboarding, not a blocker for the switch)

The school completes live Stripe onboarding, confirms its card statement name, and records its
own retention, tax and parent-notification decisions. NexSteps does not invent a retention period.

## Live enablement (card)

Production only. Never copy test values or a local `.env`.

1. Set `FINANCE_STRIPE_SERVICING_MODE=live` with the matching restricted key, so existing records
   can always be serviced and refunded even if collection is stopped.
2. Register `FINANCE_STRIPE_WEBHOOK_SECRET_LIVE` and confirm signed delivery with a Stripe test event.
3. Set `FINANCE_STRIPE_CONNECT_MODE=live` and HTTPS return and refresh URLs, then
   `FINANCE_STRIPE_LIVE_ENABLED=true` last. The application refuses this unless `NODE_ENV` and
   `VERCEL_ENV` are both production.
4. Redeploy. Confirm a school with Finance sees the live connection step and a school without it
   is still refused.
5. Reconcile the first real payment from whichever customer pays first, using the
   [first-payments runbook](runbooks/first-payments-reconciliation.md).

## Reconciliation (what "clean" means)

| Check           | Source A                          | Source B                                   |
| --------------- | --------------------------------- | ------------------------------------------ |
| Receipt amount  | Finance receipt and allocation    | Stripe charge (gross, school account)      |
| Invoice balance | Invoice outstanding after payment | Invoice total less allocations             |
| Processor fee   | Stripe balance transaction        | Settlement view in Finance                 |
| Payout          | Stripe payout constituents        | Settlement report; family ledger untouched |

A payout never changes a family balance. Fees and payouts stay separate from debt. A difference
opens a recovery case; never adjust the ledger by hand.

## Failure modes and pause

| Failure                            | Effect                         | Response                                                                    |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| Webhook missed or delayed          | Balance lags the real payment  | [Missed webhooks](runbooks/missed-webhooks.md); recovery reads the provider |
| Provider outage                    | New payments fail safely       | [Provider outage](runbooks/provider-outage.md)                              |
| Wrong amount, duplicate or dispute | Receipt needs reversing        | [Refunds and returns](runbooks/refunds-and-returns.md)                      |
| Anything unexplained               | Possible money or access fault | **Pause**, then investigate                                                 |

**Pause:** set `FINANCE_STRIPE_LIVE_ENABLED=false` and redeploy. New collection stops for every
school. Servicing stays on, so in-flight payments, refunds and statements keep working. Resume
after the cause is recorded. Servicing mode `disabled` also stops provider reads, for incidents only.

**Rollback:** the same switch. No schema change is involved. Money already collected sits in the
school's own account and is refunded through the normal refund flow.

## Security and privacy

No secret is stored in the repository or chat. Funds go to the school's own account; NexSteps holds
none. Every request still passes the server access policy (module, role, payer grant). Logs and
events carry identifiers, never card or bank details.

## Success measures

- Zero difference across receipt, balance, fee and payout checks for the first customer's first
  two days of real payments.
- Zero cross-tenant or unentitled access found in access logs.
- Pause rehearsed before the switch and works as described.

## Bacs live (separate change)

The Bacs provider is bound to test mode and rejects live responses, and the collection job
refuses to run outside test mode. Live Bacs needs a reviewed code change that runs Bacs in live
mode only when `FINANCE_STRIPE_LIVE_ENABLED=true`, plus the exact-path tests and the owner's
recorded Bacs evidence (delayed collection, return, dispute, payout). Until it merges, Bacs stays
test-only and card goes first.

## Handover

Hand over: the settings in force, the reconciliation log for the first payments, open recovery
cases (target zero), the on-call contact, and the pause procedure. Evidence goes in
[PROGRESS.md](PROGRESS.md).

## Decisions needed

P1 to P7, and whether live card goes on before live Bacs is built.
