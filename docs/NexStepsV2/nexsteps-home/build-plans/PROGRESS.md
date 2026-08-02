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

**Last updated:** 2026-08-01
**Updated by:** Technical Agent (Claude), this session
**Current phase:** Household signup endpoint (Setup's `account-create` backend) implemented, verified locally; PR about to open. Sequencing changed: Plan 06 (Week/Today/tasks/calendar) now comes before the rest of Plan 05 — see README.md's sequencing note

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
| 9 | household signup endpoint (Setup's `account-create` backend) | in progress | `feat/nexsteps-home-signup` | not yet opened | code complete, verified locally, about to push |
| 10-17 | 06, then 05 (remaining 8), then 07-14 | not started | — | — | — |

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

Investigating Plan 05 (Setup flow, H2) surfaced that it isn't just 9
screens of UI: `account-create` needs a real signup endpoint (no existing
one fits — the only "create an Org from scratch" path is
`BuyNowService.checkout`, tightly coupled to Stripe/GoCardless payment,
which doesn't fit a free-by-default household with no in-app checkout),
and `learning-days`/`first-activity` depend on task/calendar backend that
doesn't exist yet and is actually Plan 06's scope, not Plan 05's. Put both
findings to the user before building anything:

- **Sequencing:** build Plan 06 (Week/Today/tasks/calendar) before the
  rest of Plan 05, rather than building `learning-days`/`first-activity`
  against local-only state now and redoing them once Plan 06 lands.
- **Signup endpoint:** build it now, since it's independent of the Plan
  06/05 reordering — `account-create` cannot function without it either
  way.

**Household signup endpoint is implemented and verified** (branch
`feat/nexsteps-home-signup`): `POST /public/nexsteps-home/signup` creates
the Auth0 user, then transactionally creates a `HOME_EDUCATION` Org, a
single Tenant, and the parent's `ORG_ADMIN`/`ADMIN`/`SITE_ADMIN` role rows
— mirrors `apps/api/src/billing/webhook.controller.ts`'s
`createOrgFromPendingDetails` (the codebase's existing org+user+role
creation pattern) minus the payment-deferral wrapper that pattern needs
and this endpoint doesn't. No session is issued by this endpoint — the
client logs in afterwards through the existing Auth0 flow already ported
in Plan 01 (`passwordRealm` via the Auth0 SDK, not a hosted-redirect
webview, so the UX stays fully in-app). Household name defaults from the
email's local part (e.g. "sarah@..." → "Sarah's Family"; editable later in
Family settings) since the wireframe collects only email + password, no
org-name field. Plan code defaults to a literal `"HOME_FREE"` string (the
real pricing catalogue is still deferred, per Plan 04's PR).

**Next: Plan 06** (Week, Today, tasks, calendar — H3, 8 screens), now
ahead of the remaining 8 Setup screens in build order.

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
