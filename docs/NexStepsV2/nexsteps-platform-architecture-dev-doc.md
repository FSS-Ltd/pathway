# NexSteps platform architecture: verticals, capabilities, modules

**Status:** Proposed, ready for implementation planning
**Owner:** Jean-Fidele Ntagengwa (Product & Engineering)
**Version:** 1.1
**Prepared for:** Claude Code implementation planning
**Date:** 16 July 2026

---

## How to use this document

This is a dev doc, not a finished spec. Hand it to Claude Code to produce an implementation plan against the current NexSteps monorepo. Sections marked **Decision needed** are places where the architecture is directional but the exact implementation choice is still open. Read the codebase first, then propose an approach before writing code. Everything else is intended as the target design.

---

## 1. Vision

NexSteps is not a single product. It's a platform capable of serving multiple sectors from one codebase.

Instead of building separate applications for churches, schools, charities, and clubs, every organisation runs on the same platform but experiences a version tailored to its operational needs.

Four layers, top to bottom:

```
Core Platform
      │
      ▼
Vertical
      │
      ▼
Capabilities
      │
      ▼
Modules
```

The Capabilities layer is new versus the original proposal and is internal only, never exposed to customers. Verticals and Modules both grant capabilities. Every permission check, navigation decision, and API authorization check reads from capabilities, not from vertical or module identity directly. This keeps one source of truth as the platform grows and avoids special-case logic per sector.

---

## 2. Product philosophy

The Core Platform contains everything every organisation needs. A Vertical determines how the core platform is presented. Capabilities are the atomic units of what a user or organisation can do. Modules extend the platform with optional business capabilities that customers purchase individually.

Feature flags remain an internal engineering tool for rollout and experimentation. They are never used for customer licensing or entitlement. Entitlement is decided by vertical and module grants, resolved into capabilities.

---

## 3. Current state (read before planning)

Before writing any implementation plan, confirm these against the actual repo, since this doc is written from product context and may not reflect the latest code:

- Monorepo with packages including `@pathway/db` (Prisma client, schema, migrations), `@pathway/api`, `@pathway/web`, `@pathway/types`. Naming reflects NexSteps's former name, PathWay. Confirm whether these have been renamed to `@nexsteps/*` or are still `@pathway/*`.
- TypeScript throughout, strict mode expected.
- Jest for unit and e2e tests. `.env.test` holds the test DB URL, never `.env`.
- Existing navigation, permission checks, and sector-specific logic are presumably hardcoded or flag-based today. Audit these before migration (see Section 12).

**Decision needed:** confirm current package names and whether a rename to `@nexsteps/*` is in scope for this initiative or a separate piece of work.

---

## 4. Platform layers

### Layer 1: Core Platform

Every organisation receives the same core functionality, included with every subscription:

- Authentication
- Organisations
- Users
- Roles & permissions
- Attendance
- People
- Families
- Parent portal
- Mobile apps
- Calendar
- Communication
- Tasks
- Reporting
- Documents
- Notifications
- Audit logs
- Safeguarding

Safeguarding is part of the platform and is never sold as an add-on. This is a hard rule, not a pricing decision to revisit later.

### Layer 2: Vertical

A Vertical configures the application for a particular sector. It controls:

- Navigation
- Dashboard widgets
- Terminology
- Default permissions
- Default workflows
- Enabled core capabilities

Initial verticals:

```
Church
Independent School
ACE School
State School
Nursery
Charity
Club
```

Every organisation has exactly one vertical. Changing a vertical changes the experience, not the billing.

### Layer 3: Capabilities (internal)

Capabilities are granular permission strings that verticals and modules grant. Examples:

```
attendance.read
attendance.manage
finance.invoices
events.booking
transport.routes
```

Capabilities are the single interface that navigation, API guards, and the permission system read from. Nothing downstream should ask "is this org a Church?" or "does this org have the Finance module?" directly. It should ask "does this org have `finance.invoices`?"

**Decision needed:** capability grants can be modelled two ways. Recommend evaluating both with the engineering context of the actual codebase:

