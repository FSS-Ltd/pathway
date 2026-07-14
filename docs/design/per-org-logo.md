# Per-org logo

## Problem statement

Every admin screen shows the hardcoded NexSteps mark (`AdminBrandLink` in
`apps/admin/app/admin-shell.tsx`, `/NSLogo.svg`). There is no white-label config: orgs
cannot show their own branding in day-to-day use, even though the NexSteps mark should
still own the moments before an org context exists (login, invite acceptance, browser
favicon, native app splash).

## Architecture approach and key decisions

- **Org-level, not site-level.** `logoStorageKey`/`logoContentType` live on `Org`, not
  `Tenant` — a multi-site org shows one logo across all its sites, matching how
  `parentPortalEnabled` and `sector` are already org-scoped.
- **Public Supabase bucket, not the private one.** Child photos and staff avatars use the
  `private` bucket plus an authenticated bytes-serving endpoint, because that content is
  sensitive. A logo is not — it needs to render in a plain `<img>` tag across admin, and
  eventually mobile, without an auth round-trip. Reuses the *existing* `"public"` bucket
  kind already supported by `SupabaseStorageService.uploadObject` (env
  `SUPABASE_STORAGE_PUBLIC_BUCKET` already exists in config/health-check checks; nothing
  currently writes to it). No bytes-fallback column is added (unlike `Child.photoBytes`) —
  if Supabase isn't configured, upload fails loudly rather than silently falling back to a
  path that can't produce a public URL anyway.
- **New `getPublicUrl` on `SupabaseStorageService`.** No code in the repo builds a public,
  unauthenticated Supabase Storage URL yet (`downloadObject`/`objectUrl` are for the
  authenticated proxy-through-the-API pattern). Supabase's public URL scheme is
  `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{key}` — a pure string build, no request
  needed, added as a small new method alongside the existing ones.
- **Dedicated route, not the existing `PATCH /orgs/current`.** That endpoint's zod schema is
  `.strict()` on `{ name, parentPortalEnabled }` by design (per the org-sector-tag design
  doc's precedent of adding purpose-built routes instead of loosening existing strict ones).
  Adding `POST /orgs/current/logo` (upload) and `DELETE /orgs/current/logo` (revert to
  NexSteps default) keeps that contract intact.
- **Plain `<img>`, not `next/image`, for the dynamic logo.** `next/image` requires the
  remote hostname to be allow-listed in `next.config.mjs`; the admin app has no
  `images.remotePatterns` configured today. Rather than opening that config up for a
  per-tenant Supabase URL, the org logo renders as a plain `<img>` with an `onError`
  fallback to the existing `next/image`-rendered `/NSLogo.svg`. Simpler, and avoids a
  config change with a much bigger blast radius than this feature needs.
- **"NexSteps on startup" — admin interpretation.** The authenticated shell
  (`AdminShell`/`AdminBrandLink`) shows the org's logo once a session exists. The `/login`
  route already short-circuits `AdminShell` to bare `children` (no brand link rendered at
  all pre-auth). `accept-invite` renders inside `AdminShell` but before the user has a
  session `fetchOrgOverview()` is never called, so it falls through to the NexSteps default
  automatically — no special-casing needed. The browser favicon
  (`apps/admin/app/layout.tsx`) is a build-time metadata field, untouched.
- **Mobile: documentation only, per the plan.** `BrandLogo`
  (`apps/mobile/src/components/primitives/brand-logo.tsx`) is a single-purpose SVG import
  used on the auth screens; swapping it for a fetched org logo needs image-loading,
  caching, and a fallback story that's a meaningfully different problem on native (no
  `<img onError>` equivalent, bundled SVG vs. remote raster). Captured as a design note in
  `docs/PER_ORG_LOGO_MOBILE.md` rather than implemented, per the explicit decision to ship
  docs-only for mobile this run. The native splash screens
  (`Nexsteps.png`, iOS storyboard, Android drawables) are build-time assets baked into the
  app binary before any org context exists, so they always stay NexSteps regardless of what
  ships later for `BrandLogo`.

## Data model

- `Org.logoStorageKey String?`
- `Org.logoContentType String?`
- Migration: `packages/db/prisma/migrations/<ts>_add_org_logo/migration.sql` — additive,
  nullable columns, hand-written (no reachable local Postgres), mirroring
  `20260714100000_add_org_sector`.
- Storage key: `orgLogoKey(orgId, mimeType) → orgs/{orgId}/logo.{ext}` in
  `apps/api/src/common/storage/storage-key.util.ts`, next to `childPhotoKey`/`staffAvatarKey`.

## Failure modes and resilience

- **Supabase not configured** (`SupabaseStorageService.isConfigured()` false): upload throws
  a clear error rather than silently no-op-ing or falling back to a path with no public URL.
  Existing orgs with no logo continue to work exactly as today (fallback to NexSteps).
- **Invalid/oversized upload**: same validation shape as `staff.service.ts`'s avatar upload —
  5MB cap, `image/jpeg|png|webp` only, `BadRequestException` otherwise.
- **Broken/expired logo URL** (e.g. bucket object deleted out-of-band): `AdminBrandLink`'s
  `<img onError>` falls back to `/NSLogo.svg` immediately — no broken-image icon shown to
  users.
- **Delete reverts, does not purge storage.** `DELETE /orgs/current/logo` clears
  `logoStorageKey`/`logoContentType` on the `Org` row; the object itself is left in the
  public bucket (`SupabaseStorageService` has no delete method today, and leaving an
  orphaned object in a bucket keyed by `orgId` is a low-cost tradeoff versus adding a new
  delete-object code path for a first cut).

## Security and privacy

- Logos are business branding, not personal data — no new PII surface.
- The public bucket is, by definition, publicly readable at the URL level (standard for
  brand assets); `orgLogoKey` namespaces by `orgId` so no org can guess another org's key
  from its own.
- Upload/delete are ORG_ADMIN-gated via the existing `ensureOrgAdmin` check already used by
  `PATCH /orgs/current`.

## Rollout and rollback plan

1. Deploy migration (additive, nullable — no backfill, no downtime).
2. Deploy API + admin code. Orgs without a logo see `logoUrl: null` and the existing
   NexSteps fallback — zero behaviour change until an org admin uploads one.
3. Rollback: safe at any point — nullable columns, and `AdminBrandLink`'s fallback path
   means removing the feature flag/code doesn't strand any org on a broken image.

## Success metrics

- An org admin can upload a logo and see it in the admin shell within one page load.
- Orgs that never upload a logo see zero visual or behavioural change.
- Zero reports of a broken-image icon in the admin shell (covered by the `onError` fallback).

## Open follow-ups (flagged, not built this run)

- Mobile `BrandLogo` swap (fetch + cache + fallback story) — see
  `docs/PER_ORG_LOGO_MOBILE.md`.
- Deleting the underlying Supabase object on logo removal/replacement (currently left as an
  orphan) — low priority, no user-facing impact, would need a
  `SupabaseStorageService.deleteObject` method that doesn't exist yet.
