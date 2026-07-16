# NexSteps Global Features — Delivery Plan

> Scope: features for **any** org/vertical (school, club, church, charity) — not gated behind a profile.
> Baseline of what already exists: `already-have.plan.md`. ACE-specific features that build on top of
> this plan: `ace-profile.plan.md`.

---

## Phase 0 — Org Feature-Profile Toggle System (foundational, build first)

**Goal:** A real per-org module on/off mechanism, since none exists today. Everything in
`ace-profile.plan.md` depends on this existing first.

**Why:** `Org.sector` (CHURCH/CLUB/SCHOOL/CHARITY) and `OrgEntitlementSnapshot.flagsJson` are unused
hooks — nothing in `apps/admin`/`apps/api` branches on them today. The only working precedent is
`parentPortalEnabled` (`apps/admin/app/settings/parent-portal-settings-card.tsx`).

**Tasks:**
1. Decide the storage shape: extend `flagsJson` with boolean feature keys, or add a dedicated
   `OrgFeatureProfile` join table (`packages/db/prisma/schema.prisma`). A join table is safer if profiles
   need their own metadata (purchase date, seat limits) later; a flag bag is faster to ship.
2. Add an admin settings surface to view/toggle profiles per org, modeled on
   `apps/admin/app/settings/parent-portal-settings-card.tsx`.
3. Add a server-side helper (e.g. `orgHasProfile(orgId, "ace")`) consumed by `apps/api` route guards and
   `apps/admin/lib/access.ts`/`permissions.ts` nav gating, so profile-gated routes/nav items disappear
   cleanly when a profile isn't purchased.
4. Wire profile selection into the billing/purchase flow (`packages/pricing`, `apps/api/src/billing/`) so
   buying a profile is a checkout-time decision, not just an admin toggle.

**Output:** an org can have "ACE" (or any future profile) turned on, and both API routes and admin/mobile
nav respect it end to end.

---

## Phase 1 — Parent Trust & Communication

**Goal:** Close the biggest gap versus Oasis: NexSteps has no real parent-facing communication or
finance surface today, only a one-way Notices feed and a `parentPortalEnabled` flag.

**Tasks:**
1. **Messaging threads** — new `MessageThread`/`Message` models (tenant-scoped, RLS-protected like
   `Concern`), audited like `apps/api/src/concerns/concerns.service.ts`. Staff + parent UI in
   `apps/admin` and the new Parent Portal.
2. **Notices upgrade** — add `readReceipt`/`readAt` tracking on `Announcement`, unread-count badge, and
   an author-facing read-count view in `apps/admin/app/notices/[announcementId]/page.tsx`.
3. **Calendar** — new `Event` model, a calendar view surfaced in both `apps/admin` and Parent Portal,
   fed by existing `Session`/`Assignment` data plus new standalone events.
4. **Permission slips** — new `PermissionSlip` model with a status enum (draft/sent/signed/declined),
   admin creation flow, parent sign-off flow.
5. **Rich Parent Portal (web + mobile)** — the actual authenticated dashboard that
   `parentPortalEnabled` currently gates access to but that doesn't exist yet: linked children,
   attendance, behaviour, reports, notices, messages, fees, calendar, permission slips in one view.
   Extend `apps/mobile/app/(family)/` beyond its current static 3-tab shell; add the equivalent to
   `apps/web` (currently marketing-only) or a new `apps/parent-portal` if that's cleaner than bolting
   onto the marketing site. Add minor-account controls (usage limits, lock state, shop-block placeholder
   for the ACE profile to use later).
6. **Fees & Invoices to parents** — new `Invoice`/`LineItem` models distinct from the existing Stripe
   *subscription* billing (`apps/api/src/billing/`, which bills the Org, not parents). Term invoices,
   sibling discount logic, bursary/manual adjustment, payment state, PDF generation (reuse whatever PDF
   pipeline exists for incident sign-off — `apps/web/lib/toolkit-pdf-document.tsx`).
7. **Generic term-report engine** — compile attendance/behaviour/notes into a leadership-reviewed report
   snapshot, sent to parents through the new Portal. (ACE-specific PACE/merit ranks build on top of this
   later — see `ace-profile.plan.md`.)

