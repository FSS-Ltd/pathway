# Finance provider compatibility evidence

**As-of:** 15 October 2026.

**Decision:** No live collection is authorised. One-off collection is proposed through Stripe Connect direct charges; direct-charge Bacs compatibility remains unproven and is a hard gate.

## What is established from documentation

| Area                      | Documented fact                                                                                                                              | T01 result                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Stripe direct charges     | A direct charge is created on a connected account and uses account-scoped access.                                                            | This is consistent with school-owned funds, but application compatibility and account eligibility must still be tested. |
| Bacs Direct Debit         | Stripe describes delayed confirmation and Connect requirements. A successful mandate setup or submission does not establish payment success. | Provider documentation alone does not prove the planned direct-charge Bacs configuration for a GB school.               |
| NexSteps provider version | Existing lockfile resolves Stripe SDK 14.25.0; current subscription clients pin API version 2023-10-16.                                      | The existing subscription client cannot be treated as a compatibility test for Finance Connect or Bacs.                 |
| Money ownership           | Finance requires one connected account/legal entity per school and no application fee or transfer flow.                                      | Test-account evidence must show the charge and balance movement in the intended connected account.                      |

Sources: [Stripe direct charges](https://docs.stripe.com/connect/direct-charges), [Stripe Bacs Direct Debit](https://docs.stripe.com/payments/bacs-debit). These documents were checked for this plan; revalidate requirements and eligibility immediately before provider integration.

## Sandbox proof status

**Status: BLOCKED — no authorised disposable Stripe test platform/connected-account credentials were available in the T01 environment.**

No provider API calls, connected-account creation, onboarding, Checkout session, PaymentIntent, Bacs mandate, charge, refund, payout or webhook simulation was performed. No production account, key, Stripe Product or Stripe Price was accessed or changed. This is a missing test fixture, not evidence of compatibility or incompatibility. Do not mark T01 provider proof complete.

Before T07 can pass, use an explicitly authorised Stripe sandbox and disposable school-like connected account to record evidence for:

1. Account country, legal-entity type, account ownership and the capabilities available for the intended GB direct-charge flow.
2. Account-scoped creation and retrieval of a one-off hosted card payment; server-side account resolution; no client-supplied connected-account ID.
3. Charge, balance transaction, actual fee, connected-account payout and refund visibility in the correct connected account.
4. Signed event delivery and recovery using account-scoped event identity; duplicate delivery; out-of-order delivery; lost response after provider acceptance; idempotent retry without a second charge.
5. Payer/customer separation across two test schools, proving no cross-school customer reuse or invoice lookup.
6. Disconnected/restricted account behavior and safe cancellation of an unresolved attempt.
7. An explicit compatibility decision for Pay by Bank if it is included in the one-off release. It is optional until the supported method/account combination is proven.

Record API/SDK version, test account capability snapshot, redacted event IDs, expected/actual account context, test run date, and result. Never put API keys, bank details or personal data in this evidence.

## Bacs release gate

Bacs must remain unavailable to live tenants until T13 proves the exact intended direct-charge account/method configuration in sandbox. The proof must include:

- Hosted mandate setup and mandate activation states.
- A submitted debit that remains processing for the documented settlement delay; no premature receipt allocation or “paid” status.
- Confirmed success, failure, cancellation and delayed return/dispute paths, including a return after a refund.
- Duplicate, out-of-order and missed webhook recovery.
- Reconciliation to connected-account balance transactions, fees and payouts.
- A second school account proving tenant/account separation.
- Parent messaging that prevents a second payment while outcome is pending.

If this exact path is unsupported, stop and raise a product/architecture decision. Do not substitute destination charges, separate charges and transfers, another provider, or live enablement without approval. Live Bacs stays disabled after sandbox tests until the release assurance and explicit pilot gates are complete.
