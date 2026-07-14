# Guest pass (24h auto-delete)

## Problem statement

There is no way for a visiting parent to register a child for a single day without that
child's data being retained indefinitely. The closest existing concept is the contact-only
public signup (`submitContactOnly` in `apps/api/src/public-signup/public-signup.service.ts`),
which already creates a `Child` + `ChildGuardianContact` with no `User` account — but nothing
marks a record as temporary, and the existing retention worker (`RetentionService`) only
purges attendance/audit rows, never child or guardian PII.

## Architecture approach and key decisions

- **Reuse `Child`, do not add a parallel entity.** A guest is a `Child` row like any other,
  flowing through the same attendance/session code paths, with two extra fields:
  `isGuest Boolean` and `guestExpiresAt DateTime?`. This means cascade delete (via the
  existing `ChildGuardianContact.childId onDelete: Cascade`, `Attendance`, `ChildNote`,
  `Concern` relations) cleans up everything transitively when the `Child` row is deleted —
  no new cleanup code needed per related table.
- **Single write path: `GuestPassService.createGuestChild`.** Both entry points (staff/kiosk
  quick-add and the public self-serve link) call the same method, so there is exactly one
  place that sets `isGuest`/`guestExpiresAt` and writes the guardian contact. This avoids
  duplicating child-creation logic across an authenticated and an unauthenticated module.
- **Self-serve reuses the existing `PublicSignupLink` token — no new link type.** The site
  already has a stable, rotatable signup token (`TenantsService.getOrCreatePublicSignupLink`).
  Guest mode does not need a separate link record: the admin UI derives a guest URL from the
  same token by pointing at a different path/route
  (`/signup?token=X` → `/signup/guest?token=X`), and a new endpoint
  (`POST /public/signup/submit-guest`) resolves that same token via
  `PublicSignupService.resolveLink` before creating the guest child. This means rotating or
  revoking the regular signup link also rotates/revokes the guest link, which is the desired
  behaviour (one token per site controls all unauthenticated entry).
- **Staff/kiosk endpoint is authenticated, not role-gated beyond normal site access.**
  `POST /guest-pass/current` follows the same shape as `ChildrenController` (`AuthUserGuard` +
  `@CurrentTenant`) — any authenticated staff member for the active site can register a guest,
  matching how front-desk/kiosk use is expected to work day-to-day.
- **Two enforcement layers for the 24h bound**, per the plan:
  1. *Read-time filter*: `ChildrenService.list()`/`getById()` exclude
     `isGuest && guestExpiresAt < now`, so a guest disappears from every admin view at exactly
     24h even if the sweep hasn't run yet (mirrors the `expiresAt > now()` pattern already used
     for `PublicSignupLink`).
  2. *Hard delete sweep*: `GuestPassCleanupService` (workers app), structured like
     `RetentionService` — loops tenants, deletes `Child` rows where
     `isGuest AND guestExpiresAt < now()`, gated by `GUEST_CLEANUP_ENABLED`. Scheduled hourly
     (new `.github/workflows/guest-pass-cleanup.yml`), separate from the existing nightly
     AV30/retention workflow, because a nightly-only sweep would allow up to ~48h of guest data
     to persist physically even though it's already hidden.
- **Consent captured at both entry points.** Self-serve requires
  `consents.dataProcessingConsent === true` (same shape as the existing signup DTOs). The
  staff/kiosk quick-add requires a `consentConfirmed` boolean (staff confirms verbal/in-person
  consent was given, since there is no physical form step in a kiosk flow).

## Data model

- `Child.isGuest Boolean @default(false)`
- `Child.guestExpiresAt DateTime?`
- `@@index([isGuest, guestExpiresAt])` on `Child` (used by both the read-time filter and the
  sweep job's `WHERE` clause).
- Migration: `packages/db/prisma/migrations/<ts>_add_guest_pass/migration.sql` — hand-written,
  additive only (`ADD COLUMN ... DEFAULT false`, nullable timestamp), mirroring
  `20260714100000_add_org_sector`. No reachable local Postgres at time of writing.
- `allergies`/`additionalNeedsNotes`/guardian contact fields on guest children flow through the
  existing PII-encryption Prisma extension automatically (Feature 1 already landed on
  `master`) — no additional encryption work needed for this PR.

## Failure modes and resilience

- **Sweep runs but read-time filter fails somewhere the developer forgot to add it.** Accepted
  risk, scoped to the primary admin listing surfaces (`ChildrenService.list`/`getById`); a
  guest still visible in an active session roster during its valid 24h window is expected
  (staff need to mark attendance), not a bug.
- **Hourly cron missed (GH Actions outage).** Read-time filter still hides expired guests from
  every admin view; only the physical row lingers until the next successful run. No PII is
  exposed to other tenants (Child rows are tenant-scoped throughout).
- **Guest link reused after the site rotates its signup link.** Old token immediately 404s via
  the existing `resolveLink` revocation check — same behaviour as the regular signup link.
- **Self-serve submission with `dataProcessingConsent: false`.** Rejected with
  `BadRequestException`, identical to the existing signup DTOs' validation.

## Security and privacy

- No new PII fields beyond what `submitContactOnly` already writes (name, phone, allergies,
  medical notes) — those columns are already covered by the PII-encryption extension.
- Guest data has a hard upper bound on retention (24h + up to 1h sweep latency), which is
  stricter than any other child record in the system.
- The staff/kiosk endpoint requires authentication; it cannot be used to create a guest for a
  site the caller has no context for (`@CurrentTenant` resolves from the caller's active site).

## Rollout and rollback plan

1. Deploy migration (additive, defaults preserve existing rows as non-guest).
2. Deploy API/worker code with `GUEST_CLEANUP_ENABLED` unset (sweep no-ops, matching
   `RETENTION_ENABLED`'s existing safe-default pattern) until verified in staging.
3. Enable `GUEST_CLEANUP_ENABLED=true` and add the hourly workflow secret.
4. Rollback: safe at any point — disabling `GUEST_CLEANUP_ENABLED` stops hard deletes; the
   read-time filter and new columns are additive and don't affect non-guest children.

## Success metrics

- Guest children are absent from admin listings within 1 second of `guestExpiresAt` passing
  (read-time filter, not sweep-dependent).
- Zero guest `Child` rows older than `guestExpiresAt + 1h` in steady state (sweep cadence).
- Both entry points (staff quick-add, self-serve link) produce a working guest record end to
  end in manual verification.

## Open follow-ups (not built this run)

- Per-sector visibility rules, `dateOfBirth` encryption: unrelated follow-ups already tracked
  in the PII-encryption and sector-tag design docs.
- No admin listing currently shows an "isGuest" badge distinguishing guest children from
  permanent ones while they're active; left for product/UX follow-up since it doesn't affect
  the 24h deletion guarantee.
