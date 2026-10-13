# Compliance delivery progress

Plan: [README.md](README.md), [DELIVERY.md](DELIVERY.md).
Updated: 2026-10-13. Base repository: `FSS-Ltd/pathway`; branch: `master`.

## Current step: 1.3

**State: PR #627 open; CI running; not complete.** Steps 1.1 and 1.2 are merged.
No later step has started and no country pack is published.

| Evidence               | Value                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Scope                  | Compliance navigation and Checks & Training, permissions, encryption, immutable history and integration tests       |
| Branch                 | `feature/compliance-checks-training`                                                                                |
| Verified starting base | `72d46b6367a7e30afa122a533b4f92f4a8002fc0`                                                                          |
| Predecessor            | [PR #626](https://github.com/FSS-Ltd/pathway/pull/626), host-confirmed merged 2026-10-13T21:15:32Z                  |
| PR / revision / CI     | [PR #627](https://github.com/FSS-Ltd/pathway/pull/627); head `b2770cc1c43bbccbefef920363e28d6e533b40c2`; CI running |
| Merge state            | Unmerged; no completion claim                                                                                       |
| Next permitted action  | Verify 1.3, raise its PR, verify latest CI and merge before 1.4                                                     |

## Step 1.1 verification and merge

Head `e9b02a1c11d10901a02abd9e7b668e167a04f70c`; CI checkout logs confirmed
test-merge `e4de95a7004784a00f1f6471c05f05d09143f6d4`. All eight applicable
checks passed: Typecheck/Lint/Unit, Integration, System Role Seed Database
Identity, Permission Definition Database, Organisation Role RLS, CodeQL actions,
CodeQL JavaScript/TypeScript and aggregate CodeQL. GitHub confirmed merge commit
`049abc31c4835067e15316e815b3f2b679d79c83`. Step 1.1 is complete.

## Step 1.1 local verification

Checked on 2026-10-13:

- `prettier --check 'docs/NexStepsV2/compliance/*.md'`: passed for all six new
  Markdown files, using the repository-installed Prettier binary from the original
  checkout. Existing rule/index formatting was preserved; only additions inspected.
- `git diff --check`: passed. Reopened all 11 changed/new files and reviewed the
  complete documentation and CSV contents against the approved plan.
- `python3` standard-library CSV/link assertions: passed. Verified 31 unique packs,
  sequential 2.01–2.31 IDs, first five jurisdictions in agreed order, exact EU-27
  country set, 186 unique jurisdiction/sector pairs, all 1,488 cells and 31 regional
  inventories NOT_REVIEWED, 14 relative documentation links resolving, and the
  AGENTS rule/BUILD reference present.
- Fresh independent branch review: no critical/important findings. One minor
  suggested qualifying the exact user-requested rule; retained verbatim and recorded
  its applicable-check interpretation below. No implementation checks are waived.
- Reopened DfE registration, DBS employer guidance, ICCE registration and Eurypedia
  discovery sources. Access checks are recorded in SOURCES.md, not legal sign-off.

Runtime typechecks, application lint, unit/integration tests, Prisma validation,
permission-definition checks, builds and desktop/mobile flows are not applicable
to this documentation-only step. No application code, schema, UI or runtime
catalogue is changed. Required repository CI remains a merge gate.

## Decisions and boundaries

- The user-supplied FSS v3 instructions and approved plan govern this delivery.
  The remote base still contains older v2 rule documents. Preserve those files
  except the requested verification addition; preserve the user's unrelated local
  v3 replacements in the original checkout. Do not copy or commit unrelated edits.
- The approved plan's per-step PR/CI/merge gate takes precedence over continuous
  execution guidance. Use this repository-local progress record as the durable
  ledger; do not mark locally verified work complete before merge.
- The requested Codex rule is retained verbatim. Its applicable-check scope means
  persistence/progress/tenant tests apply when those implementations change, not
  to research prose alone. All mandated implementation checks remain in DELIVERY.md.
- Step 1.1 is documentation only. Runtime catalogue schema, taxonomy, migrations
  and feature implementation remain in their later gated steps. No TDD claim is
  made for prose; use structural/format/link checks and a branch review instead.
- Source discovery is not legal review. All 1,488 initial sector/topic coverage
  cells and all regional inventories remain NOT_REVIEWED.

## Subsequent steps

Steps 1.4–1.6 and 2.01–2.31 are **planned, not started**, as specified in
DELIVERY.md and jurisdictions.csv. Before starting each, refresh the host evidence
for its predecessor and record the merged base. UI rollout and production
deployment remain separate from documentation and require their own authorization.

## Evidence recording convention

When raising the PR, replace pending evidence with its real URL and link immutable
head/check runs in the PR record. For each checked revision record the latest head
SHA, required test-merge/queue revision if any, every applicable check conclusion
and required-review state. Do not count absent, pending, skipped or stale checks
as passing. After merge, record GitHub's merged state and actual merge commit here
or in the linked PR record, then carry that evidence into the next step's update.
A pre-merge progress commit cannot prove its own future merge.

## Review scope disposition

The reviewer did not assess legal provisions, runtime behaviour or host CI/merge:
these are correctly outside documentation-only implementation and remain unapproved.
The parent independently verified the starting SHA and four discovery page accesses.
Legal/provider applicability review and all runtime acceptance scenarios remain
mandatory in the relevant later steps. No source or feature is certified by this PR.

## Step 1.1 merge and step 1.2 start

GitHub confirmed #624 MERGED at 2026-10-13T20:14:10Z, merge commit
`049abc31c4835067e15316e815b3f2b679d79c83`. All eight checks passed on head
`e9b02a1c11d10901a02abd9e7b668e167a04f70c`; CI checkout logs confirm test-merge
`e4de95a7004784a00f1f6471c05f05d09143f6d4`. Step 1.1 is complete.

Step **1.2 implementing** on `feature/learning-centres-provisioning`, starting from
that verified merge. The user explicitly authorizes raising and merging PRs through
the full plan after checking the work and satisfying each step's CI/review gate.
The original checkout remains untouched.

Current-base inspection found the live configurator now uses institutional public
checkout with a frozen setting and payment-confirmed activation. Cover this path
as well as preserving legacy checkout behaviour; do not re-enable retired billing.
The additive migration introduces only one sector and two vertical enum values;
existing records are unchanged. Validate server combinations and preserve true
Learning Centre identity while reusing school screens and capabilities.

## Step 1.2 implementation and verification

- One new sector and two vertical enum values; no existing data rewritten.
  The shared type mapper preserves Learning Centre identity while selecting ACE
  School or State School screens/assets/capabilities. Public means non-ACE only.
- Current institutional checkout stores sector and vertical in the pending order,
  validates consistency against the frozen setting and creates the OrgVertical in
  the provisioning transaction. Legacy sector-only orders still work; retired
  checkout remains disabled. Existing pricing/module policy is unchanged.
- Settings limits choices to the existing sector (master preview exception).
  ACE service gates recognize the new ACE type without widening roles or tenants.
- Added checkout/controller, pending-identity, settings, capability and UI mapping
  tests plus real database checkout→paid webhook→activation tests for both types.
- Test setup now releases its cached Prisma client after global setup. In-band
  Jest previously inherited an outer-realm client, making expected duplicate-event
  errors fail `instanceof`. Real runtime reproduction confirmed billing logic was
  correct; the new replay test remains intact.

Commands use repository pnpm 9.7 via `PATH=/tmp/compliance-bin:$PATH corepack pnpm`
(the host default pnpm 11 is incompatible with nested repository scripts).
Disposable PostgreSQL 16 runs only at localhost:55439, database
`pathway_test_e2e`, schema `app`; no production data or service was used.

| Check                                       | Result                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API unit suite                              | Final pre-commit run: 212 suites / 1,504 tests passed; workers 45 and auth 12 tests also passed |
| Web unit suite                              | 21 suites / 160 tests passed on final rerun                                                     |
| Admin unit suite                            | Passed (exit 0); UI mapping assertions cover both Learning Centre screen families               |
| Platform unit suite                         | 180 passed; five opt-in destructive database-smoke tests skipped locally                        |
| Workspace `pnpm -r typecheck`               | Passed after generated enums and settings prop correction                                       |
| Root lint and explicit admin app/lib ESLint | Passed; changed admin test inputs made precisely typed                                          |
| Changed-file Prettier check                 | Passed                                                                                          |
| `prisma validate` / `prisma:generate`       | Passed using disposable database configuration                                                  |
| `permission-definitions:check`              | Passed; registry drift zero                                                                     |
| API / admin builds                          | Passed; admin uses local API URL and synthetic Clerk publishable key for static compilation     |
| Web build                                   | Passed                                                                                          |
| Database integration                        | Final full run: 91 suites / 568 tests passed, including both new provisioning/replay cases      |
| Independent branch review                   | No critical/important findings; saved single-choice configuration edge fixed and exercised      |

Browser inspection used the running web application with intercepted pricing and
checkout responses, plus the actual admin settings component and compiled admin
styles in a temporary local harness. External Stripe/identity services were not
contacted. Desktop 1440×1000, mobile 390×844, keyboard activation and 200% text
were inspected. Both types reach checkout, retain the exact request type after
reload, preserve password exclusion, and recover from a controlled checkout
failure. Missing type cannot advance. A malformed saved Church setting now
returns to configuration. Settings exposes only the two Learning Centre choices;
keyboard Save updates the label in the harness. Native select text may truncate
at 200% on a narrow screen; its full value remains in the current-type label.

The enlarged-text check found navigation-button overflow; `flex-wrap` fixed it
and the repeated overflow check passed. No authenticated live-provider browser
session was available; permission and persistence boundaries were exercised by
API/database tests. This is not an end-to-end claim against real Stripe/Clerk.

Initial local check failures were corrected: missing RLS role environment,
missing Prisma URL, missing admin API/Clerk build configuration, and test-realm
Prisma lifecycle. An existing ACE notice integration test intermittently reports
`socket hang up`; isolated rerun passed 10/10 without application changes. Final
aggregate rerun passed all 91 suites and 568 tests before opening the PR.

The review's formatting-only concern is retained as a minor reviewability cost:
automatic approval review rejected a proposed whole-file restoration, so no
restoration occurred. The formatting passes the repository formatter. Later
compliance features, country packs and production deployment remain outside 1.2.

Final verification: web/admin/API builds, workspace typechecks, all 16 root lint tasks, explicit admin lint, changed-file Prettier, schema validation, registry drift check and final diff check passed. Web build also required the synthetic Clerk build key. Review findings are resolved or explicitly dispositioned above.

## Step 1.2 host evidence

Initial head `496b54bf1403c8804d058b18345d8ddb522b8d12` passed all eight checks
on tested merge `77a3a2dabe0349ebfb7bf04d8c9b43279b7d656c` in
[CI run 38465903055](https://github.com/FSS-Ltd/pathway/actions/runs/38465903055).
Master advanced to `3bf7af04c4737fc330ee1d12c612c4a9631ac067` during that run
(notice-inbox keyboard focus fix). Merged that base without conflicts; admin unit
suite/build and all pre-commit checks passed again. Current head
`93f983cec14045b3a2dc7c2dffc7cae3dd8f08a8` has fresh
[CI run 38467377848](https://github.com/FSS-Ltd/pathway/actions/runs/38467377848)
in progress. Old-head CI does not substitute for current-head checks.
No step 1.3 implementation has started.

## Step 1.2 final host evidence and 1.3 start

GitHub confirms PR #626 MERGED at 2026-10-13T21:15:32Z, merge commit
`72d46b6367a7e30afa122a533b4f92f4a8002fc0`. Final head
`93f983cec14045b3a2dc7c2dffc7cae3dd8f08a8` passed all eight applicable checks;
CI run [38467377848](https://github.com/FSS-Ltd/pathway/actions/runs/38467377848)
checked test-merge `baa266050d73162bf3809315f637a6758733c04e`.
CodeQL run [38467369539](https://github.com/FSS-Ltd/pathway/actions/runs/38467369539)
and aggregate CodeQL passed. Step 1.2 is complete. Its earlier pending evidence
above records the pre-merge state and is superseded by this host verification.

The optional permission-definition database suite was subsequently run against
an isolated disposable database: all nine tests passed, including the five that
were skipped in the ordinary unit run. No production database was used.

Step 1.3 started from the verified merged commit above. The latest user explicitly
authorized raising and merging the plan PRs after verification. No production
deployment is authorized by that instruction.

## Step 1.3 local implementation and verification

Implemented Compliance navigation, preserving existing safeguarding route/access
rules, and a role-specific Checks & Training register. The typed API derives site
and actor from authentication; administrator/safeguarding-lead defaults grant the
new institutional permissions without extending them to Home or ordinary adults.
Additive tables have forced RLS, composite ownership constraints, encrypted free
text/snapshots and immutable revisions. Edits use optimistic versions and atomic
history/audit writes. Archived records remain readable, and restricted paginated
exports are audited. [CHECKS-OPERATIONS.md](CHECKS-OPERATIONS.md) records the data
lifecycle, rollout prerequisites and terminology sources.

Checked locally on 13 October 2026 using repository pnpm 9.7 via Corepack:

| Command / inspection                                                                                                                                             | Result                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                                                                                                                                 | All 16 workspace tasks passed                                                              |
| `pnpm lint`                                                                                                                                                      | All 16 workspace tasks passed                                                              |
| Explicit admin ESLint on changed `app`, `components/compliance`, and `lib` files                                                                                 | Passed; does not rely on the admin script's `src` glob                                     |
| Explicit API ESLint on `src/compliance`, module and audit additions                                                                                              | Passed                                                                                     |
| `pnpm --filter @pathway/api test:unit --runInBand compliance`                                                                                                    | 215 suites / 1,532 tests passed (worktree path matched the full unit suite)                |
| `pnpm --filter @pathway/api test:integration --runInBand`                                                                                                        | 93 suites / 576 tests passed against disposable PostgreSQL                                 |
| Final `test:integration --runInBand --runTestsByPath src/compliance/tests/compliance.e2e.spec.ts src/compliance/tests/compliance-personnel.database.e2e.spec.ts` | 2 suites / 8 tests passed after review fixes                                               |
| `pnpm --filter @pathway/admin test`                                                                                                                              | Full admin suite passed; new register test included in package command                     |
| Final focused `tsx components/compliance/checks-register.test.tsx` with explicit test API environment                                                            | Passed, including pending-history/save regression                                          |
| DB, platform and auth unit suites                                                                                                                                | Passed: 63, 183 and 13 tests respectively; ordinary commands skip existing opt-in DB tests |
| Opt-in `permission-definition-database.integration` on separate disposable database                                                                              | All 9 tests passed                                                                         |
| `pnpm permission-definitions:check` against migrated test database                                                                                               | Registry drift zero                                                                        |
| Prisma validation/generation and fresh-database migration                                                                                                        | Passed                                                                                     |
| Admin, web and API production builds                                                                                                                             | Passed; admin/API rebuilt after review fixes                                               |
| Prettier check of every changed/new TS/TSX/JSON/Markdown file; `git diff --check`                                                                                | Passed                                                                                     |
| Independent whole-branch review and narrow fix verification                                                                                                      | Two P2 findings fixed; no remaining findings                                               |

The normal register flow now audits the IDs of returned records, since opening an
editor from a list otherwise bypassed detail-read auditing. The API regression
checks the actual HTTP response, audit metadata and `private, no-store` header.
An interrupted history request now resets loading on record-version changes;
the regression failed before the fix and passed afterward. The same interleaving
was exercised in a real browser by delaying history, saving, then loading history
again successfully.

Actual component/browser inspection used the existing compiled admin CSS and
components in a local fixture: desktop 1440×1000, mobile 390×844, 200% root text,
keyboard focus into details and back to the initiating row, save/verify, history,
archive confirmation and retry/conflict states. Mobile rows and primary-action
contrast were corrected. No horizontal overflow was observed. Screenshots are
local task artifacts under `/tmp/compliance-ui-preview/`, not production data.
This browser fixture does not claim a signed-in Clerk end-to-end session; the
separate HTTP tests use the real AppModule, test authentication, permission
resolution and PostgreSQL to exercise persistence and authorization boundaries.

API tests cover read-only/ordinary-user denial, cross-site reads and writes,
foreign subject links, injected scope, concurrent saves (one success/one 409),
audit-failure rollback, immutable revisions, raw encryption, departed subject
history, archive retention and restricted exports. Existing safeguarding/Home
suites remain green. Checklist applicability/progress, medical views, agreements
and country packs are not implemented or certified in this step.

Builds use `NEXT_PUBLIC_API_URL=http://localhost:3333` and the synthetic test Clerk
publishable key; initial missing build-time configuration was corrected before
passing reruns. Prisma validation used the disposable database URL. No production
credentials, deployment, external certificate check or user communication occurred.

Local verification is not step completion. Raise the step's PR, verify current
revision CI and host-confirmed merge before starting 1.4.

## Step 1.3 PR and current gate

[PR #627](https://github.com/FSS-Ltd/pathway/pull/627) was raised after local
verification and commit hooks passed. Current head:
`b2770cc1c43bbccbefef920363e28d6e533b40c2`. CI run
[38472359363](https://github.com/FSS-Ltd/pathway/actions/runs/38472359363) and
CodeQL run [38472356500](https://github.com/FSS-Ltd/pathway/actions/runs/38472356500)
are running. No merge has occurred; 1.4 remains unstarted. Commit hooks also passed
workers (11 suites / 45 tests) and auth (3 suites / 13 tests). The existing workers
suite reported an open-handle/forced-worker-exit warning despite passing; no worker
implementation changed in this step.

### Step 1.3 CI correction

The first host run exposed stale explicit grant expectations in
`packages/db/src/__tests__/system-role-seed-command.spec.ts`: the approved
Organisation Head, Site Lead and Safeguarding Lead arrays omitted the two new
compliance permissions. Their intended templates were correctly seeded. Updated
only those six expected entries; ordinary staff/parent/student expectations stay
unchanged. No application permission behavior was altered by this correction.

Ran the exact CI protected-seed proof against a newly migrated disposable database
on a separate PostgreSQL container: all 3 suites / 13 tests passed. DB typecheck,
explicit test-file ESLint, Prettier and diff inspection passed. The failed initial
run is retained as evidence, not counted as a passing gate. A fresh revision must
pass all required host checks before merge. Initial CI checkout logs verified
test-merge `743f6589c2d66c3f6bf27e81a7cb21f1d57b1ff3` for head `b2770cc1…`.
