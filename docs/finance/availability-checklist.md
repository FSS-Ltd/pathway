# Finance add-on availability checklist

**Decision:** 24 October 2026, Finance is available to schools that purchase it, including
institutional trial slots. See the [decision log](../ADDON_PRICING.md#decision-log).

A school gets Finance when a paid add-on or an included plan grants the `FINANCE` module.
The server access policy then unlocks it. Cancelling a paid add-on moves the school to
servicing only: existing records stay readable and payments in flight are serviced, but new
invoices stop. The chain is covered by
[finance-purchase-access.spec.ts](../../apps/api/src/finance/access/tests/finance-purchase-access.spec.ts).

## Production settings

| Setting                                                       | Value                            | Effect                                                                     |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `DECLARED_CAPACITY_APPROVED_ADDON_MODULES`                    | include `FINANCE`                | Finance is an approved institutional add-on.                               |
| `DECLARED_CAPACITY_DELIVERED_ADDON_MODULES`                   | include `FINANCE`                | Finance can be selected, including trial slots.                            |
| `FINANCE_STRIPE_CONNECT_MODE` / `FINANCE_STRIPE_LIVE_ENABLED` | unchanged (`disabled` / `false`) | School family collection stays off. Purchasing Finance does not need them. |

Both lists are comma separated. Add `FINANCE` to existing values, never replace them. Changes
apply after a redeploy.

## After deploying

1. The institutional catalogue offers Finance with £29 monthly and £290 annual prices from
   Stripe. If a price is missing the API refuses the selection, it does not guess.
2. Buy Finance on a test organisation (Stripe test mode): Finance appears in the staff
   navigation and the Finance API answers; an organisation without it is refused.
3. Cancel the test add-on: reads and exports still work, new invoices are refused.

## Not part of this decision

Live collection for a school (Connect live mode, Bacs live) needs the T19 pilot authorisation.
