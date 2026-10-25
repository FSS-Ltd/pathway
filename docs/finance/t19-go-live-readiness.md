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

1. Set `FINANCE_STRIPE_SERVICING_MODE=live` and `FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE` (a live
   `sk_live_` or restricted `rk_live_` key) explicitly, so existing records can always be serviced
   and refunded even if collection is paused.
2. In Stripe (live mode) add a webhook endpoint that listens to events **on connected accounts**,
   pointing at `https://<api host>/finance/stripe/webhook` (the API has no path prefix). Select
   these events: `account.updated`, `checkout.session.completed`, `checkout.session.expired`,
   `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
   `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
   `payment_intent.canceled`, `setup_intent.succeeded`, `setup_intent.setup_failed`,
   `mandate.updated`, `payment_method.detached`, `refund.created`, `refund.updated`,
   `refund.failed`, `charge.refund.updated`, `charge.dispute.funds_withdrawn`,
   `charge.dispute.funds_reinstated`. Put its signing secret in
   `FINANCE_STRIPE_WEBHOOK_SECRET_LIVE`. Without that secret the Finance webhook is off: payments
   would be taken but not recorded until recovery reads them from Stripe.
3. Set all of these together, Production only, and `FINANCE_STRIPE_LIVE_ENABLED=true` last:
   `FINANCE_STRIPE_CONNECT_MODE=live`, `FINANCE_STRIPE_CONNECT_RETURN_URL` and
   `FINANCE_STRIPE_CONNECT_REFRESH_URL` (absolute HTTPS URLs), and a valid `WEB_APP_URL` (HTTPS,
   origin only). Live billing credentials must already be configured. If any of these is missing or
   inconsistent the API refuses to start, so redeploy once with the full set. The application also
   refuses live mode unless `NODE_ENV` and `VERCEL_ENV` are both production.
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

**Pause:** set `FINANCE_STRIPE_CONNECT_MODE=disabled` and `FINANCE_STRIPE_LIVE_ENABLED=false`
**together** and redeploy. Setting only one of them stops the API from starting: live mode needs the
live switch, and the live switch needs live mode. New collection stops for every school, card and
Bacs. Servicing stays on only if `FINANCE_STRIPE_SERVICING_MODE=live` and
`FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE` were set explicitly beforehand (see enablement step 1);
without them, servicing follows the collection mode and stops too. Resume after the cause is
recorded. Servicing mode `disabled` also stops provider reads, for incidents only.

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

## Bacs live

Bacs now runs in live mode on the same switch as card: the provider, mandate setup, plan
approval, due-collection job and mandate activation all follow `FINANCE_STRIPE_CONNECT_MODE`.
There is no separate Bacs switch, so the pause below stops both. Stored mandates, customers and
school accounts must match the configured mode, and a mismatch is refused, so test-mode records
can never be debited live.

Two things sit outside the code change:

1. **Owner evidence.** Record the Bacs outcomes you verified in Stripe (delayed collection, return,
   dispute, payout) in [PROGRESS.md](PROGRESS.md) before switching live on.
2. **The scheduled job.** `POST /internal/finance/bacs/run-due` collects due instalments. Schedule
   the worker (`FINANCE_BACS_COLLECTION_JOB_URL` and `FINANCE_BACS_COLLECTION_JOB_SECRET`) only
   when live collection is on. Until it runs, mandates can be set up but nothing is debited.

Live Bacs setups need a GB school profile in GBP. Payers sign a mandate once, then instalments
collect automatically; a debit is never a receipt until the provider confirms it.

## Handover

Hand over: the settings in force, the reconciliation log for the first payments, open recovery
cases (target zero), the on-call contact, and the pause procedure. Evidence goes in
[PROGRESS.md](PROGRESS.md).

## Decisions needed

P1 to P7, and whether live card goes on before live Bacs is built.
