# ADR 0001: Finance boundaries, access and source of truth

**Status:** Accepted for T01 planning; implementation evidence still required.

**Date:** 15 October 2026.

**Context:** Finance is a paid NexSteps capability with school-owned receipts, family-facing invoices, manual and provider payments, immutable statements and operational reports.

## Decisions

### 1. Keep school collection separate from SaaS billing

Finance is a bounded context inside the existing API and database, with a distinct collection adapter, connection mapping, payer-customer namespace, webhook evidence and ledger. Existing billing remains responsible for NexSteps subscriptions and Finance entitlement grants. No school invoice is a NexSteps subscription invoice.

**Reason:** Existing billing is already operationally coupled to plan prices and subscriptions. Reusing its customer identity or payment ledger risks mixing school funds with platform revenue and cross-school access.

### 2. Put entitlement behind a server-owned Finance access policy

Reuse the existing module and role definitions, but add one Finance policy that resolves entitlement source and state into active, servicing-only or locked access. Apply it at the service boundary for every API, document, export, direct URL and job. Keep explicit payer-account grants separate from child/guardian relationships. Check current grant and entitlement for each read, download and new checkout. Continue durable evidence processing for a genuine in-flight payment after access is revoked.

**Reason:** Existing module capability resolution expresses active module access; it does not describe servicing access after cancellation. UI route hiding cannot enforce the financial boundary.

### 3. Make the ledger authoritative and append-only

Use integer GBP minor units. Freeze issued invoice and tax snapshots. Record receipts, allocations, credits, reversals, refunds and returns as traceable entries. Derive invoice and account balances from this source. Separate processing attempts, confirmed receipts, unapplied amounts, provider fees and payouts. Enforce allocation invariants transactionally under concurrency.

**Reason:** A mutable status field cannot represent duplicate, partial, combined, returned and excess money safely.

### 4. Freeze statement projections by ledger cutoff

Create on-demand statements and monthly snapshots for accounts with activity or an open balance. Record period, generation timestamp, ledger cutoff, projection version and digest. A statement is immutable; late events appear as adjustments in the next statement. Store the document privately and reauthorize its download at request time with private, no-store response semantics.

**Reason:** Statements are financial artifacts and must remain reproducible without suppressing later corrections.

### 5. Reuse the existing hosting, DB and UI foundations

Prefer existing NestJS, Prisma/Postgres RLS, transactional/outbox work, private Supabase storage, admin components and mobile tokens. Verify every schema and worker path against current conventions before adding dependencies or infrastructure. No new runtime dependency is justified by T01.

**Reason:** These seams exist and support the modular-monolith boundary. The final data model, queue guarantee and private download implementation remain subject to T02/T08/T11 proof.

### 6. Gate commercial billing and provider methods independently

Finance stays unavailable without an active entitlement. The catalogue price remains Proposed, so no new standalone checkout price is created. Eligible plan/bundle entitlements grant access once with no duplicate add-on item. Use school-scoped direct charges only after sandbox proof; no application fee or shared collection account. Do not launch Bacs until the exact direct-charge method path passes delayed-payment, returns and reconciliation tests.

**Reason:** A payment architecture decision is not commercial approval or proof of provider capability.

### 7. Design for calm hierarchy and clear financial feedback

Reuse NexSteps typography, colors, semantic tokens and shared controls. Place amount, due date, school identity and next action before decorative summary elements. Clearly distinguish processing from confirmed, keep upgrade messaging out of family screens, and design empty, error, conflict, revocation, disabled and success states. Support keyboard, assistive technology, narrow layouts, 200% text, light/dark appearance and reduced motion. Avoid Apple branding and ornamental glass treatments.

**Reason:** Financial actions require confidence, clarity and recovery; premium quality should come from precision and restraint.

## Consequences and unresolved evidence

- T02 must verify the canonical tenant/organisation/legal-entity relationships, numbering scope, RLS policy patterns, transaction isolation and indexes against real schema.
- T03 must define the exact permission matrix, approval separation, payer grant lifecycle and whether servicing entitlement is time-bounded.
- T07 sandbox access is unavailable at T01. Direct-charge integration stays blocked until the compatibility evidence in provider-compatibility.md exists.
- Direct-charge Bacs capability is unresolved. Do not pick a replacement payment architecture in code.
- T11 must confirm the current renderer and private object delivery mechanics and prove digest/cutoff reproducibility.
- Finance legal/tax document content, retention period and month-end cutoff rules need owner sign-off before the first issued invoice or statement.
