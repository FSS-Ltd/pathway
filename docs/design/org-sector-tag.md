# Organisation sector tag

## Problem statement

Orgs had no sector classification. "Sector" existed only as marketing copy
(`apps/web/content/sectors.ts`, four static landing pages) and as a free-text field on the
unrelated `Lead` model. There was no way to know, at the product level, whether a given org
is a Church, Club, School, or Charity, and therefore no way to vary what an org sees based
on its sector.

## Architecture approach and key decisions

- **Capture at the one true org-creation point.** The org record is created lazily, inside
  the Stripe webhook handler (`createOrgFromPendingDetails` in
  `apps/api/src/billing/webhook.controller.ts`), after payment succeeds — not at form
  submit. Sector is captured on the buy-now form, carried through the deferred
  `PendingOrder.pendingOrgDetails` blob (already the mechanism for `orgName`/`contactEmail`/
  etc.), and written at that single creation point. This mirrors the existing field-threading
  pattern exactly — no new plumbing concept introduced.
- **Two org-creation paths, both updated for universality.** Public buy-now
  (`BuyNowOrgDetailsDto`) and the admin-driven `registerOrgDto` (used by
  `POST /orgs/register`) are separate provisioning paths; both now require `sector` so every
  org, regardless of entry point, has one. The authenticated `purchaseForOrg` path (upgrades
  an *existing* org) does not touch sector — there's no org to tag.
- **Nullable column, required inputs.** `Org.sector` is `OrgSector?` (nullable) so orgs
  created before this migration remain valid. Both creation DTOs require it going forward,
  so in practice every *new* org has a sector; only pre-existing orgs are null.
- **Mechanism now, rules later.** No sector currently hides or changes anything. A
  `apps/admin/lib/sector-visibility.ts` module exists as the intended integration point —
  it currently defines one placeholder feature key that's visible for every sector — mirroring
  the existing `Org.parentPortalEnabled` toggle pattern already used for conditional admin UI.
  Real per-sector visibility rules are a deliberate follow-up once product defines them.
- **No shared runtime package between web and API/admin.** `apps/web` and `apps/admin` don't
  currently depend on `@pathway/types` (checked before adding one) — each app defines its own
  local `Sector`/`SECTOR_LABELS`, matching the existing convention where `apps/admin/lib/api-client.ts`
  already hand-rolls API-shape types like `ApiOrg` rather than importing them. `@pathway/types`
  (used by `apps/api`) does export a canonical `Sector` type + `SECTOR_LABELS`/`SECTOR_OPTIONS`
  for backend reuse (`packages/types/src/sector.ts`).
- **Enum naming:** singular uppercase (`CHURCH`, `CLUB`, `SCHOOL`, `CHARITY`), matching the
  existing enum style in the schema (e.g. `OrgRole`). This is distinct from the marketing
  site's plural lowercase `SectorId` (`"churches" | "clubs" | ...` in
  `apps/web/content/sectors.ts`) — no bridge between the two was built since nothing
  currently needs to cross-reference them.

## Data model

- New enum `OrgSector { CHURCH CLUB SCHOOL CHARITY }` and `Org.sector OrgSector?`
  (`packages/db/prisma/schema.prisma`).
- Migration: `packages/db/prisma/migrations/20260714100000_add_org_sector/migration.sql`
  (hand-written — no reachable local Postgres at the time of writing; mirrors the exact
  `CREATE TYPE` + `ALTER TABLE ADD COLUMN` pattern used in
  `20260617090000_add_parent_portal_toggle`).

## Failure modes and resilience

- `createOrgFromPendingDetails` validates `details.sector` against the enum
  (`isOrgSector` type guard) before writing; an invalid/missing value results in
  `sector: undefined` at creation rather than a thrown error, since org creation must not
  fail on a Stripe webhook retry due to a stale/malformed pending-order blob.
- `BuyNowOrgDetails.sector` is optional at the shared-type level (only enforced at the HTTP
  boundary by `BuyNowOrgDetailsDto`'s `@IsIn` validator) because the same type is reused as
  provider metadata for the authenticated existing-org purchase path, where sector doesn't
  apply.

## Security and privacy

No new PII surface — sector is a coarse business-category label, not personal data.

## Rollout and rollback plan

1. Deploy migration (additive, nullable column — no backfill required, no downtime).
2. Deploy code. New orgs via either creation path now require sector; existing orgs keep
   `sector: null` until/unless manually set.
3. Rollback: safe at any point — the column is nullable and no code path assumes
   non-null sector yet (`isFeatureVisibleForSector` treats `null` as "show everything").

## Success metrics

- 100% of orgs created after rollout have a non-null `sector`.
- Zero errors from `createOrgFromPendingDetails` attributable to sector handling.
