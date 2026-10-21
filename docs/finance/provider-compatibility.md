# Finance provider compatibility evidence

**As of:** 21 October 2026.

**Decision:** No live collection is authorised. One-off card collection is planned through Stripe Connect direct charges. Direct-charge Bacs setup and payment have now been demonstrated in Stripe test mode for a synthetic GB school account. This is test-mode compatibility evidence only: live Bacs remains disabled pending cancellation/return assurance, CI and the later release gates. Do not substitute another charge model.

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

Bacs submission is not a receipt. Do not reduce an invoice balance until a signed provider event confirms settlement. Stripe documents typical settlement delays of four business days for an existing mandate and seven for a new mandate; sandbox timing may be accelerated. Families must see a pending state and must not be prompted to pay again while an attempt is unresolved.

Live Bacs remains disabled until T13's exact-path tests, T18 assurance and the separately authorised pilot gates pass. A documentation gap or failed test is a blocker, not permission to change the charge model.
