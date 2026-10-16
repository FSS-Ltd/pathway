# Declared-capacity V2 release readiness

**Status:** User-authorized initial launch with VAT collection off. NexSteps is
not VAT-registered yet. V2 checkout may run at the configured total without
collecting VAT; when registration becomes required, VAT will be included within
that same price. **Checked:** 2026-10-16.

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

| Area                   | Evidence on 2026-10-16                                                                                                                 | Status                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| V2 API gate            | `GET https://api.nexsteps.dev/billing/institutional/catalogue/declared-capacity` returned `503 DECLARED_CAPACITY_BILLING_UNAVAILABLE`. | Off; no V2 quote or checkout is available     |
| Public configurator    | `https://www.nexsteps.dev/configure` returned HTTP 200; the V2 flag remains off and the legacy configurator is served.                 | No V2 customer flow exposed                   |
| Production price map   | `/billing/prices` returned 24 entries, including six active V2 base/child and Finance codes at the approved amounts.                   | Mapped; amounts and modes verified            |
| Stripe Tax             | Stripe live and test modes each returned zero active tax registrations.                                                                | VAT collection unavailable                    |
| Provider test journey  | No complete V2 checkout or tax calculation journey has been run; the user authorized initial live pricing with this gap recorded.      | Incomplete; monitor and verify live lifecycle |
| Existing subscriptions | A read-only audit on 2026-10-16 recorded four `incomplete_expired` subscriptions and zero non-terminal subscriptions.                  | Recheck immediately before cutover            |

The production price map retains legacy fixed-price and enrolled-child codes
for historical subscriptions and now includes the V2 base/child Prices plus
Finance at £29/month and £290/year. Keep historical codes readable and never
use them as V2 fallback amounts. The V2 UI is selected by
`NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR`; the V2 API is guarded by
`DECLARED_CAPACITY_BILLING_ENABLED`. A separate
`DECLARED_CAPACITY_VAT_ENABLED` flag controls VAT collection. With it off,
Checkout uses the configured total without Stripe automatic tax and the UI says
VAT is not currently charged. With it on, V2 enables automatic tax and requires
an active GB Stripe Tax registration in the matching live or test mode. V2
Prices remain tax-inclusive so VAT will be included within the same customer
price after registration.

## Go-live gates

Complete and record each item for the applicable launch stage:

1. **Initial unregistered launch.** Keep
   `DECLARED_CAPACITY_VAT_ENABLED=false`. Verify Checkout uses the mapped
   tax-inclusive Prices at the quoted total with automatic tax disabled and
   does not describe VAT as currently collected. When NexSteps becomes required
   to register, register with the relevant authority first; Stripe does not
   register the business. Enter the registration in live mode and its test-mode
   representation, confirm both are active for GB, approve the tax code, and
   verify automatic tax is included within (not added on top of) the same
   customer price before enabling the VAT flag.
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
4. **Record the provider verification gap.** No complete V2 checkout or tax
   calculation journey has been run because the user chose to skip Stripe test
   mode and authorized initial live pricing with this gap recorded. Do not
   describe provider-mode readiness as complete. Monitor and reconcile the first
   live payment, invoice-to-order activation, webhook replay, cancellation, and
   failure behavior. Before VAT collection is enabled, verify the relevant
   provider journeys in test mode with an active test GB registration and
   automatic tax. Before enabling tax collection for existing customers, update
   each active V2 subscription to use automatic tax and verify its next
   invoice. For future test-mode coverage, use a disposable organisation to
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
6. **Stage the authorized initial production cutover.** Enable
   `DECLARED_CAPACITY_BILLING_ENABLED` and
   `NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR`; keep
   `DECLARED_CAPACITY_VAT_ENABLED=false` until registration. Smoke-check public
   and authenticated flows and verify current totals. When registration is
   required, update active V2 subscriptions to automatic tax, then enable the
   VAT flag only after active live and test GB registrations and provider
   checks pass. A merged PR alone does not perform or prove either cutover.

## Cutover verification

Record the deployment and revision, resolved flag states (never their secret
values), live Price codes and amounts, customer audit time, and smoke-test
results. Confirm:

- Monthly and annual quotes use the server-derived tier and exact base and
  child line amounts at 0, 74, 75, 150, 250, and 251 children.
- Public and in-app configurators show 251+ as an Enterprise contact path. With
  VAT collection off, they state that VAT is not currently charged and that it
  will be included within the displayed price after registration.
- Before registration, V2 Checkout sessions have automatic tax disabled and
  charge the configured total. After registration, Stripe reports an active GB
  registration, V2 Checkout uses automatic tax, and every V2 Price is
  tax-inclusive.
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
mode. The production V2 billing gate and public configurator remain off until
the authorized deployment and flag update are completed. Stripe has no active
VAT registration, so launch must keep VAT collection off. No V2 checkout or
subscription has been created.
