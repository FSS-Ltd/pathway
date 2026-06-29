# CEE Connect Vertical - Architecture Package

Owner: Faithful Software Solutions (FSS) / NexSteps
Status: Design (docs only, no production code)
Base platform: `pathway` monorepo (NexSteps core)
Last updated: 2026-06-28

This folder holds the developer-ready architecture for the **CEE Connect** enterprise vertical: a connected, multi-tenant education operating platform for Christian Education Europe (CEE), built on top of the existing NexSteps core in this repository.

It is the response to the brief at
`The Nexus/06 Businesses/Faithful Software Solutions/CEE/cee-connect-context-decisions-brief.md`
and is grounded in the actual code in this repo (Prisma schema, NestJS API modules, billing/entitlements engine), not a greenfield design.

It also contains a dedicated design for an **internal NexSteps staff billing and cost-to-serve tracking** subsystem (`06-internal-staff-billing.md`), which is separate from the customer-facing subscription billing already in the platform.

---

## How to read this package

| # | Document | What it answers |
|---|----------|-----------------|
| - | `README.md` (this file) | Navigation, scope, assumptions, decision log |
| 01 | `01-architecture-overview.md` | The vision, the product surfaces, why we build on NexSteps, the reuse map, target architecture |
| 02 | `02-multi-tenancy-and-scalability.md` | Network → Org → Site model, tenant typing, Postgres RLS, and the "scalable from day one" engineering plan |
| 03 | `03-domain-model.md` | Schema deltas against `packages/db/prisma/schema.prisma`, new TEACH entities, migration strategy |
| 04 | `04-rbac-trust-zones-compliance.md` | Roles, ABAC policy, trust zones, GDPR / UK DPA, data residency, DSAR, retention, safeguarding |
| 05 | `05-api-and-module-map.md` | NestJS module map (reuse vs extend vs new), app surfaces, API boundaries |
| 06 | `06-internal-staff-billing.md` | **NexSteps internal staff billing, time tracking, cost-to-serve, and margin** (the explicit new requirement) |
| 07 | `07-delivery-roadmap-and-decisions.md` | Phased delivery, acceptance criteria, success metrics, failure modes, open decisions |

`diagrams/` holds source for the figures referenced across the documents.

---

## Scope

In scope:

- Target architecture for evolving the NexSteps core into the CEE Connect ecosystem.
- A multi-tenant, multi-surface model covering CEE Connect for Schools, Family Hub, TEACH Hub, and CEE Central.
- A scalability plan that holds from the first deployment.
- An internal NexSteps staff billing / cost-to-serve / margin tracking subsystem.
- Compliance, security, and data-protection design for children's data.
- A phased delivery roadmap with acceptance criteria and a risk register.

Out of scope (for this package):

- Writing production code. This is documentation only.
- Pricing the commercial engagement (covered by the research and pricing files in the CEE vault folder).
- The pitch deck (covered by the marketing instruction in the brief).

---

## Core assumptions

1. **CEE = Christian Education Europe Limited** (company 03078881), a small, solvent, price-sensitive education business serving roughly 11 to 27 UK ACE schools, 30+ European schools, and the TEACH home-education arm (500+ families, 1,000+ children). Source: `cee-research.md`, `deep-research-report.md`.
2. **The platform is sold centrally to CEE, adopted per school**, with each school as its own billing and data-isolation boundary, and CEE receiving aggregate oversight through CEE Central. Source: brief section 4.
3. **The build reuses the NexSteps core** in this repo rather than the lighter Oasis tRPC variant. The two codebases were both reviewed; the rationale is in `01-architecture-overview.md`.
4. **"Internal staff billing" means tracking NexSteps' own delivery and support staff** (time, cost, margin per client and engagement). Confirmed as the full cost-to-serve scope (2026-06-28). This is distinct from the existing Stripe/GoCardless subscription billing, which the subsystem only reads to compute margin. Specified in `06-internal-staff-billing.md`.
5. **UK / EU data residency is mandatory** because the system holds children's and safeguarding-adjacent data. Primary region is London (or EU equivalent).

Anything depending on these is flagged in `07-delivery-roadmap-and-decisions.md` under "Open decisions".

---

## Decision log

| # | Decision | Choice | Where |
|---|----------|--------|-------|
| D1 | Build base | Reuse NexSteps core (`pathway`), harvest invoicing ideas from Oasis | 01 |
| D2 | Tenancy hierarchy | Add a `Network` layer above `Org`; each School = one Org (billing) with one or more Sites (`Tenant`) | 02 |
| D3 | Tenant typing | Add `orgType` / `tenantType` discriminators (SCHOOL, TEACH_HOUSEHOLD, CEE_CENTRAL, PROGRAMME, INTERNAL) | 02, 03 |
| D4 | Isolation model | Shared DB, shared schema, `tenantId` on every tenant-owned row, **Postgres RLS from day one**, plus application guards | 02 |
| D5 | Product surfaces | One API, surface-aware modules; start surfaces as route groups + shared UI, fork to separate apps only on real divergence | 01, 05 |
| D6 | CEE Central access | Aggregate views by default; child-level access only with explicit, logged, legal-basis-gated grants | 04 |
| D7 | Internal staff billing | Full cost-to-serve subsystem (confirmed), platform-scoped, isolated from tenant data, Platform Admin only | 06 |
| D8 | Scale tactics | Stateless API, read replicas, table partitioning, Redis cache, BullMQ workers, object storage, CDN, per-tenant usage metering | 02 |

---

## Source material reviewed

- `cee-connect-context-decisions-brief.md` - product naming, tenant strategy, architecture direction.
- `cee-research.md` - commercial intelligence on CEE scale and budget.
- `deep-research-report.md` - financial capacity, Option A vs Option B, recommended phased MVP.
- `oasis_cee_pricing_models.pdf` - partnership pricing models for CEE schools and TEACH (ReportLab-generated; pricing summarised in the research report).
- `pathway` repo (this codebase) - NestJS API, Prisma schema, billing/entitlements engine, admin/web/mobile/workers apps.
- `oasis-portal.zip` - lighter tRPC variant with `invoices`, `students`, `incidents` modules; reviewed for reuse.