1. **Config-driven** (recommended default): a static TypeScript map of `Vertical -> Capability[]` and `Module -> Capability[]`, versioned in code, deployed like any other logic. Fast, type-safe, no extra DB round trip, and changes ship through normal code review. Downside: changing what a vertical or module grants requires a deploy.
2. **DB-driven**: capability grants stored in tables (`VerticalCapability`, `ModuleCapability`), editable at runtime. Adds admin tooling overhead and a new failure mode (capability drift between environments) for a flexibility NexSteps likely doesn't need yet, since verticals and modules are curated by the NexSteps team, not customer-defined.

Recommendation: start config-driven. It matches "one source of truth, no runtime special-casing" and can migrate to DB-driven later without changing the consuming interface, since `organisationHasCapability()` doesn't care where the mapping lives.

### Layer 4: Modules

Modules are optional commercial products that customers purchase individually. Initial module catalogue:

- Finance
- Events
- Transport
- Meals
- Asset Management
- HR
- AI Workspace
- Advanced Reporting

Future modules plug into the same architecture without new application code, only a new entry in the module-to-capability map plus the module's own feature implementation.

---

## 5. Pricing model

### Core plans

| Plan | Price | Active staff and volunteers (previous 30 days) |
|---|---|---|
| Starter | £49/month | 50 |
| Growth | £99/month | 100 |
| Professional | £149/month | 200 |
| Enterprise | Custom | Unlimited, dedicated support, custom SLA |

Storage is the only usage-based add-on. Staff and volunteer allowances count unique users with qualifying activity during the previous 30 days. No SMS bundles or staff allowance add-on packs.

### Purchase journey

Replace pricing cards with a guided configuration flow:

1. **Organisation type.** School, Church, Charity, Club, Nursery.
2. **Vertical.** E.g. School narrows to ACE School, Independent School, State School, Nursery.
3. **What's included.** Show every included core capability for the chosen vertical.
4. **Optional modules.** Checkbox list, each showing description, monthly price, and included features.
5. **Core plan.** Starter, Growth, Professional, Enterprise, with the active staff and volunteer allowance shown.
6. **Summary.** Vertical, plan, included capabilities, selected modules, storage, monthly total. Proceeds to Stripe Checkout.

### Stripe product structure

Each purchasable item is a Stripe Product: the four core plans, each business module, and storage tiers (100GB, 500GB, 1TB). The Vertical is not a Stripe Product; it carries no direct price and is set during onboarding, not checkout.

---

## 6. Data model

Extend the existing Prisma schema (in `@pathway/db` or its renamed equivalent) with:

```prisma
model OrganisationVertical {
  id             String   @id @default(cuid())
  organisationId String   @unique
  vertical       Vertical
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model OrganisationModule {
  id             String       @id @default(cuid())
  organisationId String
  module         Module
  status         ModuleStatus
  activatedAt    DateTime?
  expiresAt      DateTime?
  metadata        Json?

  @@unique([organisationId, module])
}

enum Vertical {
  CHURCH
  INDEPENDENT_SCHOOL
  ACE_SCHOOL
  STATE_SCHOOL
  NURSERY
  CHARITY
  CLUB
}

enum Module {
  FINANCE
  EVENTS
  TRANSPORT
  MEALS
  ASSET_MANAGEMENT
  HR
  AI_WORKSPACE
  ADVANCED_REPORTING
}

enum ModuleStatus {
  ACTIVE
  EXPIRED
  CANCELLED
}
```

`OrganisationVertical` is one-to-one with an organisation (hence `@unique` on `organisationId`). `OrganisationModule` is one-to-many.

No new table is needed for capabilities if the config-driven approach is chosen (Section 4, Layer 3). If DB-driven capability grants are chosen instead, add `VerticalCapability` and `ModuleCapability` join tables here.

---

## 7. Resolution helpers

Introduce a `packages/platform` package as the single source of truth for resolving vertical, capabilities, module access, navigation, and billing state. Every application (`api`, `admin`, `mobile`, `web`) consumes this package rather than querying the DB or checking sector logic directly.