**Output:** a parent can log in, see everything about their linked children in one place, message the
centre, pay fees, sign permission slips, and see their calendar — none of which exists today.

---

## Phase 2 — Safeguarding & Access Hardening

**Goal:** Bring the existing (already strong) security/incident foundation up to Oasis's spec.

**Tasks:**
1. **2FA enforcement** — add to `packages/auth`, enforced on sensitive admin routes.
2. **Granular permission-tag system** — replace/extend the role-name-based `AccessRequirement` union in
   `apps/admin/lib/access.ts` with a tag/claim model so permissions like "attendance export" or
   "sensitive note access" can be granted independently of a fixed role name.
3. **Attendance upgrade** — add a Late state to `Attendance` (currently boolean Present/Absent only),
   route updates through `AuditEvent`, scope parent/student views correctly.
4. **Incident reporting workflow upgrade** — extend `Concern` (or a new `IncidentReport` model) with a
   draft → review → sign-off → escalation state machine and a parent-safe redacted-copy generator,
   building on the existing `AuditEvent` logging in `apps/api/src/concerns/concerns.service.ts`.
5. **Broaden audit logging** — extend `AuditEntityType` (`apps/api/src/audit/audit.types.ts`) beyond
   `CONCERN`/`CHILD_NOTE` to cover invites, role changes, deactivation, messages, notices, fee actions.
6. **Blind-index support** — add blind indexes for encrypted lookup fields in
   `packages/db/src/pii-encryption.ts`, which explicitly scoped this out previously.

**Output:** access control and audit trails match Oasis's stated security posture, not just the parts
NexSteps happened to build first.

---

## Phase 3 — Clubs, Community & Student Platform

**Goal:** NexSteps currently has zero student-facing product at all (no login, no persona, no screens)
and no dedicated Clubs domain — both are core, cross-vertical gaps, not ACE-specific.

**Tasks:**
1. **Clubs & Activities as a domain** — new `Club`/`ClubMembership`/`ClubSession` models distinct from
   the existing generic age-band `Group` (which is scheduling/class-only). Signup, rosters, attendance,
   club notices, club-lead scoped admin views. NexSteps already sells into the `CLUB` sector
   (`OrgSector`), so this is core.
2. **Student community groups** — new moderated group-chat model, explicitly group-based (no 1:1 DM).
   Clean build — no existing student-to-student messaging to remove or migrate.
3. **Homework / Activity / Club-task engine** — generic assignment model: creation, age-band targeting,
   evidence submission (image/text), review/scoring. Built generic so `ace-profile.plan.md` can layer
   PACE-specific scoring terminology on top rather than building a second engine.
4. **Student portal shell (mobile + PWA)** — a genuinely new space in `apps/mobile` (no student
   persona/login exists today, only Family/parent and Serve/staff). Home/dashboard, notifications, base
   clubs/community access. ACE-specific content (wallet, PACE, Faith Corner) plugs into this shell later
   — see `ace-profile.plan.md`.
5. **Wire static staff mobile shells to live data** — `schedule`, `communications`, `reporting`,
   `safeguarding` in `apps/mobile/app/(serve)/` currently render hardcoded sample data; connect to real
   API calls (rota, notices, reports, concerns) and add missing behaviour-log / incident-capture entry
   forms (currently absent entirely on mobile).
6. **Installable PWA path** — add a web manifest/PWA config for the mobile experience (`apps/mobile`
   currently has no `"web"` Expo config block; `apps/web` has no manifest/service-worker setup either).

**Output:** students get a real (if initially thin) portal, clubs become a first-class domain instead of
a marketing label, and the mobile staff experience stops being a static demo.

---

### Verification

- Each phase should ship with the same bar as the rest of the repo: RLS policies on any new
  tenant-scoped table, PII encryption on any new personal-data field, tests for the new service methods,
  and admin/mobile nav gating wired through Phase 0's toggle helper wherever a feature is meant to be
  optional per org.
- Re-run `graphify update .` after each phase lands (per this repo's `CLAUDE.md` Graphify gate) so the
  knowledge graph stays current for the next planning pass.
