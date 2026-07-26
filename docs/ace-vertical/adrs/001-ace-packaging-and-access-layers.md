# ADR 001: ACE Packaging and Access Layers

**Status:** Proposed implementation source lock. Substantive approval remains open in section 22 of the ACE build plan.

**Owner:** Jean-Fidele Ntagengwa (Product & Engineering)

**Date:** 26 July 2026

**Related:** `docs/ace-vertical/01-source-and-access-matrix.md`, `docs/NexSteps-ACE-Vertical-Build-Plan.md`, `docs/ADDON_PRICING.md`

## Context

ACE extends the existing NexSteps modular monolith. It must reuse organisation/site tenancy, the vertical/module entitlement engine, Auth0 request context, typed guards, private storage, audit/outbox patterns, and PostgreSQL RLS. It must not import Oasis authentication, fixed roles, single-centre tenancy, or route conventions.

Commercial enablement and actor authorisation answer different questions. A paid or vertically included capability does not grant a person access. A role permission does not activate a product. Neither can bypass a guardian/student relationship, a domain assignment, a release state, or tenant isolation.

The governing sources define 68 exact routes in sections 8.2 through 8.4. Section 8.5 names four add-on operation families without defining methods or paths. ACE-F01 must lock what is known without inventing the unresolved contracts.

## Decision

### 1. Preserve the existing commercial source

`OrgVertical` and active, unexpired `OrgModule` records remain the sole commercial inputs. The existing capability resolver is extended rather than duplicated. Missing, inactive, expired, inapplicable, or commercially unapproved entitlements fail closed.

ACE core includes PACE, behaviour, homework/evidence, Faith Corner, site reporting, trips and permission slips, and organisation-toggleable Student Community. Attendance, mobile, messaging, safeguarding, configurable roles, and typed permissions are platform core.

Finance, Clubs, Child Merit Market, and Advanced Reporting remain separate entitlements:

| Product | Price | Status | Packaging |
| --- | --- | --- | --- |
| Clubs | £12/month or £120/year | Proposed | Global; included for `Vertical.CLUB`; Operations and All Included eligible |
| Child Merit Market | £19/month or £190/year | Proposed | ACE-only; All Included applies only to ACE organisations; licensing gate remains |
| Finance | £15/month or £150/year | Proposed | Included in Growth and Professional; Operations and All Included eligible |
| Advanced Reporting | £10/month or £100/year | Proposed | Included in Growth and Professional; Operations and All Included eligible |

No Stripe Product or Price may be created from a Proposed row. Included modules must never be charged again.

### 2. Enforce independent fail-closed layers

Every protected request uses this formula exactly:

```text
authenticated
AND active org/site membership
AND active organisation capability
AND effective typed permission
AND included feature enabled, when applicable
AND relationship/domain assignment
AND release/visibility policy
AND tenant/RLS policy
```

The layers have separate inputs and denial reasons:

| Layer | Source | Must not become |
| --- | --- | --- |
| Authentication | Auth0/session and trusted request identity | a role, entitlement, or tenant selector |
| Active membership | active organisation/site context | proof of a record relationship |
| Commercial capability | `OrgVertical` plus active `OrgModule` records | a role label or feature toggle |
| Typed permission | compile-time registry plus effective role assignments | a customer-created executable string |
| Included feature | `OrgFeatureSetting` for included optional features | a paid entitlement |
| Relationship/domain assignment | guardian-child, StudentIdentity, active-site record scope, derived Community membership, or scoped lead assignment | a broad role permission |
| Release/visibility | published/frozen, audience, revocation, field-visibility, and moderation policy | a UI-only check |
| Tenant/RLS | trusted org/site context, scoped queries, forced RLS, and strict assertions | a route parameter or application filter alone |

Each denial is safe and avoids exposing capability, permission, record, child, or tenant details.

### 3. Resolve active membership consistently

An organisation head with an active organisation membership may select any site belonging to that organisation. The server validates the selection and publishes the trusted organisation/site context.

A site-scoped role remains valid only while its site assignment is active for the selected site. Organisation membership does not manufacture a site assignment. Site switches invalidate or reload access-aware state.

### 4. Keep permission keys platform-owned

Capability and permission keys are compile-time registry literals. Database permission definitions are a searchable metadata mirror, not an executable authority source. Display names, labels, fixed role names, navigation items, and route strings never decide access.

