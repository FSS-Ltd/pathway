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
| `AI_WORKSPACE` | AI Workspace | Drafting, summaries and admin assistance | £15 base | £150 base | Proposed — define included users and fair use first |
| `ADVANCED_REPORTING` | Advanced Reporting | Cross-platform analytics, trends and exports | £10 | £100 | Proposed |
| `LEARNING` | Learning | Learning logs, evidence and progress reports | £19 | £190 | Proposed |

## Module bundle

| Code | Bundle | Included selection | Monthly price | Annual price | Status |
| --- | --- | --- | ---: | ---: | --- |
| `OPERATIONS_BUNDLE` | Operations bundle | Any four eligible operations modules | £39 | £390 | Proposed |

Eligible operations modules are Finance, Events, Transport, Meals, Asset
Management, HR, and Advanced Reporting. Learning is excluded because it is a
specialist evidence-and-reporting product. AI Workspace is excluded because its
cost must be controlled through named-user and fair-use limits.

The customer selects up to four eligible modules when purchasing the bundle.
Plan-included modules do not consume a bundle selection and must never be
charged again. The bundle is optional; customers can still buy an individual
module where that is cheaper or better fits their needs.

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

## Implementation checklist

For each approved item:

1. Create one Stripe Product and monthly/yearly recurring Prices.
2. Add the production and test Stripe Price IDs to the price map.
3. Update checkout allow-lists, public pricing fallbacks, configurator copy,
   and tests from this catalogue.
4. Confirm included-plan modules cannot be selected or charged separately.
5. Validate a Stripe Checkout session using both monthly and yearly intervals.
6. Update this document if a commercial decision changes before release.

## Decision log

| Date | Decision | Owner |
| --- | --- | --- |
| 2026-07-25 | Storage monthly prices set to £1.49 / £2.49 / £5.99 for 100GB / 200GB / 1TB. Annual prices remain unconfirmed. | Product owner |
| 2026-07-25 | Learning launch recommendation changed from £29/month to £19/month, pending commercial approval. | Product / Commercial |
| 2026-07-25 | Operations bundle proposed: select any four eligible operations modules for £39/month or £390/year; Learning and AI Workspace excluded. | Product / Commercial |
