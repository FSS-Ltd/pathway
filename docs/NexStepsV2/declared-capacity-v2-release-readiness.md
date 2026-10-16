# Declared-capacity V2 release readiness

**Status:** Not released. Cutover is blocked pending provider setup, tax wording,
and end-to-end payment evidence. **Checked:** 2026-10-16.

This runbook covers the `DECLARED_CAPACITY_V2` institutional subscription and
the eight trial-eligible modules. It does not change existing `ENROLLED_CHILDREN_V1`
subscriptions or authorize repricing them.

## Commercial contract

The server derives the tier from declared child capacity. Monthly billing is
£74 plus £1 per declared child. Annual billing is £740 plus £10 per declared
child, paid upfront. Capacity 0–74 is Starter, 75–149 Growth, 150–250
Professional, and 251+ requires an Enterprise quote. Site allowances remain
1/2/5. The master organisation remains exempt.

Finance is approved at **£29/month and £290/year**. Events, Transport, Meals,
Asset Management, HR, Advanced Reporting, and Learning remain Proposed in
`docs/ADDON_PRICING.md`. An existing legacy Learning Price mapping does not
change that status. A module may be trialled only when it is delivered and its
approved monthly and annual Prices are both mapped.

## Readiness evidence

| Area                   | Evidence on 2026-10-16                                                                                                                                                          | Status                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| V2 API gate            | `GET https://api.nexsteps.dev/billing/institutional/catalogue/declared-capacity` returned `503 DECLARED_CAPACITY_BILLING_UNAVAILABLE`.                                          | Off                                                                        |
| Public configurator    | `https://www.nexsteps.dev/configure` returned HTTP 200, but V2 capacity and pricing copy was not present in the rendered HTML; the apex URL redirects to `www`.                 | No public V2 copy observed                                                 |
| Production price map   | `/billing/prices` returned 18 entries. None uses `DECLARED_CAPACITY_*` or `MODULE_FINANCE_*` price codes.                                                                       | Missing V2 base and Finance mappings                                       |
| Stripe Products        | Finance name search returned no Product in the connected live account or test account.                                                                                          | Finance Product and Prices missing                                         |
| Provider test journey  | No disposable V2 checkout was run. The local app has no test-mode Stripe secret or V2 Price map.                                                                                | Unverified                                                                 |
| VAT display            | The add-on catalogue requires consistent VAT-inclusive or VAT-exclusive wording. No V2 decision or customer-facing VAT wording was found in the affected configurator surfaces. | Product/commercial decision required                                       |
| Existing subscriptions | A read-only audit on 2026-10-16 recorded four `incomplete_expired` subscriptions and zero non-terminal subscriptions.                                                           | Recheck immediately before cutover; do not bulk-reprice from this snapshot |

The production price map still contains legacy fixed-price and enrolled-child
codes. Keep those records readable for historical subscriptions. Do not use
them as V2 fallback amounts. The V2 UI is selected by
`NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR`; the V2 API is guarded by
`DECLARED_CAPACITY_BILLING_ENABLED`. The API gate is observed off. Keep both
deployment flags false or unset until the checklist below is complete.

## Go-live gates

Complete and record each item before customer cutover:

1. **Resolve tax wording.** Product/commercial must decide whether advertised
   prices include or exclude VAT and approve the exact wording for the public
   and in-app configurators, quote, checkout, and add-on screens. Do not infer
   this from Stripe tax settings.
2. **Create and map V2 base Prices.** In the connected test account, configure
   GBP recurring Prices for `DECLARED_CAPACITY_BASE_MONTHLY` (£74/month),
   `DECLARED_CAPACITY_BASE_YEARLY` (£740/year),
   `DECLARED_CAPACITY_CHILD_MONTHLY` (£1/month), and
   `DECLARED_CAPACITY_CHILD_YEARLY` (£10/year). Verify IDs, intervals, currency,
   unit amounts, and licensed quantity behavior. Store test and production
   mappings in the approved secret configuration; never put Price IDs or
   secrets in this document.
3. **Gate add-ons by delivered status and commercial approval.** Confirm each
   module is delivered. Finance may be configured at £29/month and £290/year
   after matching Prices are created. Keep the other seven modules unavailable
   until both intervals are approved and mapped. Set the delivered and
   approved module allow-lists only for eligible modules. Verify each trial
   option stays hidden when either Price is missing.
4. **Run provider-mode journeys in test.** Use a disposable organisation and
   verify monthly and annual signup, exact capacity totals and site limits,
   Enterprise routing at 251, add-on selection without activation, billing
   admin activation and the full 60-day lifecycle using a controlled clock,
   the 10-day banner, exact expiry, one expiry email, the modal, decline,
   monthly/annual opt-in purchase, failed or abandoned checkout, verified
   webhook activation, replay idempotency, capacity increase/proration, and
   renewal decrease. Confirm no charge or paid entitlement occurs before a
   successful checkout webhook.
5. **Reconcile customers and operations.** Repeat the live subscription audit
   immediately before cutover. Confirm the master organisation exemption and
   that no customer will be silently repriced. Check alerts and logs for quote
   mismatch, checkout failure, webhook failure, expiry lag, email delivery
   failure, and duplicate delivery. Verify billing-contact fallback behavior.
6. **Authorize and stage production cutover.** After review of the evidence,
   obtain the required production-change authorization. Map only verified live
   Price IDs, enable `NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR` and
   `DECLARED_CAPACITY_BILLING_ENABLED` in the intended production deployments,
   and smoke-check the public and authenticated flows. A merged PR alone does
   not perform or prove this cutover.

## Cutover verification

Record the deployment and revision, resolved flag states (never their secret
values), live Price codes and amounts, customer audit time, and smoke-test
results. Confirm:

- Monthly and annual quotes use the server-derived tier and exact base and
  child line amounts at 0, 74, 75, 150, 250, and 251 children.
- Public and in-app configurators display the approved VAT wording and show
  251+ as an Enterprise contact path.
- Selecting a module during signup only records pending interest. The trial
  starts only after an authorized billing admin activates it.
- Trial expiry removes module access based on the stored expiry instant even if
  the worker is late. Email delivery and modal presentation are idempotent.
- A positive purchase decision offers independent monthly and annual choices;
  access begins only after the successful provider webhook.
- Capacity increases require accepted provider-backed quotes and successful
  payment before the hard cap rises. Decreases apply at renewal and preserve
  active enrolments and site limits.
- The master organisation remains exempt, and existing subscriptions retain
  their accepted prices.

## Rollback

If any cutover check fails, set
`DECLARED_CAPACITY_BILLING_ENABLED=false` and
`NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR=false`, then redeploy the
affected services. Confirm new V2 quotes and checkout are unavailable and the
legacy buyer flow remains available. Keep webhook reconciliation enabled for
any V2 sessions already created, reconcile those sessions, and do not disable
global Stripe webhook processing as part of the V2 rollback.

No production flag, Stripe Product, Price, or subscription was changed while
preparing this runbook. V2 remains unavailable until all gates above are
evidenced and the production cutover is separately authorized.