Organisation heads may create role definitions from active, delegable keys they hold. They cannot create keys, activate a vertical/module, grant protected ownership/support/entitlement administration, bypass relationships, remove the final active organisation head, or lock themselves out in the same request.

Existing fixed-role decisions remain a shadow/rollback compatibility path only until the route-by-route `ACE-F14` cutover.

### 5. Treat Community as an included feature, not a module

`ace.student_community` is an included organisation/site feature setting beneath the ACE entitlement. Its content routes fail closed when the setting is absent or disabled. The setting read/write routes remain reachable to authorised administrators while disabled so the feature can be managed.

No other exact route in sections 8.2 through 8.4 uses an included-feature toggle.

### 6. Apply the sensitivity policy

- `protected` covers access administration, overrides, publication, and moderation.
- `sensitive` covers child, family, consent, private-report, private-reflection, and student-authored Community data.
- `standard` covers ordinary operational content.

Sensitivity is metadata for delegability, step-up, audit, warning, and redaction. It never replaces relationship, release, or tenant enforcement.

Corrections are `sensitive`; an override is `protected`. Report approval is `sensitive`; publication is `protected`. Permission-slip management is `sensitive`; publication is `protected`. Identity-linked Faith read receipts are `sensitive`. Student-authored Community content is `sensitive`. Ordinary space creation uses the separate standard `ace.community.spaces.manage` permission; moderation retains the protected `ace.community.moderate` permission.

### 7. Lock exact routes and leave add-on contracts open

The route matrix is the execution contract for the 68 literal method/path pairs in source sections 8.2 through 8.4. The Faith reflection path is corrected to `/ace/faith/content/:id/reflections`.

The Clubs, Child Merit Market, Finance, and Advanced Reporting operation families remain unresolved API contracts. Jean-Fidele Ntagengwa (Product & Engineering) owns each method/path decision. The relevant controller PRs cannot begin until an exact route contract is approved. No convention from current code or Oasis may fill that gap implicitly.

### 8. Keep unsupported add-on entitlements inactive

The current `Module` enum contains Finance and Advanced Reporting but has no
Clubs or Child Merit Market values. ACE-F01 does not choose silently between an
`ACE-F02` registry change and a separate commercial prerequisite. Jean-Fidele
Ntagengwa (Product & Engineering) owns that placement decision. It blocks the
relevant `ACE-F02` mapping and must be resolved by `ACE-CLB01` and `ACE-MER01`
before either entitlement becomes active. Missing enum/registry support fails
closed.

## Open approval gates

Authoring this ADR does not close the build plan's section 22 decisions. The detailed matrix and this ADR remain approval candidates owned by Jean-Fidele Ntagengwa (Product & Engineering).

The same owner is accountable for student identity, PACE corrections, Finance V1 scope, and web/mobile release parity. The Technical Agent owns the RLS blockers. Jean-Fidele Ntagengwa with Legal/Commercial review owns residency and market-data licensing. Jean-Fidele Ntagengwa with Delivery owns pilot/UAT capacity.

The matrix records the blocking PRs and release gates for every open decision.

## Consequences

- Later ACE work has a single route-level source for capability, permission, persona, membership, relationship, release, feature, sensitivity, and RLS rules.
- A custom role cannot enable a paid product or widen a record relationship.
- Parent, guardian, and student routes require server-derived relationships after permission checks.
- Organisation-head cross-site selection and site-assignment semantics become consistent across authentication paths.
- Add-on controller work pauses at its route-contract gate instead of inventing an API.
- The public Faith route uses the corrected spelling before implementation, avoiding a compatibility burden.
- Navigation and UI checks remain advisory; the server and RLS remain authoritative.

## Alternatives rejected

- **One combined entitlement/role check:** rejected because it lets commercial packaging and actor delegation change each other.
- **Feature toggles as modules:** rejected because Student Community is included ACE functionality, not a separate charge.
- **Role names as authority:** rejected because configurable names are presentation and cannot represent relationship or release policy.
- **Application filters without forced RLS:** rejected because a missed filter becomes a tenant-boundary failure.
- **Invent section 8.5 methods and paths now:** rejected because the governing source provides operation families only.
- **Preserve the source misspelling:** rejected because the approved public contract corrects the spelling before release.

## Rollback

Revert the ACE-F01 documentation commit. No runtime, schema, billing, or production behaviour changes in this ADR.
