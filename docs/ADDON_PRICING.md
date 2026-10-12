# Add-on pricing catalogue

**Status:** product source of truth

This document defines the commercial catalogue for Pathway add-ons. When an
add-on is built, its Stripe Product, Stripe Prices, UI copy, checkout price
code, and entitlement rules must agree with this document.

Prices marked **Approved** may be implemented. Prices marked **Proposed** are
research-backed launch recommendations and need commercial approval before a
Stripe Price is created. Do not infer a price from code, a test fixture, or an
older pricing document.

## Pricing rules

- Prices are per organisation, unless a row explicitly says otherwise.
- Monthly and annual prices must be recurring Stripe Prices.
- Annual pricing should normally equal ten months of the monthly price (two
  months free). Any exception must be documented in the relevant row.
- The checkout and marketing site must state whether prices include or exclude
  VAT, consistently.
- A module included in a plan must not also be charged as an add-on.
- AI Workspace must have a published fair-use allowance; it must not be sold as
  unlimited AI usage at a fixed organisation price.

## Storage add-ons

These are the official monthly storage prices supplied by the product owner.
They replace all older storage-price figures in implementation notes, UI
fallbacks, tests, and Stripe configuration.

| Code | Storage | Monthly price | Annual price | Status | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| `STORAGE_100GB` | 100GB | £1.49 | To be confirmed | **Approved monthly** | |
| `STORAGE_200GB` | 200GB | £2.49 | To be confirmed | **Approved monthly** | |
| `STORAGE_1TB` | 1TB | £5.99 | To be confirmed | **Approved monthly** | |

The current product code uses 200GB. Any historical reference to a 500GB tier
is obsolete unless this catalogue is deliberately amended.

## Business modules

The modules below are the planned purchasable modules. The initial prices are
recommendations based on the July 2026 market review and the current feature
descriptions; they are not approved Stripe prices yet.

| Code | Module | Current scope | Recommended monthly | Recommended annual | Status |
| --- | --- | --- | ---: | ---: | --- |
| `FINANCE` | Finance | Invoices, payments and financial reporting | £15 | £150 | Proposed |
| `EVENTS` | Events | Services, sessions and event sign-ups | £9 | £90 | Proposed |
| `TRANSPORT` | Transport | Routes, vehicles and passenger lists | £15 | £150 | Proposed |
| `MEALS` | Meals | Menus, dietary needs and meal counts | £12 | £120 | Proposed |
| `ASSET_MANAGEMENT` | Asset Management | Equipment and resource tracking | £9 | £90 | Proposed |
| `HR` | HR | Staff records, roles and onboarding | £15 | £150 | Proposed |
| `CLUBS` | Clubs | Club sign-ups, rosters, sessions, attendance, notices, and scoped club leads | £12 | £120 | Proposed; included for the Clubs sector |
| `AI_WORKSPACE` | AI Workspace | Drafting, summaries and admin assistance | £15 base | £150 base | Proposed — define included users and fair use first |
| `ADVANCED_REPORTING` | Advanced Reporting | Cross-platform analytics, trends and exports | £10 | £100 | Proposed |
| `LEARNING` | Learning | Learning logs, evidence and progress reports | £19 | £190 | Proposed |

## ACE-originated add-ons

The ACE build plan is the initial reference implementation for these products.
Clubs is a reusable, global module and is included in the Clubs sector. Child
Merit Market remains ACE-only. Both must use the existing module entitlement
engine.

| Code | Module | Current scope | Recommended monthly | Recommended annual | Status |
| --- | --- | --- | ---: | ---: | --- |
| `CHILD_MERIT_MARKET` | Child Merit Market | Wallet/ledger, savings, giving/tithe, Merit Shop, simulated investments, and positive leaderboards | £19 | £190 | Proposed — confirm market-data licence cost before launch |

PACE progress, behaviour capture, homework and evidence, Faith Corner, site-level
ACE reporting, and Student Community are ACE-core capabilities. They must not
be sold as separate add-ons. Advanced Reporting remains the paid route for
multi-site ACE analytics and benchmarking.

