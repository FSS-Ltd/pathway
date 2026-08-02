# NexSteps Home Build-Plan Series — Progress Ledger

**Read this file first if picking up this work in a new session.** It is
updated after every PR. `README.md` in this directory is the static series
index; this file is the live state.

Full plan detail (Plan 01 in full, Plans 02-14 specified): the plan file
that started this series, `/Users/JeanFidele/.claude/plans/can-you-look-through-compressed-star.md`.
That file is local to the machine/session that wrote it, not in the repo —
treat this ledger and the series README as the durable copies once PR1
merges. If that plan file is unavailable, this ledger plus `README.md` plus
the source handoff at `docs/NexStepsV2/nexsteps-home/` is sufficient to
continue.

**Last updated:** 2026-08-02
**Updated by:** Technical Agent (Claude), this session
**Current phase:** Plan 07's 9 Progress screens implemented (progress-overview, learning-history, log-detail, evidence-gallery, evidence-detail-upload, subjects, reports-list, report-request, report-detail-download), plus real single-record GET endpoints and a synchronous CSV report-generation pipeline the `/learning/*` API was missing. Verified locally and visually in the Browser pane; PR about to open. This closes out the Progress flow (H4) - Plan 08 (Family, people, permissions, privacy) is next.

---

## Status snapshot