```typescript
// packages/platform/src/vertical.ts
function getOrganisationVertical(orgId: string): Promise<Vertical>

// packages/platform/src/modules.ts
function organisationHasModule(orgId: string, module: Module): Promise<boolean>

// packages/platform/src/capabilities.ts
function getOrganisationCapabilities(orgId: string): Promise<Capability[]>
function organisationHasCapability(orgId: string, capability: Capability): Promise<boolean>
```

`getOrganisationCapabilities` computes the union of capabilities granted by the organisation's vertical and any active (status `ACTIVE`, not expired) modules. This is the function that navigation, API guards, and the permission system should call, not `getOrganisationVertical` or `organisationHasModule` directly, except where the vertical or module identity itself is genuinely what's needed (e.g. displaying "Your vertical: ACE School" in settings).

Consumers:

- Admin navigation
- API route guards
- Mobile navigation
- Dashboard widget resolution
- Workflow engine
- Permission resolution
- Sidebar feature components

---

## 8. Navigation

Navigation is computed, not hardcoded per sector. It reads from resolved capabilities.

Example, Church:

```
Dashboard
Attendance
Volunteers
Giving
Calendar
```

Example, ACE School:

```
Dashboard
Students
Classes
PACE
Attendance
Parents
Reports
```

If the Finance module is installed, a `Finance` entry appears automatically for any vertical, because the module grants `finance.*` capabilities and the navigation resolver checks for those capabilities, not for a hardcoded "has Finance module" branch.

---

## 9. Admin settings

Organisation Settings gains two sections.

**Vertical**: current vertical, change vertical, preview included capabilities for a candidate vertical before switching.

**Modules**: every available module, with status, purchase date, expiry, billing source, and a toggle. The toggle only functions in non-production environments for testing; in production, module state changes only through the billing flow (Section 10). This needs an explicit environment check in the admin UI, not just a hidden button, so it fails safely if someone tries to hit the endpoint directly in production.

---

## 10. Billing flow

```
Customer purchases module
      │
      ▼
Stripe Checkout
      │
      ▼
Webhook received
      │
      ▼
OrganisationModule created/updated
      │
      ▼
Cache refreshed
      │
      ▼
Navigation rebuilt
      │
      ▼
Permissions updated
      │
      ▼
Module immediately available
```

The webhook handler is the only production path that writes to `OrganisationModule`. Treat it as a critical-path integration: idempotent handling of duplicate webhook deliveries, signature verification, and a dead-letter or retry path for failed writes are all in scope, not optional hardening for later.

---

## 11. Folder structure

```
packages/
  platform/       (new) vertical, capability, module, navigation, billing resolution
  db/             existing Prisma client, schema, migrations
  api/            existing backend
  web/            existing frontend
  types/          existing shared types
apps/
  api/
  admin/
  mobile/
```

`packages/platform` depends on `packages/db` for reads but exposes only resolver functions upward. No application package should import Prisma models for vertical, module, or capability logic directly, everything goes through `packages/platform`.

---

## 12. Engineering rules

**Do:**
- Treat capabilities as the single source of truth for what an organisation can access.
- Resolve vertical, capability, and module state through `packages/platform`, never inline.
- Keep Core identical across every organisation regardless of vertical or modules.

**Don't:**
- Hardcode sector checks (`if (org.type === 'church')`) anywhere outside the vertical-to-capability map.
- Use feature flags for customer entitlement.
- Duplicate navigation trees per sector instead of computing from capabilities.
- Build a separate application per sector.

---

## 13. Testing approach

Follow the existing TDD discipline for NexSteps: write the failing test before the implementation, one concern per commit, `.env.test` for the test DB.

Minimum coverage expected before this ships:

- Unit tests for `getOrganisationVertical`, `organisationHasModule`, `getOrganisationCapabilities`, `organisationHasCapability`, including expired-module and no-vertical-set edge cases.
- Integration tests seeding an organisation with a vertical and a mix of active/expired modules, asserting the resolved capability set is correct.
- Webhook handler tests covering duplicate delivery, signature failure, and partial-write recovery.
- Navigation resolver tests per vertical, with and without modules installed, asserting the rendered nav tree matches expected capability-driven output.
- Migration tests verifying every existing organisation ends up with exactly one `OrganisationVertical` row after backfill (Section 14).