## Module bundle

| Code | Bundle | Included selection | Monthly price | Annual price | Status |
| --- | --- | --- | ---: | ---: | --- |
| `OPERATIONS_BUNDLE` | Operations bundle | Any four eligible operations modules | £39 | £390 | Proposed |
| `ALL_INCLUDED_BUNDLE` | All Included bundle | Every non-AI module, plus 1TB storage | £79 | £790 | Proposed |

Eligible operations modules are Finance, Events, Transport, Meals, Asset
Management, HR, Clubs, and Advanced Reporting. Learning is excluded because it
is a specialist evidence-and-reporting product. AI Workspace is excluded
because its cost must be controlled through named-user and fair-use limits.

The customer selects up to four eligible modules when purchasing the bundle.
Plan-included modules do not consume a bundle selection and must never be
charged again. The bundle is optional; customers can still buy an individual
module where that is cheaper or better fits their needs.

### All Included bundle

The All Included bundle activates Finance, Events, Transport, Meals, Asset
Management, HR, Advanced Reporting, Learning, Clubs, and Child Merit Market.
It also grants one 1TB storage entitlement; the 100GB and 200GB storage packs
must not be added or stacked alongside it.

AI Workspace is deliberately excluded. It will receive its own future billing
model based on named users and/or metered usage, with an explicit fair-use
allowance. It must not be bundled at a fixed organisation price.

Child Merit Market is ACE-only. For non-ACE organisations the All Included
bundle grants every applicable non-AI module, including Clubs, but does not
expose the inapplicable Merit Market destination. The checkout must show this
clearly.

### Learning module decision

Launch Learning at **£19/month or £190/year**, rather than £29/month. This is
the appropriate entry point for the current scope: activity logging, evidence
attachments, and generated progress reports.

Review the price when the module includes broader learning-journal capabilities
such as family engagement, curriculum/framework tracking, unlimited media, or
larger learner capacity. A higher-capacity Learning tier may then be priced at
£29/month or above.

Learning should include 50GB of storage so that customers do not encounter an
immediate second add-on charge when attaching evidence.

## Plan inclusions

These inclusion rules apply before optional-module charges are calculated.

| Plan | Included modules |
| --- | --- |
| Starter | None |
| Growth | Finance, Events, Advanced Reporting |
| Professional | Finance, Events, Advanced Reporting, HR, Asset Management, AI Workspace |
| Enterprise | Commercial agreement |

## Vertical inclusions

| Vertical | Included module | Rule |
| --- | --- | --- |
| Clubs | Clubs | Included as a built-in sector capability; it is not separately charged. |

## Implementation checklist

For each approved item:

1. Create one Stripe Product and monthly/yearly recurring Prices.
2. Add the production and test Stripe Price IDs to the price map.
3. Update checkout allow-lists, public pricing fallbacks, configurator copy,
   and tests from this catalogue.
4. Confirm included-plan modules cannot be selected or charged separately.
5. For bundles, grant every listed entitlement once and block duplicate module
   or storage charges.
6. Validate a Stripe Checkout session using both monthly and yearly intervals.
7. Update this document if a commercial decision changes before release.

## Decision log

| Date | Decision | Owner |
| --- | --- | --- |
| 2026-07-25 | Storage monthly prices set to £1.49 / £2.49 / £5.99 for 100GB / 200GB / 1TB. Annual prices remain unconfirmed. | Product owner |
| 2026-07-25 | Learning launch recommendation changed from £29/month to £19/month, pending commercial approval. | Product / Commercial |
| 2026-07-25 | Operations bundle proposed: select any four eligible operations modules for £39/month or £390/year; Learning and AI Workspace excluded. | Product / Commercial |
| 2026-07-25 | ACE-originated pricing proposed: global Clubs at £12/month (included for the Clubs sector) and ACE-only Child Merit Market at £19/month. | Product / Commercial |
| 2026-07-25 | All Included bundle proposed: every non-AI module plus 1TB storage for £79/month or £790/year. | Product / Commercial |
