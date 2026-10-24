# Finance statement-name setting

## Goal

Help authorised school staff choose a recognisable name for parents' card statements, preview it, and verify the name recorded by Stripe.

## Architecture and constraints

The existing Connect integration creates Accounts v2 accounts with full Stripe Dashboard access and Stripe-collected requirements. Stripe owns the final edit after hosted onboarding starts. A guarded Sandbox test on 24 October 2026 confirmed that updating `configuration.merchant.statement_descriptor.descriptor` on an existing fictional school returns HTTP 403 `forbidden` after onboarding. Do not present a local preference as a successful provider change, change account responsibilities, or introduce another charge model.

Read the descriptor from the tenant's existing connection through Accounts v2, including `configuration.merchant`. Keep provider access server-side, verify account identity, mode and country, and recheck Finance access and connection ownership after the network request. Scope the route with staff Finance payment-read permission and `private, no-store`. No schema change or stored second source of truth is needed.

Use the existing Finance settings page, shared controls, Nunito/Quicksand typography and semantic colours. Provide a labelled draft, validation, an illustrative card-statement preview, instructions for the school account owner to update Stripe, and an explicit on-demand check of the provider value. A draft is never labelled saved or applied. After Stripe sign-in, explicitly instruct the owner to select the matching school account; do not invent an account-specific sign-in URL.

Bacs branding is separate. Do not write Bacs display-name fields or activate its paid custom-branding feature. The card preview does not represent a Direct Debit statement.

## Acceptance and verification

- [x] Server reads only the authenticated tenant/organisation's current connection; locked access and revoked permission cannot expose data.
- [x] Disconnected, unconfigured and unavailable connections have useful states; a connection or entitlement revoked during a provider read blocks its result.
- [x] Provider contract requests merchant configuration and rejects mismatched account, mode, country and malformed descriptor data.
- [x] Validation accepts 5–22 Latin characters with at least one letter and rejects Stripe's forbidden characters. School identity remains subject to Stripe verification.
- [x] Preview is labelled illustrative, explains bank variation and separates Bacs. Invalid or unapplied drafts never appear as confirmed provider state.
- [x] Repeated refreshes cannot overlap or restore an older protected result; no idle polling, timer or automatic provider mutation.
- [x] Component tests and the in-app browser verify labelled controls, invalid drafts, keyboard focus, denied/servicing states and wrapping at 320px container width with 200% text. This is actual-component mock API evidence, not end-to-end school sign-in or a completed Stripe edit. Existing admin tokens provide the current light appearance; no dark-theme claim is made.
- [ ] Run affected format, lint, type, unit/integration and build checks; inspect every changed file. Rebase on current GitHub master before raising the standalone PR, then wait for current-revision CI and confirmed merge.

## Provider references

- [Accounts v2 merchant descriptor contract](https://docs.stripe.com/api/v2/core/accounts/update?query=configuration).
- [Connected account descriptor ownership](https://docs.stripe.com/connect/statement-descriptors).
- [Descriptor requirements](https://docs.stripe.com/get-started/account/statement-descriptors).
- [Bacs custom branding](https://docs.stripe.com/payments/bacs-debit#custom-branding).

## Local evidence

- Provider contract/service/controller: 28 unit tests passed. An omitted optional shortened-prefix response is covered.
- Real HTTP/auth/RLS: five integration tests passed on the disposable review database, including another tenant, a family payer, servicing/locked access and entitlement revocation during the external read.
- Admin component/validation tests passed, including repeated taps, unapplied drafts, denied reads and late-response cancellation. The copied-name success test does not prove the clipboard permission outcome in every browser.
- A read-only call through the implemented reader confirmed the existing fictional GB/full-Dashboard Sandbox account's applied descriptor. The earlier guarded write returned forbidden; no provider field was changed. School-owner sign-in and the final edit remain an external verification item.
- Independent read-only review found no remaining blocking defects after correcting the optional-prefix contract. Type, lint and build results are recorded in the progress document before PR delivery.

## Rollout and recovery

No migration, new dependency, payment, subscription change, paid branding or production deployment. Existing payment processing is unchanged. Remove the new surface/route to roll back; drafts exist only in the open form. Complete T18 provider and accessibility assurance separately. T19 remains unstarted.
