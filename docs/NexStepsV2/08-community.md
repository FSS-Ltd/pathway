# Phase 8 — Community

**Status:** Planned
**Owner:** Unassigned
**Ships as:** `2.8.0` (tag `v2.8.0`)
**Depends on:** Phase 7 (NexSteps Home households are the population this connects).
**Blocks:** Nothing — last phase in the roadmap.

---

## Goal

A built-in, opt-in community for NexSteps Home households: a cross-family directory, channels/threads, and meetup planning. This is genuinely net-new — the smallest amount of prior art in this codebase of any phase in this doc set — and it carries its own safeguarding-first stance because it's the first feature in this platform's history that deliberately crosses tenant boundaries.

## Approved product and UX contract

The mandatory Community implementation reference is
[`nexsteps-home/README.md`](nexsteps-home/README.md), with detailed behaviour in
[`nexsteps-home/community-user-flows.md`](nexsteps-home/community-user-flows.md)
and stable screen IDs in
[`nexsteps-home/screen-inventory.json`](nexsteps-home/screen-inventory.json).

Those approved flows make Community appealing and usable, but do not relax any
safeguarding rule in this phase. Opt-in, child-data exclusion, coarse location,
mutual adult connection, public-venue meetups, least-privilege moderation and
auditing remain implementation gates.

## Grounding: why this phase gets a heavier safeguarding treatment than the others

Every other feature in this codebase is tenant-isolated by design — `Child`, `ChildGuardianContact`, `Session`, `Attendance`, all scoped to a single `Tenant`, and every other phase in this doc set (Learning, Home) operates strictly within one household's own data. **Community is the first feature that intentionally shows one household's (limited, opted-in) information to another.** That's a structural first, not a variation on an existing pattern, and it's exactly the kind of change that deserves a safeguarding-first design pass before implementation, not just careful code review after.

Two existing models are close in spirit but **not reusable as-is**, and the difference matters:

- **`Announcement`** (`schema.prisma:854-868`) — confirmed one-way: `tenantId`, `title`, `body`, `audience`, `publishedAt`. No parent/reply/thread FK anywhere in the model. It's a broadcast primitive, not a conversation primitive. Community's channels/threads need real two-way structure this model doesn't have.
- **`Concern`** (`schema.prisma:698-709`) — the platform's existing "something needs review" record, but it's `childId`-scoped and staff-facing (safeguarding concerns about a specific child within one tenant). Community's content-moderation/reporting need is *shaped* similarly (a report → review → action flow) but is about **adult-authored community content across tenants**, not child safeguarding within one tenant. Recommend following `Concern`'s conceptual shape (report, reviewer, resolution) for the new moderation model, without reusing the model itself — the domains are different enough that sharing a table would blur a boundary worth keeping sharp (child-safeguarding records staying strictly tenant-scoped and staff-only).

**No generic Calendar/Event model exists to reuse for meetups either** — grepped the schema for `model.*Event`/`model.*Calendar`, only `AuditEvent`/`BillingEvent` exist (unrelated: audit trail, billing webhooks). The closest analogue is `Session` (`schema.prisma:711+`), but it's shaped for a class/lesson instance and tenant-scoped — wrong shape (meetups are cross-household) and wrong semantics (a meetup isn't a lesson). PR 8.3 needs a new model, following `Session`'s basic structural pattern (start/end time) without inheriting its tenant-scoping or lesson semantics.

## Current state (grounded, R/E/N)

| File / model | Current state | R/E/N |
|---|---|---|
| `packages/db/prisma/schema.prisma:854-868` (`Announcement`) | One-way broadcast, confirmed no thread/reply structure | R (pattern reference only, not reused directly) |
| `packages/db/prisma/schema.prisma:698-709` (`Concern`) | Child-safeguarding report, tenant + child scoped | R (shape reference for moderation, not reused directly) |
| `packages/db/prisma/schema.prisma` | No `Event`/`Calendar` model beyond `AuditEvent`/`BillingEvent` (unrelated); `Session` (711+) is tenant-scoped class/lesson instances | R (structural reference only) |
| Phase 7's `HOME_EDUCATION`-vertical Orgs | The population Community connects | R |
| Every existing tenant-isolation guard in this codebase | Enforces single-tenant scoping everywhere today | R (Community is the first deliberate exception — needs its own explicit, narrow cross-tenant query path, not a general loosening of isolation) |

---

## PR breakdown

### PR 8.1 — Opt-in visibility and directory

**Scope:** Families explicitly opt in to being discoverable by other NexSteps Home households. Off by default. Adults-only in the directory — **no child data in the directory, ever**, by construction (the directory lists households/guardians, not children).

**Key files:**
- `packages/db/prisma/schema.prisma` (N) — a new model, e.g. `CommunityProfile`, one per opted-in household `Org`, holding only what the household chooses to share (display name, rough location if opted in, no child names/ages/photos).
- Capability: `community.directory.visible` — an explicit per-household opt-in flag, not a vertical-level grant (contrast with Phase 7's Learning capability, which *is* vertical-level — directory visibility is a household's individual choice, not something every `HOME_EDUCATION` org gets by default).

