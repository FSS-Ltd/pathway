# Finance provider compatibility evidence

**As of:** 23 October 2026.

**Decision:** No live collection is authorised. One-off card collection is planned through Stripe Connect direct charges. Direct-charge Bacs setup and payment have now been demonstrated in Stripe test mode for a synthetic GB school account. This is test-mode compatibility evidence only: live Bacs remains disabled pending cancellation/return assurance, CI and the later release gates. Do not substitute another charge model.

## T18 runtime evidence on 23 October 2026

The selected test key was verified against the expected NexSteps Sandbox platform before account-scoped operations. Finance used its pinned `2026-09-30.endive` API version. An actual connected-account £1 card Checkout completed with synthetic Stripe test data. A genuine signed `checkout.session.completed` event was durably stored while the worker was stopped: the application still showed no receipt and 100 minor units outstanding. Canonical replay and a restarted worker produced exactly one confirmed receipt and allocation, with zero outstanding. Five duplicate signed deliveries did not duplicate money. The evidence is specific to the exercised GBP card configuration and does not establish other countries, currencies or live eligibility.

A second actual Sandbox proof discarded the first successful Checkout-create response after Stripe had accepted it. Retrying through the application sent the identical idempotency key and request body. Two accepted create requests returned one unique remote session; the provider list and database each contained one obligation/attempt. A repeated application start reused that attempt without another create request. The unpaid session was expired, and genuine signed expiry evidence drove the canonical local state to `EXPIRED`. No allocation or receipt was created for that invoice and its 100 minor units remained outstanding. This uses controlled transport response loss after actual provider acceptance, not a claim that an uncontrolled production outage occurred.

The provider returned 100 minor units principal, 23 minor units processor fee and 77 minor units net. There was no application fee or destination transfer. Fees and net settlement remained separate from family debt. The returned descriptor was the synthetic fixture's placeholder, not an accepted school statement descriptor. No payout existed and payouts were disabled; payout reconciliation therefore remains an open provider assurance gate.

Read-only readiness checks still returned two Standard GB school accounts with incomplete onboarding, inactive capabilities and disabled charges/payouts. Successful test charges do not supersede these account-readiness results or establish live capability approval. The owner/manager must complete hosted test onboarding in the selected Sandbox. No login credential, owner attestation or Connect agreement was submitted on their behalf during this assurance step.

A GBP card amount of 29 minor units was rejected by Stripe, while a 30 minor unit session was accepted without payment. NexSteps now checks its explicit per-method support bounds before a new collection instruction and at the provider boundary. Those bounds are product support policy, not a claim that every Stripe account, settlement currency or network has the same limits. Invoice debt is not altered to fit a collection bound.

The populated disposable application database was dumped and restored into a separate local database. Source and restored canonical balances agreed: one invoice, one receipt, one allocation, one completed genuine provider event and zero outstanding. Selected ledger/event snapshots had the same SHA-256 digest, and forced row-level security remained enabled. This establishes a local recovery exercise, not production RPO/RTO.

An actual externally initiated Sandbox API refund of 20 minor units produced genuine signed refund events. Two accepted events, eight duplicate captures, canonical replay and a restarted worker left one refund movement, no local refund operation and one pending-treatment case. The original paid 100 minor unit invoice then showed 80 allocated and 20 outstanding. The default remains `REOPEN_BALANCE`; no credit was inferred. This proves the external API/event boundary, not Stripe Dashboard UI navigation.

A separate independently approved application refund of another 20 minor units exercised actual provider acceptance followed by deliberately lost response. The reservation remained approved with its original attempt identity. Two provider list reads recovered the one accepted refund without a second create request. Exactly one application refund was confirmed; combined with the external refund, total outflow was 40, net allocation 60 and outstanding 40. Signed-event racing for this internal refund was not exercised in that proof; local duplicate/racing coverage remains separately labelled.

