# Already in NexSteps — Baseline Reference

> Scope: reference only. No new work here — this documents what already exists so the
> `nexsteps-global.plan.md` and `ace-profile.plan.md` plans don't duplicate it.
> Source: Oasis Learning Centre Platform feature list (`../oasis-portal/docs/marketing-platform-feature-list.md`)
> compared against this codebase by direct code search (Jul 2026).

---

## People & Account Management

**Status:** Solid, reusable as-is.

- Staff invites with org+site role, token hash, expiry.
- Guardian↔child linking (`ChildGuardianContact`).
- Student profile CRUD, active/inactive lifecycle (`User.isActive`).
- RBAC via `Role`/`OrgRole`/`SiteRole` + `UserTenantRole`/`OrgMembership`/`SiteMembership`.

**Evidence:** `packages/db/prisma/schema.prisma`, `apps/api/src/staff/staff.service.ts:751`, `packages/auth/src/types/roles.ts`

**Gap:** account-action audit trail is partial — invite/role-change/deactivation events aren't routed through `AuditEvent` (only `CONCERN`/`CHILD_NOTE` are covered today). Tracked as a Global-plan item.

---

## Attendance Capture

**Status:** Core loop works.

- Upsert-per-session marking, session summaries, CSV export.

**Evidence:** `apps/api/src/attendance/attendance.service.ts`, `apps/api/src/exports/exports.service.ts`

**Gap:** only Present/Absent (`present: Boolean`) — no Late state. Updates aren't audit-logged. Tracked as a Global-plan item.

---

## Staff Rota & Scheduling

**Status:** Mature, directly reusable.

- Shift scheduling (`Session`, `Assignment`), full swap-request workflow, staff availability/unavailable dates, preferred-group eligibility engine.

**Evidence:** `apps/api/src/swaps/swaps.service.ts`, `apps/api/src/staff/staff.service.ts:79` (`getStaffForSessionAssignment`)

**Gap:** none at the API level. Mobile UI for this exists only as a static shell (see Mobile Shells below).

---

## Security Foundation

**Status:** Strongest part of the codebase relative to Oasis's security section.

- Row-level security enforced via Postgres policies on `Tenant`, `Org`, `Concern`, `ChildNote`, `Attendance`, `Assignment`, etc.
- Application-layer PII field encryption via a Prisma extension.

**Evidence:** `packages/db/src/pii-encryption.ts`, `packages/db/prisma/migrations/20251201173000_core_tenant_rls/`, `20251202110000_enforce_rls_flags`, `20260613000000_lock_supabase_public_rls`, `20260613001000_harden_app_rls_functions`

**Gap:** blind indexing is explicitly out of scope in the current encryption pass (documented in the file's own comment). Tracked as a Global-plan item.

---

## Incident / Concern Logging

**Status:** Working CRUD, audit-logged.

- `Concern` model, soft-delete, `AuditEvent` logged on create/view/update/delete, tenant-scoped via RLS.

**Evidence:** `apps/api/src/concerns/concerns.service.ts`

**Gap:** flat CRUD only — no draft → review → sign-off → escalation state machine, no parent-safe redacted-copy generation. Tracked as a Global-plan item.

---

## Notices / Announcements

**Status:** Working one-way broadcast.

- Create/edit/list/detail, `AnnouncementAudience` targeting (`ALL`/`PARENTS`/`STAFF`).

**Evidence:** `apps/admin/app/notices/`, `packages/db/prisma/schema.prisma:854`

**Gap:** no unread state, no read receipts, no author read-count visibility. Tracked as a Global-plan item.

---

## Role-Based Nav / Route Gating

**Status:** Thorough for its scope.

- Per-nav-item `AccessRequirement` (`staff-only`, `site-admin-or-higher`, `admin-only`, `billing`, `safeguarding-admin`, `super-user`), `canAccessRoute()`/`canPerform()`.

**Evidence:** `apps/admin/app/admin-shell.tsx`, `apps/admin/lib/access.ts`, `apps/admin/lib/permissions.ts`

**Gap:** no 2FA/MFA enforcement anywhere in code (only marketing copy claims it). No granular permission-tag/claim system — gating is role-name-based. Tracked as a Global-plan item.

---

## `parentPortalEnabled` Toggle

**Status:** The one working precedent for a per-org feature switch.

- Boolean on `Org`, editable in admin settings, consumed server-side to gate whether registering a child creates parent sign-in access.

**Evidence:** `packages/db/prisma/schema.prisma:233`, `apps/admin/app/settings/parent-portal-settings-card.tsx`, `apps/api/src/orgs/orgs.service.ts`

**Why it matters:** this is the pattern the new org feature-profile toggle system (Global-plan Phase 0) should follow — it's the only real evidence in the codebase that per-org module gating already works end to end.

---

## Mobile Shells

**Status:** UI scaffolding, mostly static/mocked data — a starting point, not working features.

- **Family (parent) space:** `home`, `updates`, `account` tabs. Static child card, static notice list, static message-history pill with no functionality behind it.
- **Serve (staff) space:** `attendance` (live API — the one wired screen), `schedule` (static shell), `communications` (static, staff-internal only), `reporting` and `safeguarding` (static shells, **not even linked into the tab bar** — `serve-bottom-nav.tsx` only lists 4 items).

**Evidence:** `apps/mobile/app/(family)/`, `apps/mobile/app/(serve)/`, `apps/mobile/src/lib/api/attendance.ts`

**Gap:** no student persona/space exists anywhere in `apps/mobile` or `packages/mobile-core`. Tracked as a Global-plan item (student portal shell).

---

## Explicitly NOT present anywhere in NexSteps

Confirmed absent by repo-wide search — no partial credit, nothing to reuse:

- PACE / subject / self-test / final-test / completion tracking
- Merit, demerit, merit wallet, tithe, merit markets, merit shop
- Faith Corner / scripture / devotional content
- Two-way messaging threads (parent↔centre)
- Student community groups (moderated chat)
- Calendar (event views) — only a Sessions/Rota list exists
- Permission slips
- Parent-facing fees/invoices (only Stripe *subscription* billing to the Org exists)
- Homework / activity / club-task assignment and submission
- Term report compilation / leaderboards
- Clubs as a domain (signup, roster, club notices) — only a generic age-band `Group`/Class model exists
- Any student login/persona on mobile
- PWA / installable web manifest for the mobile experience