| # | Plan | Status | Branch | PR | Notes |
|---|---|---|---|---|---|
| 1 | 00 — series docs | **merged** | `docs/nexsteps-home-build-plan-series` | [#265](https://github.com/FSS-Ltd/pathway/pull/265) | squash-merged, branch deleted |
| 2 | 01 — app scaffolding | **merged** | `feat/nexsteps-home-app-scaffolding` | [#267](https://github.com/FSS-Ltd/pathway/pull/267) | squash-merged, branch deleted; `apps/nexsteps-home` now exists on `master` |
| 3 | ledger update | **merged** | `docs/nexsteps-home-progress-update` | [#268](https://github.com/FSS-Ltd/pathway/pull/268) | squash-merged, branch deleted |
| 4 | 02 — fidelity harness + phone baselines | **merged** | `feat/nexsteps-home-fidelity-harness` | [#271](https://github.com/FSS-Ltd/pathway/pull/271) | squash-merged, branch deleted; 76 approved screens now have committed baselines |
| 5 | ledger update | **merged** | `docs/nexsteps-home-progress-update-2` | [#272](https://github.com/FSS-Ltd/pathway/pull/272) | squash-merged, branch deleted; recorded the Plan 03 product/design blocker |
| 6 | 03 — tablet design pass + tablet baselines | **merged** | `feat/nexsteps-home-tablet-design` | [#273](https://github.com/FSS-Ltd/pathway/pull/273) | squash-merged, branch deleted; 5 tablet composites, 81 screens / 10 groups in the inventory |
| 7 | 04 — `HOME_EDUCATION` vertical, capabilities, household model, plan | **merged** | `feat/nexsteps-home-h1-foundations` | [#277](https://github.com/FSS-Ltd/pathway/pull/277) | squash-merged, branch deleted; also fixed a pre-existing Plan 03 registry gap (5 tablet screens) found during verification |
| 8 | ledger update | **merged** | `docs/nexsteps-home-progress-update-3` | [#279](https://github.com/FSS-Ltd/pathway/pull/279) | squash-merged, branch deleted |
| 9 | household signup endpoint (Setup's `account-create` backend) | **merged** | `feat/nexsteps-home-signup` | [#280](https://github.com/FSS-Ltd/pathway/pull/280) | squash-merged, branch deleted |
| 10 | 06 backend foundations — Activity/Task/CalendarItem schema, capabilities, `family-planner` API | **merged** | `feat/nexsteps-home-week-today-schema` | [#283](https://github.com/FSS-Ltd/pathway/pull/283) | squash-merged, branch deleted |
| 11 | 06 screens — Week, Today, tasks, calendar (8 screens) | **merged** | `feat/nexsteps-home-week-today-screens` | [#285](https://github.com/FSS-Ltd/pathway/pull/285) | squash-merged, branch deleted |
| 12 | 05 — Setup flow (9 screens) + household-setup backend | **merged** | `feat/nexsteps-home-setup-screens` | [#287](https://github.com/FSS-Ltd/pathway/pull/287) | squash-merged, branch deleted |
| 13 | 07 — Progress flow (9 screens) + learning-API additions | in progress | `feat/nexsteps-home-progress-screens` | not yet opened | code complete, verified locally and visually, about to push |
| 14-19 | 08-14 | not started | — | — | — |

## Environment

- Repo root: `/Users/JeanFidele/The Nexus Ecosystem/Projects/pathway`
- Working in an isolated git worktree at
  `.worktrees/<branch-name>` (repo convention — matches existing
  `.worktrees/feat-ace-*` worktrees already in use for concurrent ACE work).
  One worktree per branch; removed after its PR merges.
- Base ref for every branch in this series: `fss/master` (not `origin/master`
  — `origin` is a personal fork and can lag). Fetch and re-check before
  cutting each new branch:
  ```bash
  git fetch fss --prune
  git worktree add .worktrees/<branch-name> -b <branch-name> fss/master
  ```
- PRs are opened against `FSS-Ltd/pathway` via the `fss` remote, per stored
  convention, not `origin`.
- Commit subjects must be lowercase (commitlint,
  `@commitlint/config-conventional`, enforced by `.husky/commit-msg`).
- No AI/model attribution in commits or PR bodies (user's global CLAUDE.md,
  Branch Discipline section) — this overrides the harness's default
  `Co-Authored-By` trailer suggestion.
- Branch prefixes: `feat/`, `fix/`, `docs/`, `chore/`, etc. Never
  `claude/`/`codex/`-prefixed branch or PR names.

## CI gate (what "green" means for this series)

`.github/workflows/ci.yml`, triggered on PRs into `master`:

- `ci` job: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm test:unit` (root
  script → `turbo run test:unit`, picks up any package defining that
  script — `apps/nexsteps-home` will define one from Plan 01 onward).
- `integration`, `system-role-seed-proof`, `permission-definitions`,
  `organisation-role-rls` jobs all `needs: ci` and run Postgres-backed
  suites unrelated to this app until Plan 04 touches
  `packages/db/prisma/schema.prisma`. Expect them to pass unaffected for
  PRs 1-3 — they exercise code this series has not touched.
  From Plan 04 onward, watch these explicitly — schema/capability changes
  are exactly what they test.

Check status with:
```bash
gh pr checks <pr-number> --repo FSS-Ltd/pathway
```

## Decisions taken (do not re-litigate without a new user conversation)

| Decision | Choice | Source |
|---|---|---|
| Production app | New `apps/nexsteps-home`, not `apps/mobile` | user, plan-mode session, 2026-08-01 |
| Tablet layout | Adaptive two-pane (list + detail) | user, same session |
| Fidelity verification | 76×2 generated baselines, diffed in CI | user, same session |
| Series scope | Full 76 screens, H1-H11 | user, same session |
| Worktree base ref | `fss/master`, not the native EnterWorktree tool's `origin/master` default | this session, reasoned in-line: `fss` is the PR remote, `origin` is a personal fork that can lag |
| Data fetching library | TanStack Query, added in Plan 01 | plan file — `apps/mobile` hand-rolls fetch+useState, insufficient for the loading/empty/error/offline/retry states 76 screens require |
| Plan 03 candidate list | Approved as originally proposed: week/day, progress/detail (also covers evidence gallery/detail), correspondence, channels/threads, moderation queue/report | user, 2026-08-01, in response to this session's explicit question |
| Household-to-Org/Tenant modelling | One lightweight `Org` per household, single `Tenant` | user, 2026-08-01, in response to this session's explicit question |
| NexSteps Home pricing | Two tiers, Free and Paid. Paid unlocks Community group creation, expanded AI features, more TBD. No in-app checkout — external link to nexsteps.dev | user, 2026-08-01, in response to this session's explicit question |
| Plan 03 visual direction | "Keep the same feel... simple and functional so families do not have to be very techy and get the most out of the app functionality" | user, 2026-08-01 — interpreted as: reuse existing approved phone content verbatim rather than author new copy, one dominant layout pattern (list left, detail right) applied consistently, no new interaction model beyond Next/Previous between the 5 composites |
| Tablet device target | Single iPad-class preset (1194×834 landscape, no photographed bezel asset) | this session — the approved candidate flows don't need distinct iOS/Android tablet chrome the way phone screens do (platform-specific status bar/home-indicator/nav-bar rendering matters for pixel fidelity on phone; a tablet mockup's own device chrome is cosmetic, not something being fidelity-gated) |

## Open blockers

See `README.md` "Known blockers" for the full list with sources. Summary:

1. ~~Prototype font mismatch~~ — **fixed in Plan 02** (see below).
2. Token scale gap — resolved by Plan 01's app-local token layer; extended
   in Plan 02 with `headingFamily`/`bodyFamily` (see below).
3. `apps/api` JWT signature not verified — inherited, flagged, not this series' fix.
4. Mobile clients don't send the active-site cookie — rely on
   `User.lastActiveTenantId` fallback.
5. Two open product decisions (pricing, household modelling) block Plan 04.
6. **Graphify pre-change gate could not be satisfied for PR1, PR2, or PR4** —
   same reason each time, not re-litigated per PR:
   `graphify-out/manifest.json` is empty and `graphify-out/cost.json` shows
   zero tokens ever spent, so no prior `--update` run ever completed. From
   this state `graphify --update .` would not behave as an incremental
   update — `detect_incremental` has no baseline to diff against, so it
   would re-detect the full corpus and dispatch semantic-extraction
   subagents across the whole repo at real token cost, for a 3-file docs
   change. Per the gate's own fallback ("if the graph cannot be updated,
   state the exact reason and the command that should be run next"): this
   PR does not run it. **Next command, run deliberately and separately, not
   inside a feature PR:** `graphify update .` from the repo root (accepting
   the one-time full-corpus cost to establish a real manifest baseline), or
   equivalently invoke the `graphify` skill with `--update` from a session
   with headroom for a multi-subagent dispatch. Flagged for the user /
   whoever owns repo maintenance, not silently deferred.
7. ~~React Native does not synthesize font-weight on a custom named font~~
   — **discovered and fixed in Plan 02**. Every primitive Plan 01 built
   paired a fixed-name font (`fontFamily.heading`/`.body`) with a
   `fontWeight` that didn't match the name's baked-in weight, which
   silently renders at the wrong weight on-device. See "What Plan 02
   built" below and `src/design/token-conflicts.md`'s new section.
8. **Fidelity gate has an empty checklist and is not wired into CI yet.**
   `apps/nexsteps-home/fidelity/checklist.json` starts empty on purpose —
   Plan 01's screens are placeholders, not wireframe-matched
   implementations, so there is nothing to assert a match on yet. Each
   later plan (05+) must add its screen IDs to the checklist once it ships
   the real, approved layout. Wiring `test:fidelity` into
   `.github/workflows/ci.yml` is deliberately deferred to whichever plan
   adds the first entry — see `apps/nexsteps-home/README.md`'s "Fidelity
   gate" section.

## Conflict watch

See `README.md` "Conflict watch" section. At series start, `fss/master` had
multiple active `feat/ace-*` branches with recent force-pushes
(`feat/ace-access-me-permissions`, `feat/ace-nav-typed-permissions`,
`feat/ace-nexsteps-notices-attendance`, `feat/ace-permission-cutover`).
Plans 01-03 do not touch any file ACE work touches, with one narrow
exception: Plan 02 adds a one-line `files` entry to the shared
`eslint.config.mjs` (Node-globals block) — purely additive, scoped to
`apps/nexsteps-home/fidelity/**`, verified against fresh `fss/master`
immediately before opening PR4, no conflict. **Before opening any PR from
Plan 04 onward**, diff the branch against fresh `fss/master` and check
specifically: `packages/db/prisma/schema.prisma`,
`packages/platform/src/capability-maps.ts`,
`packages/types/src/vertical.ts`.

## What Plan 01 built (PR2 content, for the reviewer / next agent)

`apps/nexsteps-home/` — new Expo SDK 54 app, zero product screens:

- **Wiring:** `package.json`, `metro.config.js` (copied from `apps/mobile`
  verbatim), `tsconfig.json`, `babel.config.js` (drops the deprecated
  `expo-router/babel` plugin `apps/mobile` still carries), `app.config.ts`
  (`orientation: "default"`, not `"portrait"` — tablet needs rotation;
  scheme `nexstepshome`, bundle id `com.nexsteps.home`; icon/splash
  intentionally omitted rather than pointed at a placeholder — see the code
  comment in `app.config.ts` for why), `eas.json`, `jest.config.js`
  (`jest-expo` preset — **do not add a custom `transformIgnorePatterns`**,
  it replaces rather than extends the preset's and breaks every test with a
  `Cannot use import statement outside a module` error from
  `react-native/jest/setup.js`; this was hit and fixed during this PR).
- **Navigation:** `app/_layout.tsx` (fonts + `AppProviders` + root `Stack`),
  `app/index.tsx` (bootstrap-state redirect), `(setup)/` (unauthenticated
  stack, one real screen: `welcome.tsx`, wired to `signIn()`),
  `(home)/(tabs)/` (5-tab shell). `HOME_TABS` in
  `src/components/navigation/home-tab-bar.tsx` is the single source of
  truth for the tab list — both `_layout.tsx`'s `Tabs.Screen` list and the
  tab bar read from it, unlike `apps/mobile/.../family-bottom-nav.tsx`,
  which duplicates its tab list in a separate `FAMILY_ITEMS` const.
- **Tokens:** `src/design/tokens.ts` extends (never mutates)
  `@pathway/mobile-core`'s `tokens`. Every added value's source and
  derivation is in `src/design/token-conflicts.md`.
- **Primitives:** one component per wireframe block type in
  `src/components/primitives/` (`NoticeCard`, `ContentCard`, `FieldGroup`,
  `ChipRow`, `ListCard`, `StatRow`, `MessageBubble`, `WeekStrip`) plus
  chrome (`ScreenHeader`, `ScreenActions`). Covered by
  `primitives.test.tsx` (one `describe` block per primitive, not 11
  separate files).
- **Tablet foundation:** `src/responsive/` — `useFormFactor` (live,
  `useWindowDimensions`-based), `TwoPane` (renders only `list` on phone;
  side-by-side on tablet at the exact wireframe list width). **No screen
  consumes `TwoPane` yet** — that's a Plan 03 design decision, not this
  plan's.
- **Screen registry:** `src/screens/registry.ts` maps all 76 approved
  screen IDs to their intended route path.
  `registry.test.ts` diffs it live against
  `docs/NexStepsV2/nexsteps-home/screen-inventory.json` — it fails if the
  handoff and the registry ever diverge. Routing rule: `setup` group →
  `/(setup)/<id>`; `moderation` group → `/(moderation)/<id>` (platform-admin,
  not a household route, per `implementation-map.md`); everything else
  keyed off each screen's own `tab` field (not its `group` — `week-today`
  and `family-settings`/`regulations-evidence` each span screens routed to
  different tabs).
- **Auth/API:** `src/lib/api/` (split into `http.ts` + per-domain modules —
  `auth.ts`, `platform.ts`, `health.ts` — from the start, resolving
  `apps/mobile`'s own `TODO(api-domains)` comment) and `src/lib/auth/`,
  ported from `apps/mobile` and simplified: **no dual-space (family/serve)
  resolution** — this app is single-purpose, so `bootstrap.ts` has no
  `space-resolver.ts` equivalent. Also **fixes a bug carried in
  `apps/mobile`**: there, `status: "ready"` still returns
  `route: "/(auth)/site-select"`, so a fully bootstrapped user is always
  sent through the site picker; here, `ready` routes straight to
  `/(home)/(tabs)/week`. Session storage key is `nexsteps.home.session`
  (apps/mobile uses `nexsteps.session`) so both apps can be installed side
  by side. `assertEnv()`/env var resolution is otherwise identical to
  `apps/mobile`'s, including the `AUTH0_MOBILE_*` var names — **both apps
  share the same Auth0 application**; only `AUTH0_MOBILE_CUSTOM_SCHEME`
  differs by default (`nexstepshome` vs `nexsteps`) to avoid a deep-link
  collision.
- **Data fetching:** `@tanstack/react-query`, wired into `AppProviders` —
  the one new runtime dependency this plan adds (see Decisions table).

### Deliberate scope cuts from the original plan text (recorded so they
aren't mistaken for omissions)

- **No `@pathway/pricing` / `@pathway/auth` tsconfig path mappings.**
  `apps/mobile` has them unused (confirmed during exploration); not carried
  over — add back only when a plan actually needs them.
- **No Playwright/pixelmatch dependency yet.** The original plan text put
  these in Plan 01's `package.json`; they're Plan 02 (fidelity harness)
  tooling and were deferred to keep this PR's diff to what it actually
  uses — YAGNI. `react-dom` + `react-native-web` **are** included, because
  they're what makes this app's own `web` script (`expo start --web`)
  actually run, verified via `npx expo export -p web` (clean bundle, 921
  modules, before this PR was opened).
- **No `fidelity/` directory.** Same reasoning — empty scaffold for a plan
  that hasn't started yet.

### Verification performed (local, before opening the PR)

```
pnpm --filter @pathway/nexsteps-home typecheck   # clean
pnpm --filter @pathway/nexsteps-home lint         # clean
pnpm --filter @pathway/nexsteps-home test:unit    # 4 suites, 20 tests, all pass
pnpm -r typecheck                                 # all 15 workspace projects, clean
pnpm -r lint                                       # all 15 workspace projects, clean
pnpm test:unit                                     # all 22 turbo tasks, clean (includes apps/api's 734 tests)
npx expo export -p web                             # clean bundle, 921 modules, no errors
```

One benign, known warning in the test output: `@expo/vector-icons`'
internal async font-loading state update triggers a React Test Renderer
`act()` warning. Third-party library internals, not a bug in this PR's
code, does not fail the suite.

**Not verified:** an actual live sign-in on a booted iOS/Android
simulator. No real Auth0 credentials are configured in this environment,
and initiating a real OAuth flow wasn't attempted without the user present.
The static web export proves the app bundles and every screen/provider
constructs without runtime error; it does not prove the live auth
round-trip. That remains open for whoever has real Auth0 dev credentials
to click through once, or for Plan 02's automated harness.

## What Plan 02 built (PR4 content, for the reviewer / next agent)

**Prototype font fix** (`prototypes/nexsteps-home/`):
- Added `@fontsource/quicksand` and `@fontsource/nunito` (5.3.0 — 5.2.10
  doesn't exist for either package; only `@fontsource/roboto` happened to
  have that patch), imported the exact weights `prototype.css` uses
  (Quicksand 400/500/600/700, Nunito 700/800/900) in `src/main.tsx`.
- `src/main.tsx` is SHA-locked (`mobile-runtime.lock.json`) — ran
  `npm run update:runtime-lock` after editing it.
- Verified in-browser, not just by reading CSS: `document.fonts` showed
  Quicksand/Nunito genuinely loaded and computed `fontFamily` on real DOM
  nodes resolved to them (not the `ui-rounded`/`SF Pro Rounded` fallback
  blocker 1 described). Screenshot evidence was in this session's chat.

**RN font-weight-synthesis bug** (`apps/nexsteps-home/`, discovered while
fixing the above — see blocker 7): React Native does not synthesize
font-weight on a custom font loaded under a fixed name. Every Plan 01
primitive that paired a fixed `fontFamily.heading`/`.body` token with a
mismatched `fontWeight` was silently rendering at the wrong weight. Fixed
by adding `homeTokens.typography.headingFamily`/`.bodyFamily` (weight-keyed
maps to the actually-loaded font name) and auditing every primitive:
`ChipRow`, `ContentCard`, `FieldGroup`, `ListCard`, `MessageBubble`,
`NoticeCard`, `ScreenActions`, `ScreenHeader`, `StatRow`, `WeekStrip`. Also
added `Nunito_900Black` to `app/_layout.tsx`'s `useFonts` call — Plan 01
only loaded up to 800, but the wireframe's largest headings are weight 900.
Full derivation table in `src/design/token-conflicts.md`.

**Baseline capture** (`prototypes/nexsteps-home/scripts/capture-baselines.mjs`,
`npm run capture:baselines`): drives the prototype's own Next/Previous
review controls (no URL-based deep link exists or was worth adding for a
one-off script) through all 76 screens at both device presets, screenshotting
`[data-testid="device-screen"]`. Two prototype-only chrome elements had to be
excluded or they'd have poisoned every diff:
- The review bar (Previous/All screens/Next) — `display:none` around each
  screenshot only, then restored before the next click (toggling
  `visibility` instead breaks nothing visually but leaves the collapsed
  space in place, which is wrong; toggling `display` while the button is
  still needed for the *next* click broke Playwright's click entirely —
  first attempt hung for this reason, fixed by sequencing hide → shoot →
  show → click).
- The fake fingertip cursor (`src/mobile/MobileCursor.tsx`) — turns visible
  on first pointer move and never leaves (Playwright fires `pointermove`
  without `pointerleave`), so it parked at the last click position in every
  screenshot after the first. Hidden once per device pass via
  `page.addStyleTag` — it has no role in hit-testing.
- `Prototype.tsx` (unprotected — not SHA-locked) gained a
  `data-screen-id={activeScreen.id}` attribute so the script always knows
  which screen it just captured, rather than trusting click-count/array
  order.
- 152 PNGs committed to `prototypes/nexsteps-home/baselines/{iphone,pixel-10}/<id>.png`
  (~10MB). iPhone baselines capture at 394px wide, not the documented
  393 — a 1px browser subpixel-rounding artifact in the capture tool
  itself, tolerated (not treated as a real mismatch) by the diff harness
  below.

**Diff harness** (`apps/nexsteps-home/fidelity/`):
- `checklist.json` — screen IDs currently asserted to pixel-match. **Starts
  empty** — see blocker 8. Ships with a `note` field explaining why.
- `serve-export.mjs` — a ~40-line static file server with SPA fallback for
  the `expo export -p web` output (Node's built-in `http`/`fs`; no new
  dependency for a handful of static files). Originally had a top-level
  `await` self-execution guard for standalone use; removed after it broke
  `tsx`'s CJS transform of the importing file and nothing actually needed
  standalone execution — YAGNI.
- `run.ts` (`pnpm --filter @pathway/nexsteps-home test:fidelity`) — for
  each checklist screen × {iPhone, Pixel}: exports the web build once,
  serves it, navigates to the registry-mapped route at the exact device
  viewport, screenshots, and diffs against the matching prototype baseline
  with `pixelmatch` (new devDependency, along with `pngjs`, `tsx`, and this
  app's own `@playwright/test` — the prototype already had its own copy).
  Threshold: 0.1 pixelmatch sensitivity, fails if >2% of pixels differ.
  Skips the entire export/serve/browser sequence when the checklist is
  empty (true today) so it stays fast.
- Dimension tolerance: baselines can be up to 2px off in either axis
  (covers the 394-vs-393 iPhone artifact above) before a size mismatch
  hard-fails; within tolerance, both images are cropped to their common
  region (`PNG.bitblt`) before diffing, rather than the exact-equality
  check the first version had (which is what surfaced the 1px issue).
- **Proven functional, not just written**: temporarily added `"welcome"`
  to `checklist.json`, ran `test:fidelity` for real — it correctly
  exported the web build, served it, screenshotted both devices, and
  reported ~16-17% pixel difference (expected: `welcome` is Plan 01's
  placeholder, not the real wireframe layout) with a saved diff image
  clearly highlighting the mismatched regions. Reverted the checklist to
  empty before committing.
- Not yet wired into `.github/workflows/ci.yml` — see blocker 8.

**Shared-file touch**: one line added to the Node-globals `files` array in
the root `eslint.config.mjs` (needed because `serve-export.mjs`, a plain
`.mjs` file, uses `process`; TypeScript files don't need this — confirmed
by testing). Purely additive, scoped to `apps/nexsteps-home/fidelity/**`.

### Verification performed

Same full suite as Plan 01 (`pnpm --filter @pathway/nexsteps-home
{typecheck,lint,test:unit}`, `pnpm -r typecheck`, `pnpm -r lint`, `pnpm
test:unit`) — all clean, plus:
```
node scripts/check-mobile-runtime.mjs   # prototype: 28 protected files, clean
node scripts/check-wireframes.mjs       # prototype: 17 regulations screens, clean
npx playwright test                     # prototype's own 8 interaction tests, all pass
node scripts/capture-baselines.mjs      # 76+76 screens captured, dimensions verified
pnpm test:fidelity (temporarily non-empty checklist)  # proven functional, see above
```

## What Plan 03 built (PR6 content, for the reviewer / next agent)

**Design approach**: every tablet composite reuses an existing approved
phone screen's blocks verbatim as each pane's content - literally the same
`card()`/`list()`/`notice()` data, same copy, same colours, same
primitives - recomposed side by side rather than authored fresh. This is
the direct, deliberate execution of "keep the same feel... simple and
functional": a family member who only ever uses the phone will find nothing
unfamiliar on the iPad.

**5 tablet two-pane composites** (`prototypes/nexsteps-home/src/tablet-wireframes.ts`,
new, unprotected):
- `tablet-week-day` = `week-home` (list) + `day-detail` (detail)
- `tablet-progress-detail` = `learning-history` + `log-detail` - this one
  pattern also covers `evidence-gallery`/`evidence-detail-upload` and
  `reports-list`/`report-detail-download` verbatim; no separate mockup for
  a layout shape already proven. The approved candidate list's "progress/
  detail" and "evidence gallery/detail" entries are this same pattern.
- `tablet-correspondence` = `regulations-correspondence` + `regulations-correspondence-detail`
- `tablet-conversations` = `thread-list` + `thread-detail`
- `tablet-moderation` = `moderation-queue` + `moderation-report`

**Tablet device preset** (`geometry.ts`, `Device.tsx`, `PhoneFrame.tsx` -
all protected, lock regenerated): 1194×834 (iPad 11" landscape logical
points), no photographed bezel asset - `MobileDevicePreset.bezel` is now
optional, `PhoneFrame` skips the `<img>` when absent, and the pre-existing
`.device-screen` default styling (inset border, inline `border-radius`
from geometry) already gives a clean flat device edge with zero new CSS.
Reuses `platform: "ios"` - iPadOS shares iPhone's status-bar icons and
centred home-indicator pill, and the home-indicator SVG's existing
`width:100%` + default `preserveAspectRatio="xMidYMid meet"` already
renders it at correct native size, centred, on the much wider canvas with
no code change (verified in-browser before assuming it, not asserted).

**Rendering** (`Prototype.tsx`, unprotected): the tablet device browses
only the 5 composites (a separate `activeTabletId` cycle), not the
76-screen phone set - none of the phone screens are designed for the wider
canvas, and a list+detail composite has no meaningful single-pane
rendering. `TwoPaneScreen` reuses the exact same `ScreenHeader`/`Block`/
`ScreenActions` components the phone renderer uses - one combined header
at the top (composite's own title), a lightweight `PaneHeading` (eyebrow +
h2, no duplicate brand chrome) per pane. In-pane list rows and detail
actions are inert - a static approved-design snapshot, not a new
drill-down prototype; Next/Previous cycling the 5 composites is the only
navigation tablet needs for this pass.

**Known, documented simplification**: both panes share one outer
`MobileScroll`, so they scroll together rather than independently (a real
master-detail view scrolls each column on its own). Marked with a
`ponytail:` comment at the point of implementation - not worth nested
custom-momentum scroll regions in this DOM prototype for a static
design-approval pass; trivial to fix properly once a real
`apps/nexsteps-home` screen implements `TwoPane` with RN `ScrollView` per
pane.

**Handoff contract updated to 81 screens / 10 flow groups**:
`docs/NexStepsV2/nexsteps-home/screen-inventory.json` gained the 5 tablet
entries under a new `tablet-two-pane` group (each carries `listScreenId`/
`detailScreenId` plus `targets: [listScreenId, detailScreenId]` so
`validate-handoff.mjs`'s existing target-resolution check validates them
for free); `validate-handoff.mjs` updated for the new counts.
**Deliberately not** added to the prototype's own `flowGroups`/`FlowIndex`
array (`wireframes-data.ts`) - that index lists phone screens for the "All
screens" browsing UI, and an entry with zero matching `wireframeScreens`
would render an empty, broken-looking section; tablet composites are
reached by switching the device picker, not the index.

**Baselines**: `capture-baselines.mjs` extended with a third device entry
(`totalScreens: 5` for tablet, vs. 76 for phone) and a wider viewport
(1300×1150, up from 900×1200) so all three devices hit `PhoneFrame`'s
scale-1 threshold. 5 new PNGs at `prototypes/nexsteps-home/baselines/tablet/`,
each exactly 1194×834 (no subpixel-rounding artifact, unlike the iPhone
preset's known 1px quirk - the tablet has no bezel-inset math to round).
**The 152 existing phone baselines were regenerated by the same run but
reverted before committing** - the capture script's `rmSync` wipes and
redoes the whole `baselines/` directory every run, and the live status-bar
clock (`components.tsx`'s `new Date()`) bakes a different time into every
PNG on every run; diffed one file to confirm the ~200-byte difference was
exactly that, not a real regression, then `git checkout`'d the 152 phone
files and `manifest.json` back to Plan 02's committed versions, hand-adding
just the new `"tablet"` manifest key. Nothing about this plan's changes
alters phone rendering.

### Verification performed

```
npx tsc --noEmit                          # prototype: clean (after npm install in this fresh worktree)
node scripts/check-mobile-runtime.mjs      # 28 protected files, clean (lock regenerated first)
node scripts/check-wireframes.mjs          # 17 regulations screens, clean (unaffected)
node docs/NexStepsV2/nexsteps-home/validate-handoff.mjs   # 81 screens across 10 flow groups
npx playwright test                        # prototype's own 8 interaction tests, all pass
node scripts/capture-baselines.mjs         # 76+76+5 captured; tablet dimensions verified exactly 1194x834
```

Visually verified in the Browser pane against a live dev server (not just
assumed from code): all 5 tablet composites, confirming layout, colour,
type and the "Adults only"/"Family private" privacy chip both render
correctly on the wider canvas, before capturing anything as a baseline.

This plan touches only `prototypes/nexsteps-home/` and
`docs/NexStepsV2/nexsteps-home/` - zero files in the pnpm workspace, so the
full `pnpm -r typecheck`/`lint`/`test:unit` suite that gated Plans 01-02 is
unaffected by construction, not just unrun.

## Next action

Plan 07 is complete: all 9 Progress screens, against a `/learning/*` API
that turned out to need real additions first (see "What Plan 07 built"
below - the plan text's assumption that this could be built purely
against "the existing endpoints" didn't hold once the screens were
actually specced out). **Next: Plan 08 (Family, people, permissions,
privacy).**

**What Plan 07 built (PR13 content, for the reviewer / next agent)**

- **`apps/api/src/learning/`**: added `GET /learning/logs/:id`,
  `GET /learning/evidence/:id`, `GET /learning/report-bundles/:id` (none
  existed - every list endpoint had no single-record counterpart).
  Rewrote `createReportBundle` to generate synchronously instead of
  inserting a `PENDING` row and stopping: repo-wide search before writing
  confirmed **no worker/job/queue anywhere in this codebase** ever
  transitions a bundle to `READY` - it would have sat `PENDING` forever.
  Building a real async job pipeline was judged out of scope (a
  multi-day project, same category of decision as Plan 05's email-verify
  OTP adaptation); instead `createReportBundle` now aggregates the
  child's learning logs for the requested period, builds a CSV summary
  (date/subject/title/minutes/description per log, via the new
  `buildReportCsv` private method), uploads it through the existing
  `SupabaseStorageService`/`reportBundleKey()` (both already used by the
  never-implemented download path - `getBundleFile` was already reading
  from exactly this key shape, just nothing ever wrote to it), and marks
  the bundle `READY` in the same request. Throws
  `ServiceUnavailableException` if the upload fails (e.g. storage not
  configured) rather than leaving a silently-broken row.
- **Deliberately not built: a PDF pipeline.** The approved wireframe's
  copy says "Download PDF" / "PDF" - adapted throughout the UI to "CSV
  summary" / "View report", matching Plan 05's established pattern of
  adapting wireframe copy to what the backend can actually, honestly do
  rather than building a fake affordance or a disproportionate new
  subsystem.
- **Deliberately not built: evidence upload.** `evidence-detail-upload`
  is view-only (existing item detail: type, size, captured date) - no
  image-picker/document-picker/audio-recording dependency exists
  anywhere in this monorepo (checked `apps/mobile` too, which has its
  own child-photo-upload feature and still doesn't have one), and adding
  one is real, separate native-capability work across iOS/Android/web
  permissions, not something to build speculatively inside a screens
  plan. `evidence-gallery`'s "Add evidence" action was dropped entirely
  rather than pointing at a dead end - the exact precedent Plan 06 set
  for quick-log's evidence upload.
- **Tests**: `apps/api/src/learning/tests/learning.service.spec.ts`
  updated for the new `createReportBundle` shape (mocks
  `learningLog.findMany`, `child.findFirst`, `reportBundle.update`, and
  `storage.uploadObject`) and extended with tests for all 3 new
  single-record getters plus the CSV-generation and
  storage-failure paths. No new controller spec file - this module never
  had one (only an e2e capability-guard spec), so none was added,
  matching the existing convention rather than introducing a new one.
- **Client**: `src/lib/api/learning.ts` extended with `listLearningLogs`,
  `getLearningLog`, `Evidence`/`listEvidence`/`getEvidence`,
  `ReportBundle`/`listReportBundles`/`getReportBundle`/
  `createReportBundle`/`downloadReportBundleText`, and `createSubject`
  (the backend endpoint already existed, just no client wrapper). New
  `src/lib/queries/learning.ts` for the corresponding React Query hooks.
  `src/lib/api/http.ts` gained `requestText()` (a `request()` sibling
  that resolves the body as text instead of JSON) - needed because a
  downloaded CSV report isn't JSON; refactored the shared
  fetch/error-handling into a private `fetchChecked()` both methods call,
  rather than duplicating it.
- **Found and fixed a real, small pre-existing bug while in this file**:
  `useCreateLearningLog` (`src/lib/queries/family-planner.ts`) had no
  `onSuccess` cache invalidation, unlike every other mutation hook in
  that file - a log created from Today's quick-log would never appear in
  Progress's `learning-history` until an unrelated refetch happened to
  occur. Added the missing `invalidateQueries(["learning-logs"])`.
- **9 screens** (`apps/nexsteps-home/app/(home)/(tabs)/progress/`), each
  built from the wireframe content read directly out of
  `prototypes/nexsteps-home/src/wireframes-data.ts`, against real data:
  - `index.tsx` (`progress-overview`) - full rebuild of the placeholder.
    Real stats (log/evidence/subject counts), a real "this week" count.
    **Dropped the wireframe's "Strongest thread" insight card** -
    generating a real cross-subject pattern insight is analytics/ML
    scope this plan doesn't do; showing a fabricated one would violate
    this series' no-mocked-data principle throughout.
  - `learning-history.tsx` - real `listLearningLogs`, subject `ChipRow`
    filter (client-side - a household's total log count is small, no
    server-side filtering/pagination needed at this scale), tap a row →
    `log-detail`.
  - `log-detail.tsx` - real single-log fetch. **Dropped the wireframe's
    "Confident" mood chip and "Reflection" parent-note card** - no
    matching field exists on `LearningLog` for either (checked the
    schema before deciding, not guessed); showing them as static/fake
    would misrepresent the record. Evidence count is real (client-side
    filter of the evidence list by `learningLogId`).
  - `evidence-gallery.tsx` / `evidence-detail-upload.tsx` - real
    `listEvidence`/`getEvidence`. The wireframe's "Photos/Files/Voice"
    filter chips are **derived from the real `mimeType` on each item**
    (`image/*`/`audio/*`/else), not a fabricated field.
  - `subjects.tsx` - real per-subject log/evidence counts (computed
    client-side from the already-fetched logs/evidence lists). "Add
    subject" is a real, working inline form (no separate route) against
    the already-existing `POST /learning/subjects` - confirmed working
    live in the Browser pane.
  - `reports-list.tsx` / `report-request.tsx` /
    `report-detail-download.tsx` - real report bundle list/create/detail.
    `report-request` replaced the wireframe's "Overview/Subjects/
    Selected evidence/Attendance" section-toggle chips (the backend has
    no concept of selective report sections - it's a fixed CSV of every
    log in the period) with period-length chips (Last 30/90 days, This
    year) computed from `new Date()`, and an honest notice describing
    what's actually generated. `report-detail-download`'s "Download PDF"
    became "View report": fetches the CSV via `requestText` and renders
    it as `selectable` `Text` in-app - deliberately not a native
    file-save/share flow (would need `expo-file-system`/`expo-sharing`,
    new dependencies with the same risk profile this series has avoided
    elsewhere), but a genuine, functional way to get the real data out
    (select and copy).

### Verification performed

```
pnpm --filter @pathway/nexsteps-home typecheck   # clean
pnpm --filter @pathway/nexsteps-home lint         # clean
pnpm --filter @pathway/nexsteps-home test:unit    # clean, 35 tests
pnpm --filter @pathway/api typecheck/lint         # clean
apps/api learning.service.spec.ts (direct)        # 16 tests, all pass
pnpm -r typecheck                                 # all 15 workspace projects, clean
pnpm -r lint                                       # all 15 workspace projects, clean
pnpm test:unit                                     # all 22 turbo tasks, clean (apps/api: 774 tests)
```

Visually verified in the Browser pane against a live dev server (main-
checkout-copy technique, same as Plans 05/06 - this branch lives in an
isolated worktree, git refuses a double checkout): `learning-history`
(empty state + subject chip renders), `subjects` (the inline "Add
subject" form opens/closes correctly - confirmed the FieldInput/
Save/Cancel swap works), `report-request` (period chips default to
"Last 30 days", correctly toggle), `reports-list` (empty state + "You
stay in control" notice render correctly). All render inside the real 5-
tab shell with no crashes. Full authenticated data-flow (real logs/
evidence loading) isn't practical to verify this way - no Auth0 session
exists in that browser context, and this session's embedded preview
harness has a known, already-documented limitation (Plan 05's ledger
entry) where `document.visibilityState` never leaves `"hidden"`, which
stalls TanStack Query's retry mechanism regardless of `networkMode` -
not re-investigated here, already root-caused previously.

**What Plan 05 built (PR12 content, for the reviewer / next agent)**

- **Schema** (`packages/db/prisma/schema.prisma`,
  `packages/db/prisma/migrations/20260802130000_add_household_setup_fields/`):
  `Tenant.learningDays String[] @default([])` and
  `Tenant.setupCompletedAt DateTime?`. Validated with the same throwaway-
  Docker-container + `prisma migrate diff` technique Plan 06 established -
  zero drift on `Tenant`, confirmed against a clean apply of the full
  migration history. The two shared local dev Postgres databases
  (`pathway` on 5433 and `pathway_test_e2e`) were both several migrations
  behind (not just this one - `ace_reports_faith`,
  `add_home_education_vertical`, `add_week_today_planning` were pending
  too) and were brought current with `prisma migrate deploy` (additive
  only, never reset) so `pnpm test:unit` would pass locally; this is
  expected upkeep for whoever next touches schema-adjacent tests, not a
  one-off fix.
- **`apps/api/src/household-setup/`** (new module, mirrors
  `family-planner`'s shape): `GET /household-setup/status`,
  `PATCH /household-setup/learning-days` (zod-validated weekday enum,
  max 7), `POST /household-setup/complete`. Plain `AuthUserGuard`, no
  `CapabilityGuard` - matches `children.controller.ts`'s precedent that
  basic household config isn't capability-gated.
- **`apps/api/src/children/dto/create-child.dto.ts`**: `lastName` changed
  from required to optional (defaults to `""`, mirroring the existing
  `allergies` default-transform pattern in the same file). Necessary
  because `child-add`'s approved wireframe only collects "First name or
  nickname" - no surname field exists in the design, and the DB column
  (`String`, not nullable) already accepts `""` as a valid value. Scoped
  narrowly: this loosens validation only, doesn't change behaviour for
  any existing caller that still sends a real `lastName`.
- **`apps/nexsteps-home/src/lib/auth/auth0-client.ts`**: added
  `loginWithPassword` (Auth0 `passwordRealm` grant, same
  `Username-Password-Authentication` connection the signup endpoint
  creates users on) and `resetPasswordWithAuth0` (Auth0 `resetPassword`
  call) - both confirmed against the installed `react-native-auth0@5.4.0`
  SDK's actual TypeScript definitions before use, not assumed from memory.
- **`apps/nexsteps-home/src/providers/app-providers.tsx`**: two real
  fixes, found only by live-verifying this plan's screens in the Browser
  pane, not by reading code:
  1. `signIn`/`refreshBootstrap` now return the resolved `BootstrapState`
     (previously `void`) - Plan 01's `welcome.tsx` called
     `void signIn()` and relied on nothing to navigate afterward, which
     never worked (no navigation-on-bootstrap-change guard exists
     anywhere in the app); screens now explicitly `router.replace` using
     the returned state. Added `signInWithPassword` alongside `signIn`
     for the same reason, used right after account-create's signup call.
  2. `QueryClient` now sets `networkMode: "always"` for queries and
     mutations. Default `networkMode: "online"` pauses fetches based on
     browser online/offline events, which don't reflect real connectivity
     in React Native (no NetInfo integration exists in this app) - found
     because a query stuck at `fetchStatus: "paused"` with both
     `isError`/`isLoading` false renders identically to a real empty
     state, silently defeating this series' loading/error/empty
     distinction on every screen using `useQuery`, not just Plan 05's.
     `"always"` is the officially documented fix for apps without
     NetInfo wiring. Root-caused via direct inspection of the installed
     `@tanstack/query-core@5.101.4` source (`retryer.js`'s `canFetch`),
     not guessed.
- **9 screens** (`apps/nexsteps-home/app/(setup)/`), each built from the
  wireframe content read directly out of
  `prototypes/nexsteps-home/src/wireframes-data.ts`, against real backend
  calls - no mocked/local-only state, matching this series' standing
  principle:
  - `welcome.tsx` - full rebuild of Plan 01's placeholder (which only had
    a "Sign in" button, none of the wireframe's notice/card blocks or
    `account-create` routing).
  - `account-create.tsx` - email/password form, calls
    `POST /public/nexsteps-home/signup` then `signInWithPassword` to
    establish a session (the signup endpoint issues none - see PR9/#280),
    then routes to `email-verify`.
  - `email-verify.tsx` - **deliberately adapted from the wireframe**: the
    approved design shows a 6-digit code entry field, but nothing backs
    it. Auth0 (`Username-Password-Authentication` connection via
    `react-native-auth0`) sends a verification *link*, not an OTP code,
    and this SDK version exposes no resend method either - confirmed by
    reading its actual type definitions, not assumed. Building a real
    custom OTP system was judged out of scope for this plan (a
    multi-day project in its own right). The screen instead shows an
    honest "check your inbox" state with no non-functional code field or
    resend button, and doesn't block continuing - verification isn't
    gated anywhere downstream yet.
  - `account-recover.tsx` - matches the wireframe closely: email field,
    `resetPasswordWithAuth0`, and a generic "if that address matches..."
    confirmation shown unconditionally (success or failure both show the
    same message, deliberately, for the privacy reason the wireframe's
    own copy states).
  - `children-list.tsx` / `child-add.tsx` - **one flow adjustment from
    the static wireframe**: the wireframe's own demo data shows a child
    already added on `children-list` with "Continue with 1 child" routing
    to `child-add` (i.e., forward to add a child *after* already having
    one) - an artifact of the prototype's own linear Next/Previous
    review order, not real conditional logic. Real implementation:
    `children-list` shows the true empty/loaded state from
    `GET /children`, "Add another child" routes to `child-add`, and
    `child-add`'s save returns to `children-list` (not straight to
    `learning-days`) so a household can add more than one child before
    continuing. `child-add` collects age (not date of birth, per the
    wireframe) and converts it to an approximate 1-January birthdate via
    the new `src/lib/child-age.ts` (`ageToDateOfBirth`, unit-tested) -
    the exact day is unknowable from an age alone and isn't asked for.
  - `learning-days.tsx` - `ChipRow` multi-select (Mon-Thu pre-selected,
    matching the wireframe's "Suggested" copy), `PATCH
    /household-setup/learning-days` on continue; "Choose later" skips the
    save and moves on without persisting a preference.
  - `first-activity.tsx` - child picker (`ChipRow`, from real
    `GET /children`) + day/time/duration chips reusing Plan 06's
    `date-options.ts` (same defaults the wireframe shows: Tomorrow,
    10:00, 45 min) - `POST /family-planner/activities` then
    `POST /household-setup/complete`, then routes to `setup-complete`.
    Confirmed `family.activities.write` resolves for a fresh household
    without further wiring: capability grants are vertical-based, and
    signup already creates an `OrgVertical` row for `HOME_EDUCATION`.
  - `setup-complete.tsx` - **deliberately simpler than the wireframe**:
    the approved design mocks a week strip and an upcoming-activity card
    with fixed demo data. This series has avoided hardcoded/mocked screen
    content throughout (Plan 06's explicit precedent); the real week and
    activity the user just created are one tap away on the Week tab, so
    duplicating them here with fabricated data would be worse than a
    plain confirmation notice.
- **`FieldInput`** (`apps/nexsteps-home/src/components/primitives/FieldInput.tsx`):
  extended with `secureTextEntry`/`autoCapitalize`/`keyboardType` - real,
  necessary gaps for password masking (account-create) and correct
  keyboard behaviour (email fields, numeric age), not speculative.
- **`apps/nexsteps-home/src/lib/api/`**: new `signup.ts` (public signup
  client) and `household-setup.ts` domain modules, `createChild` added to
  `children.ts`, all following the established thin-wrapper-per-domain
  pattern.

### Verification performed

```
pnpm --filter @pathway/nexsteps-home typecheck   # clean
pnpm --filter @pathway/nexsteps-home lint         # clean
pnpm --filter @pathway/nexsteps-home test:unit    # clean, includes 2 new child-age.ts tests
pnpm -r typecheck                                 # all 15 workspace projects, clean
pnpm -r lint                                       # all 15 workspace projects, clean
pnpm test:unit                                     # all 22 turbo tasks, clean (apps/api: 767 tests)
```

Visually verified in the Browser pane against a live dev server (not just
assumed from code), using the same main-checkout-copy technique Plan 06
established (this branch is checked out in an isolated worktree; git
refuses to check out the same branch twice, so frontend files were
temporarily copied into the main checkout for inspection only, then fully
removed - `git status` confirmed clean there afterward):
- `welcome` - notice/card blocks render correctly; "Set up my family"
  routes to `account-create`.
- `account-create` - filled and submitted a real form; the signup POST
  correctly targeted `/public/nexsteps-home/signup` and failed with
  `ERR_CONNECTION_REFUSED` (no API server running in this environment),
  which the screen correctly rendered as a danger `NoticeCard` - proves
  the request wiring, password masking (confirmed `type="password"` on
  the live DOM node), and error-state rendering all work.
- `learning-days` - confirmed the Mon-Thu suggested default renders
  correctly, and that tapping a chip (Fri) toggles it live.
- `first-activity` - confirmed the Tomorrow/10:00/45 min defaults render
  correctly.
- `setup-complete` - confirmed the yellow-tone notice card and primary
  action render correctly.
- **Found and fixed a real bug this way**: `children-list`'s
  loading/error/empty distinction appeared to always show "empty" no
  matter what. Root-caused (not guessed) via direct query-state
  inspection to the `networkMode`/`focusManager` issue described above,
  specific to this embedded preview harness never reporting
  `document.visibilityState` as anything but `"hidden"` - confirmed via
  `@tanstack/query-core`'s own source that this blocks the underlying
  retry mechanism regardless of network mode, a harness limitation (real
  devices/browsers don't have this problem), not a defect in the
  shipped code. The `networkMode: "always"` fix itself is real and
  correct regardless - it removes a genuine failure mode (silent
  pause-forever on any query) that would otherwise affect every screen
  in the app, not just Plan 05's.

**Two known, deliberate scope reductions in Plan 06's screens** (not
oversights — flagged here so a future session doesn't rebuild what's
already been decided against):
- **No assignee picker on Task.** The wireframe shows "Assigned to: Sam",
  but there's no household-members API yet (that's Plan 08/H5's
  territory). Every task is created unassigned for now rather than
  building a fake picker against an endpoint that doesn't exist.
- **No date/time native picker.** Chips (Today/Tomorrow/weekday + a
  handful of preset times) instead of `@react-native-community/datetimepicker`
  - avoids a new native dependency with inconsistent react-native-web
    support, and matches the chip-based pattern the approved wireframe
    itself already uses on the adjacent first-activity setup screen.
- **No edit flows.** None of the 8 screens show an edit affordance for an
  existing Activity/Task/CalendarItem, only create and (for tasks)
  complete — so none were built. Evidence upload on quick-log was
  similarly dropped (file handling is a real, separate piece of work);
  showing a non-functional "Add evidence" button would have been worse
  than omitting it.

---

## Session log

### 2026-08-01 — session 1 (Technical Agent, Claude)

- Explored the repo for everything connected to NexSteps Home: the approved
  handoff (`docs/NexStepsV2/nexsteps-home/`), the runnable prototype
  (`prototypes/nexsteps-home/`), `apps/mobile`, `apps/api`, and
  `packages/mobile-core`.
- Wrote the full plan series in plan mode; user answered 4 clarifying
  questions (production app, tablet layout, fidelity verification, scope —
  see Decisions table above).
- User approved execution: implement in an isolated worktree, PR by PR,
  merge each after green CI, watch for conflicts with concurrent ACE work,
  keep meticulous handoff records, follow AGENTS.md.
- Read AGENTS.md (FSS Agent Operating System v2) and CI workflow in full.
- Created worktree `.worktrees/docs-nexsteps-home-build-plan-series` off
  `fss/master` (branched manually, not via the native worktree tool, because
  that tool's default base ref is `origin/master` and this repo's PR
  convention is `fss/master`).
- Wrote this ledger and the series README; opened PR1
  ([#265](https://github.com/FSS-Ltd/pathway/pull/265)); all 5 CI checks
  passed; squash-merged; deleted the branch and its worktree.
- Read every reference file Plan 01 needed to port precisely:
  `apps/mobile`'s `metro.config.js`, `tsconfig.json`, `app.config.ts`,
  `package.json`, `babel.config.js`, `_layout.tsx`, `bootstrap.ts`,
  `session-store.ts`, `auth0-client.ts`, `client.ts`, `space-resolver.ts`,
  `app-providers.tsx`, `env.ts`, `index.tsx`; `packages/mobile-core`'s
  `index.ts`/`space.ts`/`api-types.ts`/`package.json`; the primitives'
  `ui.tsx`/`screen.tsx`/`family-bottom-nav.tsx`/`tokens.ts`.
- Created worktree `.worktrees/feat-nexsteps-home-app-scaffolding` off
  fresh `fss/master` (rebased once, cleanly, after PR1 merged).
- Built the full Plan 01 scaffolding (file list above). Caught and fixed
  one real bug during local verification: a custom `transformIgnorePatterns`
  in `jest.config.js` silently replaced `jest-expo`'s own, breaking every
  test suite. Also added `react-dom`/`react-native-web` after discovering
  the `web` script would otherwise be dead on arrival (an existing,
  unfixed gap in `apps/mobile` this app doesn't want to inherit).
- Ran the full local verification suite listed above; everything green.
- Pushed and opened PR2
  ([#267](https://github.com/FSS-Ltd/pathway/pull/267)); confirmed
  concurrent PR #266 (`fix/tenant-transaction-pii-encryption`, a
  `packages/db` security fix) had no file overlap; all 5 CI checks passed;
  squash-merged; deleted the branch and its worktree.
- This entry: a small docs-only PR to keep this ledger truthful the moment
  each plan lands, rather than letting it drift stale until the next
  plan's PR closes it out.
- Opened PR3 ([#268](https://github.com/FSS-Ltd/pathway/pull/268)); all 5
  CI checks passed; a scheduled fallback wakeup squash-merged it and
  cleaned up its worktree/branch while this session was between turns.
- Created worktree `.worktrees/feat-nexsteps-home-fidelity-harness` off
  fresh `fss/master`; installed the pnpm workspace there for the first time
  (fresh worktree, no prior `node_modules`).
- Built Plan 02 in full: prototype font fix, the RN font-weight-synthesis
  bug found and fixed while doing that, the baseline capture script, and
  the diff harness (file-by-file detail in "What Plan 02 built" above).
- Hit and fixed three real bugs during local verification, not just typos:
  the review-bar-hides-its-own-Next-button hang, the top-level-await
  breaking `tsx`'s CJS transform of an imported module, and the exact-size
  pixelmatch check failing on a real 1px capture-tool artifact. Each is
  recorded above with the fix and why the fix is correct, not just that it
  stopped the immediate error.
- Verified the font fix visually in the Browser pane against a real dev
  server (`document.fonts` inspection, not just reading CSS) before trusting
  it, and verified the diff harness against a real mismatching screen
  before trusting it — reverted both temporary states (a running dev
  server, a non-empty checklist) before committing.
- Ran the full local verification suite listed above; everything green.
- Pushed and opened PR4 ([#271](https://github.com/FSS-Ltd/pathway/pull/271));
  all 5 CI checks passed; squash-merged; deleted the branch and its worktree.
- This entry: recorded PR4's merge and paused the series here rather than
  starting Plan 03 unilaterally — it requires a product/design decision
  (which flows get two-pane tablet treatment, and visual direction for
  designing them) that Plans 00-02 did not need, since those executed
  against an already-approved handoff plus the user's own answers from the
  original plan-mode session. Reported status to the user; awaiting reply.
- Opened PR5 ([#272](https://github.com/FSS-Ltd/pathway/pull/272)) to
  record PR4's merge; all 5 CI checks passed; a scheduled fallback wakeup
  merged it and cleaned up its worktree/branch while this session was
  between turns.
- User approved the Plan 03 candidate list as proposed and gave design
  direction: "keep the same feel... simple and functional so families do
  not have to be very techy and get the most out of the app functionality."
  Interpreted as: reuse approved phone content verbatim, one consistent
  layout pattern, no new interaction model (see Decisions table).
- Created worktree `.worktrees/feat-nexsteps-home-tablet-design` off fresh
  `fss/master`; ran `npm install` in the prototype (a fresh worktree has no
  `node_modules` of its own - this is a per-worktree step every plan
  touching the prototype needs, not a one-time setup).
- Read the exact block content of every master/detail screen pair needed
  (`week-home`/`day-detail`, `learning-history`/`log-detail`,
  `regulations-correspondence`/`-detail`, `thread-list`/`thread-detail`,
  `moderation-queue`/`moderation-report`) directly from
  `wireframes-data.ts`/`regulations-wireframes.ts` rather than
  reconstructing from memory, to reuse it verbatim as designed.
- Built the full Plan 03 tablet design pass (file list above). Verified the
  home-indicator SVG's existing responsive sizing would work at tablet
  width by checking its CSS and default SVG `preserveAspectRatio` behaviour
  before assuming it needed a code change - it didn't.
- Visually verified all 5 composites in the Browser pane against a live
  dev server before capturing any baseline. Noticed and fixed a design gap
  the reviewer would have caught: the review bar and fake cursor showing
  up as page furniture inside the first capture attempt (same class of
  issue Plan 02 already solved for phone, applied to the new device).
- Ran the full local verification suite; everything green. Reverted 152
  incidentally-regenerated phone baseline PNGs (clock-timestamp drift only,
  confirmed via diff, not a real change) back to their Plan 02 committed
  versions before staging.
- Pushed and opened PR6 ([#273](https://github.com/FSS-Ltd/pathway/pull/273));
  all 5 CI checks passed; squash-merged; deleted the branch and its
  worktree.
- This entry: recorded PR6's merge and paused the series again rather than
  starting Plan 04 unilaterally - it is blocked on two open product
  decisions (pricing, household modelling) that carry real commercial and
  migration-cost consequences if defaulted silently, unlike Plan 03's
  design-direction question. Reporting to the user; awaiting reply.
- User resumed the series ("continue on nexsteps home") without yet
  answering the two open decisions; asked both as one targeted question
  before proceeding (not a re-litigation - Plan 04 was already blocked on
  exactly these, per the previous entry). User resolved both: household
  model is one Org per household (matches the phase plan's recommended
  default); pricing is a Free/Paid two-tier model, Paid unlocking Community
  group creation, expanded AI feature usage, and more to be specified
  later, with no in-app checkout - an external link to nexsteps.dev only.
  Recorded both in `07-nexsteps-home.md`'s PR 7.2/7.4 sections and the
  Decisions table above.
- Created worktree `.worktrees/feat-nexsteps-home-h1-foundations` off fresh
  `fss/master`; confirmed via `git log fss/master --oneline` that Plan 04's
  target files (`schema.prisma`, `capability-maps.ts`) had no concurrent
  ACE-vertical changes since PR6 merged.
- Implemented Plan 04's mechanical scope: `Vertical.HOME_EDUCATION` in
  `packages/db/prisma/schema.prisma` (+ migration
  `20260801140000_add_home_education_vertical`) and
  `packages/types/src/vertical.ts`; granted its Learning capabilities
  (read/write/evidence/reports) at vertical level in
  `packages/platform/src/capability-maps.ts`, matching `ACE_SCHOOL`'s
  precedent - checked `learning.*`'s capability definitions first to
  confirm none carry a `requiredVertical` restriction that would silently
  block the grant (unlike `children.manage`, which is hardcoded to
  `NURSERY` only - deliberately left untouched, out of Plan 04's stated
  scope).
- Deliberately did **not** implement the pricing catalogue itself: read
  `packages/pricing/src/catalog.ts` and `apps/api/src/billing/billing-plans.ts`
  in full and found both shaped entirely around institutional Buy Now
  self-serve (`av30Included`, `maxSitesIncluded`, church/school feature
  bullet lists) - forcing a household Free/Paid entry into that shape
  would invent structure no real consumer needs yet, especially with the
  user's own "others I will clarify later" on the paid-tier feature list.
  Recorded as a deferred scope note in `07-nexsteps-home.md` rather than
  silently building the wrong shape or silently skipping the decision
  record.
- Ran `pnpm install` (fresh worktree), then `pnpm --filter @pathway/platform test`
  and `typecheck` - green immediately, confirming the completeness tests in
  `capability-maps.spec.ts` cover new vertical entries automatically via
  `Object.values(Vertical)`/`Object.keys(VERTICAL_CAPABILITIES)`.
- Ran `pnpm -r typecheck` across all 15 packages and found two real,
  necessary breaks from the new exhaustive `Vertical` member - not
  optional, not scope creep: `apps/web/lib/module-catalog.ts`'s
  `VERTICAL_FEATURES: Record<Vertical, string[]>` was missing an entry,
  and `apps/web/lib/configurator-checkout.ts`'s `verticalToSector` switch
  had no ending return for the new case. Traced whether `HOME_EDUCATION`
  could ever actually reach this institutional configurator before fixing
  either - confirmed via `apps/web/app/configure/state.ts`'s
  `VERTICALS_BY_ORG_TYPE` (a fixed, explicit map) that it never can - so
  `verticalToSector` throws for it rather than inventing a false legacy
  `Sector` mapping, and `VERTICAL_FEATURES` gets a real but unreachable
  entry (TypeScript requires the key to exist; the UI never renders it).
- Ran `pnpm -r lint` (clean) then `pnpm test:unit` (root, via turbo) and
  found two further real breaks the typecheck pass didn't catch, both in
  `apps/web`'s test suite: `configurator-assets.spec.ts` asserted an exact
  19-asset, 7-vertical configurator image manifest (now would be 20/8 with
  no real artwork for the 8th), and `configurator-state.spec.ts` asserted
  every `Vertical` is reachable through some org type in the configurator
  (now false by design). Fixed `CONFIGURATOR_IMAGE_PATHS` to exclude
  `HOME_EDUCATION` at the source (no configurator artwork exists for it,
  and it will never render there) rather than adding a placeholder asset;
  updated both tests plus `configurator-checkout.spec.ts`'s vertical-sector
  test to reflect the same intentional exclusion, and added a new test
  asserting `verticalToSector("HOME_EDUCATION")` throws.
- Same `test:unit` run surfaced a third failure with a different root
  cause: `apps/nexsteps-home/src/screens/registry.test.ts` failing on 2
  assertions, in a package this session's diff never touched. Confirmed
  via `git diff --stat fss/master` that zero files under
  `apps/nexsteps-home/` were part of this branch before investigating -
  ruling out this session's own change as the cause before looking
  further. Found the real cause: Plan 03 (PR #273) added 5
  tablet-two-pane composite screen IDs to
  `docs/NexStepsV2/nexsteps-home/screen-inventory.json` but never updated
  `apps/nexsteps-home/src/screens/registry.ts` or the test's hardcoded
  76-entry count to match - and PR #273's own CI had shown this exact test
  suite green, despite the mismatch already existing at that PR's merge
  (confirmed via `gh pr view 273 --json files`, which shows
  `screen-inventory.json` changed but `registry.ts` did not). Root cause:
  `registry.test.ts` reads `screen-inventory.json` live via `readFileSync`
  at test time, but that file lives outside `apps/nexsteps-home/` - if
  turbo's cache inputs for `nexsteps-home#test:unit` don't track it, a
  stale cached PASS from before Plan 03 could keep being served. Fixed by
  adding the 5 composite entries to `registry.ts` (each reusing its
  `listScreenId`'s phone route, since a tablet composite is the same
  screen rendered via `<TwoPane>` at tablet width, not a separate route)
  and updating both count assertions to 81. Flagged the turbo-cache-input
  gap itself as a candidate follow-up, not fixed here - separate concern
  from this plan, and no evidence yet of it masking anything else.
- Ran the full verification suite one more time after all fixes:
  `pnpm -r typecheck`, `pnpm -r lint`, `pnpm test:unit` (all 22 turbo
  tasks, including the 734-test `apps/api` suite) - everything green.
- Split the work into two commits (Plan 04's actual scope; the unrelated
  registry.ts fix), reviewed `git status --short` before staging, and
  reverted two incidentally-modified `.turbo/*.log` cache files (pre-existing
  tracked build-cache logs that only changed because this worktree's
  absolute path differs from whoever last committed them - not a real
  content change).
- Fetched fresh `fss/master` immediately before pushing; no drift, no
  conflicts with concurrent ACE work despite touching shared files.
  Pushed and opened PR7 ([#277](https://github.com/FSS-Ltd/pathway/pull/277));
  all 5 CI checks passed, including the three Postgres-backed jobs that
  specifically exercise the schema change (Organisation Role RLS,
  Permission Definition Database, System Role Seed Database Identity);
  squash-merged; deleted the branch and its worktree.
- This entry: recorded PR7's merge. Plan 05 (Setup flow) is next; no open
  product decisions flagged for it yet.
- Opened PR8 (ledger update) to record PR7's merge; all 5 CI checks passed;
  squash-merged; deleted the branch and its worktree.
- Started Plan 05. Before writing any screen, read every setup screen's
  full wireframe content (`prototypes/nexsteps-home/src/wireframes-data.ts`)
  and checked what backend each of the 9 screens actually needs, rather
  than assuming "9 screens" meant "9 UI files": `POST /children` already
  exists (covers `child-add`); Auth0's `createUser`/`verifyPassword`
  already exist server-side and match the wireframe's native email/password
  fields (not a hosted-redirect signup); but no endpoint creates an Org
  from scratch without a payment provider attached
  (`BuyNowService.checkout` defers org/user/tenant creation until a
  Stripe/GoCardless webhook confirms payment - wrong shape for a
  free-by-default household with no in-app checkout), and there is no
  task/activity/calendar API anywhere yet, which `learning-days` and
  `first-activity` both need.
- Put both findings to the user rather than improvising three new backend
  subsystems under the Plan 05 banner. Resolved: reorder Plan 06 (task/
  calendar) ahead of the rest of Plan 05, since building those two screens
  against local-only state now would mean redoing them once Plan 06 lands
  - the exact "hardcoded mockup" pattern this series has avoided
  throughout; and build the signup endpoint immediately regardless, since
  it doesn't depend on the reordering.
- Read `apps/api/src/billing/webhook.controller.ts`'s
  `createOrgFromPendingDetails` in full - the codebase's one existing
  "create Org + Tenant + User + roles from scratch" implementation - to
  reuse its exact pattern (transaction shape, model relationships, role
  assignments: `UserTenantRole: Role.ADMIN`, `UserOrgRole`/`OrgMembership`:
  `OrgRole.ORG_ADMIN`, `SiteMembership: SITE_ADMIN`) rather than inventing
  a new one. Confirmed `Auth0ManagementService.verifyPassword` only
  extracts the JWT `sub` for verification and doesn't return a usable
  session token, so this endpoint issues no session - the client logs in
  afterwards via the Auth0 SDK's `passwordRealm` grant (already enabled,
  per that same method's doc comment), reusing 100% of Plan 01's existing
  bootstrap/session machinery instead of building a parallel one.
- Created worktree `.worktrees/feat-nexsteps-home-signup` off fresh
  `fss/master`. Built `apps/api/src/nexsteps-home-signup/` (DTO, service,
  controller, module) implementing `POST /public/nexsteps-home/signup`;
  registered it in `app.module.ts`. Confirmed the global `ValidationPipe`
  (`whitelist`/`forbidNonWhitelisted`/`transform`, set in
  `config/api-bootstrap.ts`, not `main.ts`) enforces the DTO's
  `class-validator` decorators automatically - matched `SignupPreflightDto`'s
  existing pattern rather than second-guessing it.
- Deliberately made two choices differ from the webhook pattern rather than
  copying it blindly: Auth0 failure is fatal here (throws, rolling back the
  whole transaction) since interactive signup has no reason to tolerate a
  silent failure the way an async post-payment webhook does; and an
  `OrgVertical` row is created (the webhook pattern only sets the legacy
  `sector` field, which the schema's own comment says `Vertical` supersedes).
- Wrote service and controller tests mirroring `public-signup`'s existing
  jest-mock-the-whole-prisma-client pattern (9 new tests: happy path,
  duplicate-email conflict, Auth0-failure-is-fatal, slug-collision retry,
  and the controller's validation/whitelist/conflict-propagation behaviour).
- Ran the full verification suite: `pnpm -r typecheck`, `pnpm -r lint`,
  `pnpm test:unit` (all 22 turbo tasks, 743 `apps/api` tests including the
  9 new ones) - all green.
- Updated `README.md`'s series table and blocker list to reflect the
  reordering and the two resolved decisions (it had drifted - Plan 04's
  row still said "not started" after merging), and this ledger's status
  table/Next action. About to push and open the PR.
- Pushed and opened PR9 ([#280](https://github.com/FSS-Ltd/pathway/pull/280));
  all 5 CI checks passed; squash-merged; deleted the branch and its worktree.
- User asked to see the app running. Started `apps/nexsteps-home` via
  `expo start --web` in the Browser pane - first time this app's own web
  build (not the prototype) had been loaded with its real auth bootstrap
  running, and it crashed immediately:
  `ExpoSecureStore.default.getValueWithKeyAsync is not a function`.
  Root-caused it properly rather than papering over it: `expo-secure-store`
  has no web implementation at all (Keychain/Keystore have no web
  equivalent - confirmed via the package's own docs), and `apps/mobile` has
  the identical unguarded `SecureStore` calls (this file was ported from it
  verbatim in Plan 01) but never hit this because its own web target was
  already known broken before this series started - nothing had ever
  exercised this code path on web until now. Fixed with a
  `Platform.OS === "web"` branch falling back to `localStorage`; native
  behaviour unchanged. Also found and fixed a second, smaller Plan 01 gap
  while in there: `apps/nexsteps-home` never got its own `.gitignore`
  (unlike `apps/mobile`'s). Added 3 regression tests, a `launch.json` entry
  so the app can be previewed via the dev-server tooling going forward, ran
  the full verification suite (all green), opened and merged PR10
  ([#281](https://github.com/FSS-Ltd/pathway/pull/281)) - all 5 CI checks
  passed.
- Confirmed live in the Browser pane at 393×852 after the fix: the Welcome
  screen renders correctly (title/eyebrow/description matching the
  approved wireframe) on top of the real design tokens and primitives.
- Separately, this same push triggered two failures unrelated to NexSteps
  Home content but on the shared `master` branch: a transient Docker Hub
  registry timeout on a Postgres-backed CI job (re-ran it, passed), and a
  recurrence of an admin Vercel deploy failure from earlier the same day
  (`@types/react` version leaking from Vercel's incrementally-cached
  `node_modules` - the first occurrence had been fixed with a one-off
  forced rebuild, reverted after one clean deploy; this recurrence proved
  that was only a temporary fix, so `--force` was made permanent for
  admin/web/api's deploys instead). Both fixed and merged
  ([#282](https://github.com/FSS-Ltd/pathway/pull/282)); not NexSteps-Home
  work, recorded here only because it happened mid-session and blocked
  forward progress until resolved - full detail lives in that PR, not this
  ledger.
- Resumed Plan 06. Read all 8 screens' full wireframe content
  (`week-home`, `day-detail`, `activity-plan`, `activity-detail`, `today`,
  `quick-log`, `task-editor`, `calendar-editor`) to derive the data model
  precisely rather than guessing: three new concepts (a planned learning
  Activity, a household Task, a private CalendarItem), plus a link from
  the existing `LearningLog` back to the Activity it completes. Noticed a
  real, pre-existing schema gap while doing this: `LearningLog.subjectId`
  is singular, but both `quick-log` and `activity-plan`'s wireframes show
  multi-select subject chips - accepted as a known, pre-existing
  limitation (not fixed; `LearningLog` is shared with ACE/institutional
  verticals, well outside this series' scope) and used a scalar
  `subjectIds String[]` on the new `Activity` model instead, validated
  against `Subject` at the service layer rather than a DB relation, so the
  new model isn't forced into the same limitation.
- Found, while writing the migration, that every existing tenant-scoped
  table in this schema is protected by Row-Level Security *and* an
  actor-membership trigger (`app.require_learning_actor_membership`,
  checked against `SiteMembership`/`UserTenantRole`) - not just
  application-level `tenantId` filtering. Read `20251201173000_core_tenant_rls`
  and `20260720100000_add_learning_models` in full to understand exactly
  how `app.current_tenant_id()` gets set (a generic `set_config` call in
  `packages/db/src/index.ts`, applying automatically to any table with RLS
  enabled - no new application code needed) before deciding this was a
  hard requirement, not optional, for the three new tables to carry the
  same security guarantee as everything around them.
- Hand-wrote the migration SQL rather than using `prisma migrate diff`
  against a live database, specifically to avoid connecting a shadow-DB
  diff operation to the local Postgres containers already running on this
  shared machine (unclear ownership - other concurrent sessions may depend
  on them). Instead validated it the safe way: started a fully isolated,
  throwaway `postgres:16-alpine` container on an unused port, applied the
  *entire* migration history (including the new one) against it from
  scratch - succeeded - then ran `prisma migrate diff` between that
  now-migrated database and `schema.prisma` to confirm zero drift. Caught
  one real bug this way: `Task.assignedToUserId` is optional, so Prisma
  expects `ON DELETE SET NULL`, not the `RESTRICT` every other FK in the
  migration correctly uses (required fields) - fixed, re-validated clean.
  Tore down the throwaway container immediately after.
- Added 6 new capabilities (`family.activities.{read,write}`,
  `family.tasks.{read,write}`, `family.calendar.{read,write}`), granted at
  vertical level to `HOME_EDUCATION` alongside the existing `learning.*`
  grant. Found and updated a deliberate governance test
  (`capability-definitions.spec.ts`'s "exactly the 100 approved registry
  keys") that exists specifically to force new capabilities through an
  explicit, reviewed list rather than letting the registry drift silently
  - now 106.
- Built `apps/api/src/family-planner/` (DTOs, service, controller, module)
  mirroring `apps/api/src/learning/`'s established pattern exactly (zod
  validation, `CapabilityGuard`/`RequireCapability`, `CurrentTenant`,
  actor-id-from-request) rather than inventing a new one. Endpoints:
  `GET/POST /family-planner/activities`, `GET/POST /family-planner/tasks`,
  `POST /family-planner/tasks/:id/complete`,
  `GET/POST /family-planner/calendar-items`. No PATCH/edit endpoints yet -
  none of the 8 screens show an edit flow for an existing item, only
  create and complete, so none were built (YAGNI, not an oversight - add
  when a screen actually needs it).
- Wrote service tests (mirroring `learning.service.spec.ts`'s
  mock-the-whole-prisma-client pattern) and controller tests (mirroring
  `attendance.controller.spec.ts`'s direct-method-invocation + guard-
  override pattern, lighter than the full e2e/DB-backed style used for
  security-sensitive public endpoints like the signup one - this endpoint
  is authenticated and capability-guarded, e2e coverage can follow if a
  later plan finds a gap, not before). Found and fixed a real bug in my
  own first draft of these tests, not the source: the controller's
  `create*`/`completeTask` methods aren't `async`, so a validation failure
  throws synchronously rather than rejecting a promise - `expect(...).rejects`
  silently doesn't catch that; switched those 4 assertions to
  `expect(() => ...).toThrow(...)`.
- Ran the full verification suite: `pnpm -r typecheck`, `pnpm -r lint`,
  `pnpm test:unit` (all 22 turbo tasks, 759 `apps/api` tests including the
  16 new ones) - all green. About to push and open the PR.
- Pushed and opened PR10 ([#283](https://github.com/FSS-Ltd/pathway/pull/283));
  all 5 CI checks passed, including the Postgres-backed jobs exercising
  the new migration/RLS triggers; squash-merged; deleted the branch and
  its worktree. Confirmed the resulting production deploy (including the
  real database migration) succeeded before moving on.
- Started Plan 06's screens. Read every current route file and primitive
  before writing anything: only tab-landing placeholders existed
  (`week/index.tsx`, `today/index.tsx`), nothing else - no sub-routes, no
  `children`/`learning` API domain modules in `apps/nexsteps-home` yet,
  and `FieldGroup` (the only "fields" primitive from Plan 01) turned out
  to be display-only (label/value text, no `TextInput`) - fine for
  detail screens, useless for the 4 create-form screens this plan
  actually needs. Built `FieldInput` as its editable counterpart (same
  visual container, real `TextInput`) rather than repurposing `FieldGroup`
  incorrectly or duplicating its styles ad hoc per screen.
- Deliberately chose chip-based date/time selection over a native date
  picker (`upcomingDayOptions`/`TIME_OPTIONS`/`combineDateAndTime` in the
  new `src/lib/date-options.ts`) - no native dependency with the
  react-native-web compatibility risk that category of package carries,
  and the approved wireframe already uses exactly this chip pattern on
  the adjacent (Plan 05) first-activity screen, so it's not an invented
  interaction, just reused from elsewhere in the same design.
- Found, while wiring `quick-log`'s "Save learning log" primary action to
  the real `POST /learning/logs` endpoint, that `LearningLog` had no way
  to link back to the `Activity` it completes even though the H3 migration
  added the `activityId` column - Plan 06's backend PR added the schema
  column but never wired the API's DTO/service to accept or return it.
  Extended `apps/api/src/learning/dto/index.ts` and `learning.service.ts`
  (added `activityId` to the create schema, the select projection, and the
  create call) - a small, necessary extension of an existing module, not
  scope creep, since without it the new FK is structurally present but
  functionally dead.
- Built all 8 screens (`week-home`, `day-detail`, `activity-plan`,
  `activity-detail`, `today`, `quick-log`, `task-editor`,
  `calendar-editor`) against real TanStack Query hooks
  (`src/lib/queries/family-planner.ts`) wired to the real API - no
  hardcoded/mocked screen content, matching this series' standing
  principle. Every screen distinguishes loading/empty/error states
  explicitly (design-system.md's mandated states), reusing `NoticeCard`
  for both empty and error rather than inventing new primitives for
  either.
- Verified visually in the Browser pane, not just by typecheck/lint/test.
  `preview_start` operates on the main checkout's fixed working directory,
  not this session's worktree, and git refuses to check out a branch
  that's already checked out elsewhere - so with the branch already live
  in this worktree, temporarily copied just the frontend files into the
  main checkout for visual inspection only (no git operations there,
  nothing committed), reviewed every screen at 393×852, then removed the
  copies and confirmed `git status` was clean again before finishing.
  Full authenticated data-flow (real activities loading) isn't practical
  to verify this way - no Auth0 session exists in that browser context -
  but this did verify structure, primitives, and, concretely, the
  loading/error/empty state rendering, since an unauthenticated session
  reliably exercises the error path.
- That verification pass caught two real bugs no test would have caught,
  since nothing had exercised these components against a real (or
  really-failing) query before: `quick-log` and `activity-plan`'s
  children-picker logic showed "No children yet" for a genuine API
  *error* (401, network failure) exactly the same as a real empty list -
  misleading, and a real violation of design-system.md's distinct
  loading/empty/error states. `activity-detail` and `day-detail` had the
  same class of bug (an error silently read as "not found" / "nothing
  planned"). Fixed all four by explicitly checking `isError` before
  falling through to the empty-state branch, and re-verified each fix
  live before considering it done.
- Added `src/lib/date-options.test.ts` (10 tests) for the date arithmetic
  helpers - the highest-risk pure logic in this change, and the one class
  of bug (off-by-one days, timezone slips) unit tests catch far more
  reliably than a screenshot. Left the new API domain modules
  (`family-planner.ts`, `children.ts`, `learning.ts`) untested, matching
  this app's existing convention - `auth.ts`/`platform.ts`/`health.ts`
  don't have dedicated tests either; they're thin pass-throughs exercised
  indirectly via the screens and `bootstrap.test.ts`.
- Ran the full verification suite one more time after all fixes:
  `pnpm -r typecheck`, `pnpm -r lint`, `pnpm test:unit` (all 22 turbo
  tasks) - all green. About to push and open the PR.
