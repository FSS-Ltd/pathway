# T07 school Stripe connection

**Status:** Implementation decision for T07. No production Stripe configuration or account is changed by this decision.

## Decision

Create one school-owned Stripe merchant account through the Accounts v2 API and Stripe-hosted Connect Onboarding. Resolve the account only from the server-side Finance connection row scoped to the tenant and organisation. Do not accept a connected-account ID from a browser or payer request.

The account requests the `merchant.card_payments` capability, uses the full Stripe Dashboard, and assigns payment-fee collection and negative-balance liability to Stripe. Family invoices will later use direct charges on this school account. The platform will not collect family money, retain a fee, or reuse payer customers between schools. NexSteps subscription billing remains on the platform's separate billing path.

Accounts v2 account creation and onboarding links use their documented `/v2/core/accounts` and `/v2/core/account_links` endpoints. Account readiness is determined by retrieving the account and checking `configuration.merchant.capabilities.card_payments.status`; returning from onboarding does not imply readiness. Stripe's account-link URL is short-lived and must not be persisted or logged.

Finance connection data is scoped to `FinanceProfile`, `tenantId`, and `orgId`. A tenant/legal entity can have only one connecting, ready, or restricted collection account at a time. Disconnecting the local Finance connection stops future collection use while preserving historical financial records and provider identifiers already attached to those records.

The API connection workflow is available only while Finance entitlement is active and the caller has `finance.payments.manage`. It is unavailable in servicing-only mode. Provider failures fail closed: no connection is marked ready until a server-side capability check succeeds.

## Price and entitlement evidence

The Finance sandbox product is already present and has one active monthly recurring GBP Price at 2,900 pence and one active annual recurring GBP Price at 29,000 pence. The sandbox API returned exactly one product and those two active Prices for that product; no Stripe writes were needed. Catalogue and existing grant logic remain authoritative for plan, bundle, and standalone entitlement selection. A canceled subscription retires only its own grants, so another active plan or bundle grant remains effective.

## Readiness gate

The current sandbox evidence proves the product and prices, but not Connect readiness. A local test-mode credential was confirmed to belong to the NexSteps Sandbox account (`livemode: false`), then the PR's Accounts v2 account-create request was rejected with `invalid_fields`: Connect must be enabled on Accounts v2 before the requested merchant configuration and responsibilities can be used. Stripe returned no account ID, so no connected test account or onboarding link was created. T07 remains incomplete until Accounts v2 Connect is enabled for the sandbox and a disposable school account can be created, onboarded, retrieved with active card capability, and verified under tenant-scoped connection state. Do not substitute the deprecated v1 account-type API, change charge models, create live objects, or enable Bacs to work around this gap.

## References

- [Stripe Accounts v2: create an account](https://docs.stripe.com/api/v2/core/accounts/create)
- [Stripe Accounts v2: create an account link](https://docs.stripe.com/api/v2/core/account-links/create)
- [Stripe Accounts v2: retrieve an account](https://docs.stripe.com/api/v2/core/accounts/retrieve)
- [Stripe direct charges](https://docs.stripe.com/connect/direct-charges)