**Failing test first:** a new `HOME_EDUCATION` household defaults to **not** appearing in any directory query; only after explicit opt-in does it appear; a test confirming no child-identifying field exists anywhere in the `CommunityProfile` model or its API response shape.

**Rollback:** revert the model/migration; no other phase depends on this data existing.

---

### PR 8.2 — Community backend: channels, threads, posts, replies

**Scope:** New messaging models — genuinely new, no existing model to extend (per the `Announcement` gap above).

**Key files:**
- `packages/db/prisma/schema.prisma` (N) — `CommunityChannel`, `CommunityThread`, `CommunityPost` (or similar naming — confirm against whatever naming convention this phase's implementer prefers, there's no existing chat/forum precedent in this schema to match), each authored by a `User` (guardian) within an opted-in household, visible only to other opted-in households (not globally public, not visible to non-opted-in NexSteps Home users).

**Failing test first:** a thread reply is visible to other opted-in households and invisible to a household that hasn't opted in (PR 8.1's flag gates read access here too, not just directory listing).

**Rollback:** revert the new models; PR 8.1's directory still functions independently (a household can be discoverable without channels existing yet, if these PRs ship out of strict order — though the acceptance criteria below assume in-order delivery).

---

### PR 8.3 — Meetup planning

**Scope:** A purpose-built meetup model — not a reuse of `Session`, per the grounding note above.

**Key files:**
- `packages/db/prisma/schema.prisma` (N) — a new `CommunityMeetup` model: proposer (a `User`), start/end time (borrowing `Session`'s basic time-range shape), location, an RSVP/join list scoped to opted-in households only.

**Failing test first:** a meetup proposal is visible to and joinable by opted-in households, invisible to non-opted-in ones; joining doesn't leak any child data (RSVPs are per-household/guardian, not per-child).

**Rollback:** revert the new model; independent of PR 8.2's channels/threads.

---

### PR 8.4 — Community surface + moderation and reporting

**Scope:** Web and mobile UI for the above, plus a moderation/reporting system (shaped like `Concern`'s report → review → action flow, not sharing its table, per the grounding note).

**Key files:**
- New moderation model (N) — e.g. `CommunityReport`: reporter, reported content reference, reason, status (pending/reviewed/actioned), reviewer, resolution notes.
- New admin surface (N) — for whoever moderates community content (a platform-level role, not a per-household admin — cross-tenant content needs cross-tenant moderation, which is itself a new access-control shape this codebase hasn't needed before; confirm against how platform-level (non-org-scoped) admin actions are handled elsewhere, e.g. the blog's `AutomationApiToken`/`super-user` access level referenced in `admin-shell.tsx:58`, as the closest existing "platform, not org, admin" precedent).
- Community screens in `apps/web`/`apps/mobile` (N).

**Failing test first:** a reported post is hidden from other users pending review (fail-safe: report acts as an immediate soft-hide, not just a queue entry) — a test asserting this, plus a moderator-review test transitioning a report through its states.

**Rollback:** revert the new model/surface; PR 8.1-8.3's data model stays intact but inert without a UI (safer partial-rollback shape than deleting underlying data).

---

## Approved merge-safe slices

The implementation map decomposes Community into independently mergeable slices:

- H8 — opt-in, directory and mutual connection;
- H9 — adult-authored conversations;
- H10 — public-venue meetups;
- H11 — moderation, appeals and operating controls.

Each slice must list its approved screen IDs and retain the Phase 8 safeguarding
gates. See
[`nexsteps-home/implementation-map.md`](nexsteps-home/implementation-map.md).

## Acceptance criteria

- [ ] Directory visibility is opt-in, defaulting to off, and never exposes child-identifying data.
- [ ] Channels/threads/posts are visible only between opted-in households — verified by a test, not just by query construction (query construction alone has been the source of cross-tenant leaks in other systems; this needs an explicit negative test).
- [ ] Meetups follow the same opt-in visibility boundary.
- [ ] Reported content is hidden immediately on report, pending moderator review (fail-safe default).
- [ ] No child data (name, age, photo, learning record) is reachable through any Community model or endpoint, under any combination of opt-ins — this is the one acceptance criterion that should be tested exhaustively, not spot-checked, given this phase's stated safeguarding-first stance.

## Open decisions

This phase needs its own design/decision pass before implementation starts, beyond what this doc set resolves:

1. **Who moderates cross-tenant content** — a new platform-level role, not an existing org-scoped admin role. Needs its own access-control design, not just a new database table.
2. **Whether directory opt-in is per-household or per-guardian** (a household might have two guardians with different comfort levels) — not resolved here.
3. **Data retention for reported/removed content** — needed for moderation appeals and abuse investigation, not specified in the source material.
4. **Whether meetup location data needs the same care as the existing safeguarding-adjacent location handling elsewhere in this codebase** (confirm against how existing address/location fields are protected, if any, before adding a new one that's cross-tenant visible by design).
