# Declared-capacity V2 release readiness

**Status:** Not released. VAT-inclusive pricing is approved, but NexSteps has no
active UK VAT registration in Stripe live or test mode. V2 checkout and paid
capacity increases remain blocked until registration and provider verification
are complete. **Checked:** 2026-10-16.

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

| Area                   | Evidence on 2026-10-16                                                                                                                 | Status                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| V2 API gate            | `GET https://api.nexsteps.dev/billing/institutional/catalogue/declared-capacity` returned `503 DECLARED_CAPACITY_BILLING_UNAVAILABLE`. | Off; no V2 quote or checkout is available |
| Public configurator    | `https://www.nexsteps.dev/configure` returned HTTP 200; the V2 flag remains off and the legacy configurator is served.                 | No V2 customer flow exposed               |
| Production price map   | `/billing/prices` returned 24 entries, including six active V2 base/child and Finance codes at the approved amounts.                   | Mapped; amounts and modes verified        |
| Stripe Tax             | Stripe live and test modes each returned zero active tax registrations.                                                                | VAT collection unavailable                |
| Provider test journey  | No complete V2 checkout or tax calculation journey has been run.                                                                       | Pending registration and test evidence    |
| Existing subscriptions | A read-only audit on 2026-10-16 recorded four `incomplete_expired` subscriptions and zero non-terminal subscriptions.                  | Recheck immediately before cutover        |

The production price map retains legacy fixed-price and enrolled-child codes
for historical subscriptions and now includes the V2 base/child Prices plus
Finance at £29/month and £290/year. Keep historical codes readable and never
use them as V2 fallback amounts. The V2 UI is selected by
`NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR`; the V2 API is guarded by
`DECLARED_CAPACITY_BILLING_ENABLED`. A separate
`DECLARED_CAPACITY_VAT_ENABLED` flag gates VAT-inclusive customer wording,
automatic tax, checkout, and paid capacity increases. Keep all three flags
false or unset until the checklist below is complete. The V2 API also checks
for an active GB Stripe Tax registration in the matching live or test mode.

## Go-live gates

Complete and record each item before customer cutover:

1. **Complete VAT registration and Stripe setup.** VAT-inclusive price display
   is approved. NexSteps must first register with the relevant tax authority;
   Stripe does not register the business. After registration, enter the real
   registration in Stripe live mode and its test-mode representation, then
   confirm both are active for GB. Approve the applicable tax code and verify
   that the V2 Prices remain tax-inclusive. Do not set
   `DECLARED_CAPACITY_VAT_ENABLED` before these checks pass.
2. **Verify the mapped V2 Prices.** Active licensed recurring GBP Prices are
   already mapped in live and test mode: £74/month and £740/year base, £1/month
   and £10/year per child, and approved Finance at £29/month and £290/year.
   Recheck amounts, intervals, `tax_behavior=inclusive`, and licensed quantity
   behavior before cutover. Keep Price IDs and secrets in the approved secret
   configuration; never put them in this document.
3. **Gate add-ons by delivered status and commercial approval.** Confirm each
   module is delivered. Finance is approved at £29/month and £290/year; offer
   it only while delivered and both inclusive Prices are active and mapped.
   Keep the other seven modules unavailable until both intervals are approved
   and mapped. Set the delivered and
   approved module allow-lists only for eligible modules. Verify each trial
   option stays hidden when either Price is missing.
4. **Run provider-mode journeys in test.** After a valid GB registration is
   represented in Stripe test mode, use a disposable organisation and
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
   enable `DECLARED_CAPACITY_VAT_ENABLED`,
   `DECLARED_CAPACITY_BILLING_ENABLED`, and
   `NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR` in the intended production
   deployments, then smoke-check public and authenticated flows. A merged PR
   alone does not perform or prove this cutover.

## Cutover verification

Record the deployment and revision, resolved flag states (never their secret
values), live Price codes and amounts, customer audit time, and smoke-test
results. Confirm:

- Monthly and annual quotes use the server-derived tier and exact base and
  child line amounts at 0, 74, 75, 150, 250, and 251 children.
- Public and in-app configurators display the approved VAT wording and show
  251+ as an Enterprise contact path.
- Stripe reports an active GB tax registration in live mode, V2 Checkout
  sessions use automatic tax, and every V2 Price is tax-inclusive.
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
`DECLARED_CAPACITY_VAT_ENABLED=false`,
`DECLARED_CAPACITY_BILLING_ENABLED=false`, and
`NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR=false`, then redeploy the
affected services. Confirm new V2 quotes and checkout are unavailable and the
legacy buyer flow remains available. Keep webhook reconciliation enabled for
any V2 sessions already created, reconcile those sessions, and do not disable
global Stripe webhook processing as part of the V2 rollback.

V2 base, child, and Finance Prices are configured and mapped in live and test
mode. The production V2 billing gate still returns 503, the public flow remains
on the legacy configurator, and Stripe has no active VAT registration. No V2
checkout or subscription was created. V2 remains unavailable until all gates
above are evidenced and the production cutover is separately authorized.
