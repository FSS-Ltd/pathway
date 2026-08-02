# NexSteps Home Build-Plan Series

This directory holds the executable build-plan series for NexSteps Home. It
turns the approved handoff in [`../`](../README.md) into a sequence of
independently mergeable PRs.

Read [`PROGRESS.md`](PROGRESS.md) first. It is the live handoff ledger: what
has shipped, what is in flight, and what to do next. This README is the
static index; it does not change once a plan is written, while `PROGRESS.md`
changes after every PR.

## Departure from the approved handoff

The canonical handoff (`../README.md:8`) names `apps/mobile`, migrated
incrementally, as the production target. This series instead builds a new
`apps/nexsteps-home` Expo app. This is a deliberate change recorded here
under the handoff's own [Change control](../README.md#change-control)
process:

- **Reason:** a clean 5-tab shell (Week · Today · Community · Progress ·
  Family) with no legacy Family Space migration path, and no constraint from
  `apps/mobile`'s portrait lock or its three static `(family)` tabs.
- **Cost accepted:** duplicated auth bootstrap, API client, metro/tsconfig
  wiring versus `apps/mobile`, until a future extraction of those into
  `packages/mobile-core` is warranted.
- **Not affected:** `apps/mobile`'s `(family)`, `(serve)` and `(auth)`
  surfaces are untouched by this series. ACE-vertical work continuing in
  `apps/mobile` and `apps/api` in parallel is a separate, unrelated codebase
  area for the app itself; shared platform files (see Conflict watch below)
  are the actual overlap risk.
- **Affected screen IDs:** none — this is an architecture decision, not a
  screen change.

## Two more departures, decided with the user before this series started

- **Tablet layout:** adaptive two-pane (list + detail), not a scaled phone
  layout. No approved tablet wireframes exist yet, so Plan 03 is a design
  pass that produces and gets them approved before any tablet screen is
  built.
- **Fidelity verification:** the approved handoff prescribes manual
  side-by-side QA against 7 reference screenshots
  (`../design-system.md:93-105`). This series instead generates baselines
  for all 76 screens × {iPhone, Pixel} from the prototype and diffs the app
  against them in CI (Plan 02).

## Series index

| Plan | Title | Slice | Screens | Status |
|---|---|---|---|---|
| 00 | This README + progress ledger + change-control record | — | 0 | see PROGRESS.md |
| 01 | App scaffolding | — | 0 | see PROGRESS.md |
| 02 | Fidelity harness + phone baselines | — | 0 | see PROGRESS.md |
| 03 | Tablet design pass + tablet baselines | — | 5 | see PROGRESS.md |
| 04 | `HOME_EDUCATION` vertical, capabilities, household model, plan | H1 | 0 | see PROGRESS.md |
| — | NexSteps Home household signup endpoint (Setup's `account-create`) | H2 (partial) | 0 | see PROGRESS.md |
| — | 06 backend foundations — Activity/Task/CalendarItem schema, capabilities, `family-planner` API | H3 (partial) | 0 | see PROGRESS.md |
| 06 | Week, Today, tasks, calendar screens (built before 05 — see sequencing note) | H3 | 8 | not started |
| 05 | Setup flow (remaining 8 screens) | H2 | 9 | not started |
| 07 | Progress | H4 | 9 | not started |
| 08 | Family, people, permissions, privacy | H5 | 8 | not started |
| 09 | Regulations data + API foundations | H6 | 0 | not started |
| 10 | Regulations & Evidence mobile flow | H7 | 17 | not started |
| 11 | Community opt-in, directory, connections | H8 | 8 | not started |
| 12 | Community conversations | H9 | 5 | not started |
| 13 | Meetups + safety | H10 | 8 | not started |
| 14 | Moderation | H11 | 4 | not started |

Screen totals sum to 76 approved phone/moderation screens, matching
`../screen-inventory.json`'s original group counts. Plan 03 added 5 tablet
two-pane composites under their own `tablet-two-pane` group (81 screens,
10 groups total in the inventory) - each composite reuses an existing
phone screen's content rather than adding new product surface, so it is
not counted against the phone/moderation total above.

Every plan 04-14 follows the PR handoff template in
`../implementation-map.md:155-185` and is gated by `../acceptance-criteria.md`.

**Sequencing note (decided with the user, 2 Aug 2026):** Plan 06 is now
built before Plan 05. Two of Setup's 9 screens (`learning-days`,
`first-activity`) need the task/calendar backend that Plan 06 actually
owns — building them first against local-only state would mean redoing
them once Plan 06 lands, which conflicts with this series' no-hardcoded-
mockup principle. The household signup endpoint (`account-create`'s
backend) doesn't depend on Plan 06 at all, so it was built immediately
rather than waiting for the reordering to resolve.

## Known blockers, tracked from the start

1. **Prototype font mismatch.** `prototypes/nexsteps-home` declares Quicksand
   and Nunito but only loads Roboto (`src/main.tsx`), so it has been
   rendering in a `SF Pro Rounded` fallback. `apps/mobile` and
   `apps/nexsteps-home` load the real fonts. Baselines must not be captured
   until this is fixed. Owned by Plan 02.
2. **Token scale gap.** `packages/mobile-core/src/tokens.ts` radius scale
   `{8,12,16,20,24}` does not cover the wireframe's 13/14/15px values;
   several colours differ between `../design-system.md`, `mobileTokens` and
   the prototype CSS. Resolved by an app-local token layer in Plan 01 that
   extends, never mutates, `mobileTokens`.
3. **`apps/api` does not verify JWT signatures** — `auth-token.util.ts`
   decodes the payload without checking it, by explicit comment. Inherited,
   not fixed, by this series. Flagged to security separately.
4. **Mobile clients never receive the active-site cookie** that
   `AuthUserGuard` uses to resolve tenant. Resolution falls back to
   `User.lastActiveTenantId`. `apps/nexsteps-home` must rely on that
   fallback or a new explicit header, not assume cookie state.
5. **Resolved:** NexSteps Home pricing and household-to-Org/Tenant
   modelling, the two decisions that blocked Plan 04
   (`../../07-nexsteps-home.md:70`, `:96-100`). One lightweight Org per
   household (the phase plan's default); Free/Paid two-tier pricing, Paid
   unlocking Community group creation and expanded AI features (more TBD),
   no in-app checkout.

## Conflict watch — concurrent ACE-vertical work

ACE-vertical work is landing on `fss/master` concurrently with this series
(multiple `feat/ace-*` branches active at series start). Files this series
will eventually touch that ACE also touches:

- `packages/db/prisma/schema.prisma` — Plan 04 adds `HOME_EDUCATION` to
  `Vertical`; ACE work has touched role/permission models here.
- `packages/platform/src/capability-maps.ts` — Plan 04 adds a Home-Education
  grant map entry; ACE owns most existing entries here.
- `packages/types/src/vertical.ts` — Plan 04 adds a vertical label/option.
- `apps/api/src/auth/auth-token.util.ts`, `apps/api/src/auth/auth-user.guard.ts`
  — read-only reference for this series' auth port; ACE has an open
  workstream on permission resolution in this area.

Plans 01-03 touch none of the above; conflict risk there is effectively
zero. Every PR from Plan 04 onward must rebase onto the latest `fss/master`
immediately before opening, and the diff reviewed specifically against
whatever ACE work has merged since the branch was cut.
