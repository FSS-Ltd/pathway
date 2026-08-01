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
**Current phase:** Executing PR1 (Plan 00 — docs)

---

## Status snapshot

| # | Plan | Status | Branch | PR | Notes |
|---|---|---|---|---|---|
| 1 | 00 — series docs | in progress | `docs/nexsteps-home-build-plan-series` | not yet opened | this commit |
| 2 | 01 — app scaffolding | not started | `feat/nexsteps-home-app-scaffolding` | — | starts after PR1 merges |
| 3-15 | 02-14 | not started | — | — | — |

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

## Next action

Finish PR1 (this docs change): open against `fss`, confirm CI green, merge.
Then start PR2 (Plan 01 scaffolding) from a fresh `fss/master`, following
the full Plan 01 specification in the series plan file / this ledger's
successor entries once written.

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
- Writing this ledger and the series README now (PR1 in progress).
