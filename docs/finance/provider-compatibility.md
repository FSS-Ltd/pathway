# Finance provider compatibility evidence

**As of:** 19 October 2026.

**Decision:** No live collection is authorised. One-off card collection is planned through Stripe Connect direct charges. The connected school account and account-scoped transaction path must be exercised in T07–T10 before release. Direct-charge Bacs remains blocked pending explicit Stripe compatibility evidence; do not substitute another charge model.

## What is established

### Direct card charges

[Stripe documents direct charges](https://docs.stripe.com/connect/direct-charges) as charges created on a connected account using account-scoped access. This matches the school-owned-funds boundary. The application must resolve account context server-side and test a sandbox flow before release.

### NexSteps Sandbox account

A read-only Stripe response on 15 October 2026 showed test mode (`livemode=false`), GB, a Standard company account, active card and transfer capabilities, and charges and payouts enabled. The account itself is eligible for card payments. This snapshot does not prove that a school connected account can accept a direct charge through the application.

### School connected-account fixture

Read-only v1 and v2 connected-account list responses returned no accounts. No school-like account was available for a Connect-scoped direct-charge test. This is a specific fixture gap, not evidence that direct card charges are incompatible.

On 18 October 2026, a read-only test-mode check found the newly connected school test account still had card payments inactive and onboarding requirements incomplete. It cannot create a Finance card Checkout Session yet. No payment was created. Complete test-account onboarding before claiming provider-backed Checkout verification; do not use live mode for this proof.

### Bacs Direct Debit

[Stripe's Bacs guide](https://docs.stripe.com/payments/bacs-debit) documents delayed confirmation and Connect use through destination charges. It does not document the planned direct-charge Bacs flow. The sandbox response included Bacs display settings but no `bacs_debit_payments` capability. Display settings are not capability or payment evidence. Keep direct-charge Bacs disabled and obtain provider confirmation plus exact-path tests before T13 can pass. Do not silently switch to destination charges.

### NexSteps application version

The repository lockfile resolves Stripe SDK 14.25.0; existing subscription clients pin API version 2023-10-16. These settings do not prove compatibility for Finance Connect, hosted payments or Bacs. Verify the Finance adapter against the repository's pinned versions during implementation.

### Money ownership

Finance requires one connected account and legal entity per school, with no platform collection, application fee or transfer flow. T07–T10 must demonstrate that the charge, balance transaction, fees and payout belong to the intended school account.

No credentials, account identifiers, service-user numbers, bank details or personal data are stored in this document. No Stripe objects were created or changed, and no payment, mandate, refund or payout was made. Sources were reviewed on the date above; revalidate provider requirements before implementation and release.

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

Keep Bacs live-disabled. Prove the exact school-account/method configuration, hosted mandate setup, delayed processing, success, failure, cancellation, return, duplicate and missed-event recovery before any release. If direct-charge Bacs is unsupported, raise an architecture decision; do not choose destination charges or another provider without approval.

For each test, record the repository and provider API/SDK versions, date, redacted event identifiers, expected and actual account context, and result. Use disposable test data only.

## Bacs safety gate

Bacs submission is not a receipt. Do not reduce an invoice balance until a signed provider event confirms settlement. Stripe documents typical settlement delays of four business days for an existing mandate and seven for a new mandate; sandbox timing may be accelerated. Families must see a pending state and must not be prompted to pay again while an attempt is unresolved.

Live Bacs remains disabled until T13's exact-path tests, T18 assurance and the separately authorised pilot gates pass. A documentation gap or failed test is a blocker, not permission to change the charge model.