---

## 14. Migration plan

1. Audit existing hardcoded sector checks and feature-flag-based entitlement across `api`, `admin`, `mobile`, and `web`. Produce a list of every call site to replace.
2. Assign a default Vertical to every existing organisation (mapping rule needed, see open questions).
3. Create empty `OrganisationModule` rows reflecting current entitlements, so no customer loses access during cutover.
4. Build `packages/platform` and the capability map before touching any call site.
5. Replace feature-flag checks with capability checks, one call site at a time, each behind its own test.
6. Replace sector checks with capability checks.
7. Replace static navigation with capability-driven navigation.
8. Deploy behind a rollback path (keep old logic reachable via a kill switch until the new path is verified in production for at least one full billing cycle).

**Decision needed:** what determines the default vertical assignment for existing organisations? Likely candidates: existing `organisationType` field if one exists, or a manual mapping table maintained during rollout. Confirm against current schema before Phase 2.

---

## 15. Suggested phased build sequence

For Claude Code to plan against. Each phase should ship as its own set of PRs with tests, not one large change.

**Phase 0: Discovery**
Read the current schema, permission system, and navigation code. Confirm package names, existing entitlement logic, and organisation type field (if any). Produce a call-site inventory for Section 14, step 1.

**Phase 1: Data model**
Add `Vertical`, `Module`, `ModuleStatus` enums and `OrganisationVertical`, `OrganisationModule` models. Migration only, no consuming logic yet.

**Phase 2: packages/platform core**
Build the vertical-to-capability and module-to-capability config maps, and the four resolver functions (Section 7). Fully unit tested, not yet wired into any application.

**Phase 3: Backfill**
Write and run the migration script assigning default verticals and empty module rows to existing organisations. Verify with the migration tests from Section 13 before touching production data.

**Phase 4: Navigation and API guards**
Wire `packages/platform` into navigation resolution and API route guards, replacing hardcoded checks one call site at a time per the Phase 0 inventory.

**Phase 5: Admin settings**
Build the Vertical and Modules sections in Organisation Settings, including the non-production-only toggle.

**Phase 6: Billing integration**
Wire Stripe products for core plans, modules, and storage. Build the webhook handler with idempotency and retry handling.

**Phase 7: Purchase journey**
Build the six-step guided configuration flow (Section 5) replacing the current pricing page.

**Phase 8: Cutover**
Remove old feature-flag and sector-check logic once the new path has run in production for a full billing cycle with no regressions.

---

## 16. Success criteria

An organisation can:

- Choose a vertical during onboarding
- Change vertical later
- Purchase modules
- Upgrade plan
- Upgrade storage
- Have purchased modules unlock immediately after checkout
- See navigation that reflects its vertical
- See navigation that reflects its purchased modules
- Run on the same codebase as every other organisation, regardless of sector

---

## 17. Open questions for Claude Code to flag or resolve during planning

1. Current package names: `@pathway/*` or already renamed?
2. Does an `organisationType` or similar field already exist to drive default vertical assignment during backfill?
3. Config-driven vs DB-driven capability grants (Section 4, Layer 3), confirm the recommendation holds once the current permission system is reviewed.
4. What does the current permission/role system look like, and how does it intersect with capabilities? Capabilities gate *what exists*; roles likely still gate *who can use it*. These need a clear boundary.
5. Is there an existing Stripe integration to extend, or is this a new integration?
6. What's the cutover risk tolerance, i.e. how long should the rollback kill switch stay live after Phase 8 begins?

---

## 18. Long-term vision

This architecture lets NexSteps support new sectors and new commercial products without new applications.

Future verticals under consideration: Healthcare, Sports Clubs, Universities, Camps, Foster Care, Care Homes.

Future modules under consideration: CRM, Payroll, Facilities, Booking, Learning, Volunteer Marketplace, AI Agents, Analytics.

The platform grows by adding verticals, capabilities, and modules, not by creating new applications.