Bacs delayed-success/failure, cancellation, mandate refusal and dispute runtime assurance is blocked on the selected connected account. A synthetic SetupIntent was created in test mode and remained `requires_confirmation` with a payment method present. Confirmation returned HTTP 400 `invalid_request_error`: the allowed payment method types were not activated for the account. No debit instruction, receipt or allocation was created; the synthetic invoice remained fully outstanding. Completing account onboarding and enabling the required Bacs method/capability in the same Sandbox is required before retrying. Earlier test-mode compatibility remains valid for its stated scope; additional scenarios are not passing claims until the application ledger and signed-event outcomes are reconciled. Live Bacs stays disabled. No manual production migration/deployment or real-money pilot was performed by this assurance work.

## What is established

### Direct card charges

[Stripe documents direct charges](https://docs.stripe.com/connect/direct-charges) as charges created on a connected account using account-scoped access. This matches the school-owned-funds boundary. The application must resolve account context server-side and test a sandbox flow before release.

### NexSteps Sandbox account

A read-only Stripe response on 15 October 2026 showed test mode (`livemode=false`), GB, a Standard company account, active card and transfer capabilities, and charges and payouts enabled. The account itself is eligible for card payments. This snapshot does not prove that a school connected account can accept a direct charge through the application.

### School connected-account fixture

Read-only v1 and v2 connected-account list responses returned no accounts. No school-like account was available for a Connect-scoped direct-charge test. This is a specific fixture gap, not evidence that direct card charges are incompatible.

On 18 October 2026, a read-only test-mode check found the newly connected school test account still had card payments inactive and onboarding requirements incomplete. It cannot create a Finance card Checkout Session yet. No payment was created. Complete test-account onboarding before claiming provider-backed Checkout verification; do not use live mode for this proof.

On 19 October 2026, a read-only check using the test platform key returned one connected account in GB. Its details were not submitted, requirements were past due, charges and payouts were disabled, and `card_payments` was `inactive`; `bacs_debit_payments` was absent and Bacs display settings were not configured. The response contained no evidence that this account is ready for school collection. Account identifiers and personal details are intentionally omitted.

On 21 October 2026, after sandbox Connect authorization was restored, a fictional GB company profile and Stripe test address were saved to the existing test-mode school account. Its Accounts v2 status showed `card_payments: restricted` with no request recorded, no `bacs_debit_payments` capability, and past-due requirements. A follow-up Accounts v2 update to add remaining business fields and request capabilities returned HTTP 403 because hosted onboarding had already started. The generated hosted onboarding link required completion by the school's owner or a manager; at that point, no password or agreement acceptance had been submitted and no Bacs setup or payment had been created. The later test-mode mandate and payment are recorded below. Account identifiers and personal details are intentionally omitted.

Later on 21 October 2026, the user authorized a test-only hosted Bacs mandate submission using fictional payer details. Stripe confirmed the SetupIntent and saved the mandate. A direct connected-account GBP PaymentIntent then moved from `processing` to `succeeded`; a separate insufficient-funds test moved from `processing` to `requires_payment_method`. Both were created in test mode (`livemode=false`) on the synthetic school account. This proves that the exercised Stripe configuration accepts the planned direct-charge Bacs setup and payment path in test mode. It does not establish live eligibility, prove the application's signed webhook delivery end to end, or clear live-release gates. No real school, real bank account, live payment or production data was used. Provider cancellation and return/dispute simulation remain outstanding; application cancellation, delayed-status, duplicate-event and Bacs receipt-return paths have unit coverage.

#### Synthetic school profile for sandbox testing only

Use the following fictional GB school data with Stripe test keys only. Stripe documents test values for successful identity, address, business-ID, phone, URL and payout verification in its [Connect testing guide](https://docs.stripe.com/connect/testing). These values do not establish that the direct-charge Bacs path is supported.

| Field                                   | Sandbox test value                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| School                                  | `NexSteps Demo School Ltd` (already saved)                                                              |
| Entity                                  | GB company; use `private_corporation` only for this fictional incorporated-company fixture              |
| Business address                        | `address_full_match`, London, `EC1A 1BB`, GB                                                            |
| Business registration ID                | `000000000` (Stripe test success value; use only if the GB company-number field accepts the test token) |
| Business URL                            | `https://accessible.stripe.com` (Stripe test success URL)                                               |
| Product description                     | `School tuition, meals and activities for sandbox testing`                                              |
| School phone                            | `0000000000` (Stripe test success value)                                                                |
| Representative, director and sole owner | `Alex Example`, title `Director`, 100% ownership; fictional test identity                               |
| Representative date of birth and ID     | `1901-01-01` and `000000000` (Stripe test success values)                                               |
| Payout bank                             | Sort code `108800`, account `00012345` (Stripe GB test payout success values)                           |

Use a test inbox controlled by the operator for Stripe login or account notices; `example.com` is only a placeholder. The account holder must create or sign in to the Stripe login, confirm the prefilled test information, and accept the test-mode Connect agreement in the hosted form. Do not record or submit those attestations on the account holder's behalf. The current account already has hosted onboarding started, so Stripe-managed business and person details must be entered through that flow; the Accounts v2 API restricts edits after onboarding starts ([update-account reference](https://docs.stripe.com/api/v2/core/accounts/update)).

### Bacs Direct Debit

[Stripe's Bacs guide](https://docs.stripe.com/payments/bacs-debit) documents delayed confirmation and Connect use through destination charges; when `on_behalf_of` is used, it says to request the connected account's `bacs_debit_payments` capability. Stripe's [direct-charge guide](https://docs.stripe.com/connect/direct-charges) documents account-scoped requests through the `Stripe-Account` header, but does not establish Bacs support for that direct-charge path. The test-mode SetupIntent and connected-account PaymentIntent above are direct evidence for the exercised sandbox configuration. Stripe's [Bacs test scenarios](https://docs.stripe.com/testing#bacs-direct-debit) also document delayed success, failure and dispute cases. Keep live Bacs disabled until cancellation, return/dispute, signed-event replay and release-assurance tests pass. Do not silently switch to destination charges.

### NexSteps application version

The repository lockfile resolves Stripe SDK 14.25.0; existing subscription clients pin API version 2023-10-16. These settings do not prove compatibility for Finance Connect, hosted payments or Bacs. Verify the Finance adapter against the repository's pinned versions during implementation.

### Money ownership

Finance requires one connected account and legal entity per school, with no platform collection, application fee or transfer flow. T07–T10 must demonstrate that the charge, balance transaction, fees and payout belong to the intended school account.

No credentials, account identifiers, service-user numbers, bank details or personal data are stored in this document. The 19 October sandbox checks were read-only; no Stripe objects were created or changed, and no payment, mandate, refund or payout was made. Sources were reviewed on the date above; revalidate provider requirements before implementation and release.

### School currency selection

The Finance profile stores the school's legal country and one collection currency. The initial list covers the UK and all 27 EU member states: EUR for the 21 euro-area countries, and CZK, DKK, HUF, PLN, RON or SEK for the six other EU countries. The UI derives currency from country so invoice currency, Stripe Checkout presentment and school onboarding cannot be configured inconsistently. The [European Commission's country list](https://economy-finance.ec.europa.eu/euro/eu-countries-and-euro_en) confirms 21 euro-area members, including Bulgaria from 1 January 2026. Stripe's [supported currency guide](https://docs.stripe.com/currencies) lists all eight currencies for card presentment. Connected-account country eligibility and live card capability still have to be confirmed during onboarding; a currency on the presentment list does not guarantee payout in that currency. Stripe may convert to the school's settlement currency. HUF charges may use two decimal places, while manual HUF payouts must use whole amounts. Sources rechecked on 19 October 2026.

The Finance profile must be saved before Stripe onboarding. This prevents the onboarding endpoint from silently using the database's legacy GBP default for an EU school. Existing profiles created before country selection retain GB/GBP as a migration default; a connected account or any Finance activity locks those settings.

### T18 observed card currency boundaries — 23 October 2026

The current pinned Checkout adapter created and expired 14 unpaid Sandbox
sessions on one synthetic GB connected account: all eight supported currencies
at the product maximum, and GBP/EUR/CZK/HUF/PLN/RON at the product minimum.
Read-only retrieval confirmed all accepted sessions were test-mode, expired and
unpaid. No payment was confirmed. These are account-scoped presentment-parameter
checks, not proof of non-GB onboarding, successful collection, FX settlement or
payout eligibility.

Stripe rejected DKK250 and SEK300 minor units on that account because they
converted below its GBP30-minor-unit settlement minimum. The two refusals were
repeated independently and retained as negative evidence. Local product bounds
therefore cannot promise acceptance for every school settlement configuration
or future exchange rate. No exchange rate is hardcoded and invoice debt is not
changed, split or rounded to force acceptance.

A definitive provider refusal now closes the failed checkout attempt and returns
a safe HTTP422 directing the payer to another payment method or the school.
Temporary/unknown outcomes retain HTTP503 and their durable operation identity.
The real adapter/service regression and family feedback tests distinguish those
states without parsing or exposing provider error messages. Bacs and payout
readiness remain blocked; this currency probe does not clear their gates.

## Verification assigned to delivery steps

These tests depend on the application adapter and a disposable school-connected sandbox account. They are not prerequisites to documenting T01's architecture and account-level compatibility findings.

### T07: Connected account

Complete or reconnect a disposable school account. Verify country, ownership, card capability and server-side tenant-to-account binding. Confirm cancellation and restricted/disconnected behavior. Keep Finance entitlement separate from school payment collection.

### T08: Webhook resilience

Verify signed webhook ingestion, durable acknowledgement, replay after queue failure, duplicate delivery, out-of-order events and idempotent application.

### T09: Hosted card checkout

Create and recover one hosted card checkout per invoice obligation, including provider timeout and repeated requests. Confirm account-scoped access, no platform fee or cross-school customer reuse, amount refresh after the balance changes, and expiration of an open session when payer access is revoked. Provider-backed creation remains blocked until the school test account's card capability becomes active.

### T10: Confirmed receipts

Post only confirmed receipts. Reconcile charge, balance transaction, actual processor fee and payout in the correct school account. Test partial, failed and delayed outcomes.

### T12: Refunds and returns

Test independently approved refunds, disputes and returns, including a return after a refund. Preserve both movements and reconcile provider evidence.

### T13: Bacs compatibility

Keep Bacs live-disabled. Test mode now proves the exact synthetic school-account setup, mandate, direct-charge success and insufficient-funds failure. Finish provider cancellation and return/dispute simulation, plus duplicate and missed-event replay assurance, before any live release. If direct-charge Bacs fails outside this tested sandbox configuration, raise an architecture decision; do not choose destination charges or another provider without approval.

For each test, record the repository and provider API/SDK versions, date, redacted event identifiers, expected and actual account context, and result. Use disposable test data only.

## Bacs safety gate

Bacs submission is not a receipt. Do not reduce an invoice balance until signed provider evidence or a scoped authenticated provider read confirms payment success and is captured durably for canonical processing. API recovery keeps explicit API provenance; it is never labelled as signature-verified. Processor payouts remain separate. Stripe documents typical settlement delays of four business days for an existing mandate and seven for a new mandate; sandbox timing may be accelerated. Families must see a pending state and must not be prompted to pay again while an attempt is unresolved.

Live Bacs is implemented behind the same live switch as card collection, and it stays off until the owner switches live collection on and records the Bacs evidence gates in the [go-live readiness](t19-go-live-readiness.md). A documentation gap or failed test is a blocker, not permission to change the charge model.

## T17 read-only sandbox recovery observation — 23 October 2026

The selected NexSteps Sandbox platform was verified against the explicitly named test credential before account-scoped reads. The existing synthetic Bacs school account contained four test PaymentIntents: two succeeded and two required a new payment method. Their Charge objects used `py_` identifiers. A direct `GET /v1/charges/{id}` returned the successful non-card charge with `livemode=false`, `payment_method_details.type=bacs_debit`, GBP 100 minor units and the matching PaymentIntent. No payment, refund, mandate, account or configuration was created or changed.

This exposed a recovery compatibility gap: charge validators accepted `ch_` only. T17 now accepts both `ch_` and `py_` Charge identifiers in reconciliation reads and refund/dispute references, while retaining account/mode checks and rejecting other resource types. The actual reconciliation adapter then listed all four test charges and retrieved the matching successful `py_` Charge using its pinned `2026-09-30.endive` API version. Provider identifiers, business details, bank data and key values are omitted from this record.

Five regression assertions failed before the fix; four focused suites / 37 tests passed afterwards, including canonical reversal tests. This is a read-only object-shape/recovery proof. It does not prove signed webhook delivery, provider cancellation/returns, card eligibility, payout reconciliation or a live release. Those gates remain open.

## T17 historical mandate servicing read proof

The actual servicing reader retrieved the existing synthetic school's successful SetupIntent, active Mandate and `bacs_debit` PaymentMethod in the verified NexSteps Sandbox platform/account scope. All three objects were test mode; their customer/method/mandate references agreed. The generic and customer-bound PaymentMethod GETs returned the same identity and customer under the pinned `2026-09-30.endive` API version. The proof fetch transport rejected every non-GET request. No mandate, bank details, provider setting or payment was created or changed. Provider identifiers and credentials are omitted from this record.

Mandate has no creation timestamp; the reader retains the available acceptance timestamp and does not invent a creation date. Acceptance IP/user-agent and bank/contact details are stripped. See [Mandate object](https://docs.stripe.com/api/mandates/object), [SetupIntent retrieval](https://docs.stripe.com/api/setup_intents/retrieve), [PaymentMethod retrieval](https://docs.stripe.com/api/payment_methods/retrieve) and [customer-bound PaymentMethod retrieval](https://docs.stripe.com/api/payment_methods/customer). The cancellation paths were verified with synthetic local data and provider doubles; no actual provider cancellation was submitted. This read proof does not establish card-charge eligibility or enable live Bacs.

## T18 hosted setup revalidation — 23 October 2026

Incomplete connected-account onboarding is still a payout/release gate, but it
did not prevent every exercised Sandbox Bacs operation. A real direct-debit
adapter request against an existing accepted synthetic mandate created a £1
PaymentIntent in processing; a later read reported
requires_payment_method. No confirmed receipt is inferred.

The earlier direct-SetupIntent test harness did not exercise the supported
hosted consent path. Stripe's actual Checkout endpoint rejected the product's
`setup_intent_data[usage]` field with 400 parameter_unknown. Its removal retained
off-session usage: the explicitly user-approved fictional payer completed hosted
Bacs Checkout, and authenticated account-scoped reads verified succeeded setup,
active mandate and consistent customer/method references in test mode. Setup
created no payment. The school login/password step is separate from payer setup.

The return URL also encoded Stripe's session placeholder. The corrected request
keeps `{CHECKOUT_SESSION_ID}` literal after encoding the mandate identifier.
A fresh unsubmitted session preserved that template and the real servicing adapter
expired it. Readback verified a cancelled SetupIntent without a mandate or method
and no PaymentIntent. No previously accepted mandate was detached or cancelled.

These are provider-boundary proofs, not complete ledger, delayed return or payout
assurance. No Custom Branding, production setting or live Bacs activation occurred.
See [Checkout Session parameters](https://docs.stripe.com/api/checkout/sessions/create)
and [Bacs integration requirements](https://docs.stripe.com/payments/bacs-debit).
