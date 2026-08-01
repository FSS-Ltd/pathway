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
**Current phase:** Starting Plan 02 (fidelity harness + phone baselines)

---

## Status snapshot

| # | Plan | Status | Branch | PR | Notes |
|---|---|---|---|---|---|
| 1 | 00 — series docs | **merged** | `docs/nexsteps-home-build-plan-series` | [#265](https://github.com/FSS-Ltd/pathway/pull/265) | squash-merged, branch deleted |
| 2 | 01 — app scaffolding | **merged** | `feat/nexsteps-home-app-scaffolding` | [#267](https://github.com/FSS-Ltd/pathway/pull/267) | squash-merged, branch deleted; `apps/nexsteps-home` now exists on `master` |
| 3 | 02 — fidelity harness + phone baselines | not started | — | — | next up |
| 4-15 | 03-14 | not started | — | — | — |

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

## Open blockers

See `README.md` "Known blockers" for the full list with sources. Summary:

1. Prototype font mismatch — fix before Plan 02 captures baselines.
2. Token scale gap — resolved by Plan 01's app-local token layer.
3. `apps/api` JWT signature not verified — inherited, flagged, not this series' fix.
4. Mobile clients don't send the active-site cookie — rely on
   `User.lastActiveTenantId` fallback.
5. Two open product decisions (pricing, household modelling) block Plan 04.
6. **Graphify pre-change gate could not be satisfied for PR1.**
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

## Conflict watch

See `README.md` "Conflict watch" section. At series start, `fss/master` had
multiple active `feat/ace-*` branches with recent force-pushes
(`feat/ace-access-me-permissions`, `feat/ace-nav-typed-permissions`,
`feat/ace-nexsteps-notices-attendance`, `feat/ace-permission-cutover`).
Plans 01-03 do not touch any file ACE work touches. **Before opening any PR
from Plan 04 onward**, diff the branch against fresh `fss/master` and check
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

## Next action

Start Plan 02 (fidelity harness + phone baselines) from a fresh
`fss/master`. First job: fix the prototype font mismatch (blocker 1) in
`prototypes/nexsteps-home` before capturing any baseline — a baseline
captured against the wrong fallback font would be worthless. Then add the
Playwright/pixelmatch tooling deferred out of Plan 01's `package.json`,
capture all 76 screens × {iPhone, Pixel} from the prototype, and wire the
`apps/nexsteps-home` web-export side of the diff.

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
