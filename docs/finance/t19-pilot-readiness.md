# T19 Finance live pilot: readiness design

**Owner:** Technical Agent. **Status:** Draft, awaiting owner sign-off. **Created:** 24 October 2026.
**Related:** [build plan](build-plan.md), [environment safety](environment-and-backup-safety.md),
[recovery design](reconciliation-and-recovery.md), [provider compatibility](provider-compatibility.md),
[T18 evidence](release-evidence/t18-scenario-matrix.md), [availability checklist](availability-checklist.md).

This document prepares the pilot. It authorises nothing. Every live switch, real payment and
production change below needs the owner's explicit go-ahead naming the school and the date.

## Problem

Finance is built and purchasable, but no school has taken a real family payment through it. The
pilot proves one school can invoice, collect, refund and reconcile real money without any
cross-tenant or unentitled access. No pilot school exists yet, so this pack is written for "the
first customer" and is filled in when they sign.

## Scope

| In the pilot                                                         | Out of the pilot                                  |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| One school, one legal entity, one collection account                 | A second school before the first reconciles clean |
| Card payments via hosted Checkout in the school's own Stripe account | Application fee, surcharge or pooled funds        |
| Bacs Direct Debit, after its own gated change (below)                | General availability marketing of live collection |
| Manual receipts, credits, refunds, statements, reports               | Accounting-ledger replacement                     |

## Approach

1. **Card first.** Live card collection needs configuration only. All code paths were proved in
   Stripe Sandbox in T18.
2. **Bacs second, behind its own PR.** The Bacs provider is bound to test mode and rejects any
   live response, and the collection job refuses to run outside test mode. Live Bacs therefore
   needs a code change, one reviewed PR, plus its own go-ahead. It is not a settings flip.
3. **Small and watched.** A low per-payment and total cap for the first week, reconcile after
   every payment, widen only when two consecutive days reconcile to zero difference.

## Gates before any live switch

Each gate needs a named owner and recorded evidence. A gap blocks the switch.

| #   | Gate                                                                                            | Owner                  |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| G1  | Pilot school, legal entity, country and currency named in writing                               | Product owner          |
| G2  | School completed live Stripe onboarding; card payments and payouts enabled; descriptor accepted | School + product owner |
| G3  | Per-payment cap and total cap for week one agreed and recorded                                  | Product owner          |
| G4  | School's retention, tax and parent-notification decisions recorded (no period is invented here) | School                 |
| G5  | Terms and data-processing wording accepted by the school                                        | Product owner          |
| G6  | Live webhook endpoint registered with its own signing secret, in Production only                | Technical              |
| G7  | Backup freshness and point-in-time recovery confirmed on the production database                | Technical              |
| G8  | Webhook processing mode decided: persistent-host listener, or scheduled recovery only           | Technical + owner      |
| G9  | Hosted storage bucket policy confirmed private (the T18 proof used a local stack)               | Technical              |
| G10 | Tagged-PDF decision made (see PROGRESS.md Technical Note)                                       | Product owner          |
| G11 | On-call person named for the pilot window, with the pause procedure rehearsed                   | Product owner          |

## Live enablement sequence (card)

Production only. Never copy test values or a local `.env`.

1. Set `FINANCE_STRIPE_SERVICING_MODE=live` with the matching restricted key, so existing records
   can always be serviced and refunded even if collection is stopped.
2. Register the live Finance webhook secret (`FINANCE_STRIPE_WEBHOOK_SECRET_LIVE`) and confirm
   signed delivery to the inbox with a Stripe test event.
3. Set `FINANCE_STRIPE_CONNECT_MODE=live`, HTTPS return and refresh URLs, then
   `FINANCE_STRIPE_LIVE_ENABLED=true` last. The application refuses this unless
   `NODE_ENV` and `VERCEL_ENV` are both production.
4. Redeploy. Confirm the staff workspace shows the school's live connection and that a test
   organisation without the module is still refused.
5. Take the first payment as the owner or school lead, for the smallest real invoice, and follow
   the [pilot reconciliation runbook](runbooks/pilot-reconciliation.md).

## Reconciliation (what "clean" means)

For each payment and again at the end of each day, four figures must agree:

| Check           | Source A                          | Source B                                   |
| --------------- | --------------------------------- | ------------------------------------------ |
| Receipt amount  | Finance receipt and allocation    | Stripe charge (gross, school account)      |
| Invoice balance | Invoice outstanding after payment | Invoice total less allocations             |
| Processor fee   | Stripe balance transaction        | Settlement view in Finance                 |
| Payout          | Stripe payout constituents        | Settlement report; family ledger untouched |

A payout never changes a family balance. Fees and payouts stay separate from debt. Any
difference opens a recovery case; do not adjust the ledger by hand.

## Failure modes and pause

| Failure                            | Effect                         | Response                                                                    |
| ---------------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| Webhook missed or delayed          | Balance lags the real payment  | [Missed webhooks](runbooks/missed-webhooks.md); recovery reads the provider |
| Provider outage                    | New payments fail safely       | [Provider outage](runbooks/provider-outage.md)                              |
| Wrong amount, duplicate or dispute | Receipt needs reversing        | [Refunds and returns](runbooks/refunds-and-returns.md)                      |
| Anything unexplained               | Possible money or access fault | **Pause** (below), then investigate                                         |

**Pause:** set `FINANCE_STRIPE_LIVE_ENABLED=false` and redeploy. New collection stops. Servicing
stays on, so in-flight payments, refunds and statements keep working. Resume only after the cause
is recorded. To stop provider reads as well (incident only), set servicing mode `disabled`, then
recover queued evidence afterwards.

**Rollback:** the same switch. No schema change is needed to roll back the pilot. Money already
collected stays in the school's own account and is refunded through the normal refund flow.

## Security and privacy

No secret is stored in the repository or chat. Funds go to the school's own account; NexSteps
holds none. Every request still passes the server access policy (module, role, payer grant).
Logs and events carry identifiers, not card data or bank details. The pilot school's data is
not used for demos.

## Success measures

- Zero difference across receipt, balance, fee and payout checks for two consecutive days.
- Zero cross-tenant or unentitled access found in access logs.
- Every payment visible to the payer within the agreed time of the real payment.
- Pause rehearsed once before the first live payment and works as described.

## Bacs live enablement (separate change)

Needs: a reviewed PR that lets the Bacs provider and job run in live mode only when the live
switch is on; the exact-path tests; and your recorded Bacs evidence (delayed collection,
return, dispute, payout) attached to the release record. Keep Bacs live-disabled until then.

## Handover

At the end of the pilot window hand over: the reconciliation log, open recovery cases (target
zero), the settings in force, the on-call contact, and a go or no-go recommendation for the next
school. The progress record in [PROGRESS.md](PROGRESS.md) is updated with the evidence.

## Decisions needed

G1 to G11 above, the caps in G3, and whether Bacs joins the first week or follows it.
