# Compliance delivery progress

Plan: [README.md](README.md), [DELIVERY.md](DELIVERY.md).
Updated: 2026-10-13. Base repository: `FSS-Ltd/pathway`; branch: `master`.

## Current step: 1.2

**State: locally verified; preparing PR; not complete.** Step
1.1 is merged. No step 1.3 work has started and no country pack is published.

| Evidence               | Value                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Scope                  | Learning Centre taxonomy, school screen/capability reuse, configurator and payment-confirmed provisioning |
| Branch                 | `feature/learning-centres-provisioning`                                                                   |
| Verified starting base | `049abc31c4835067e15316e815b3f2b679d79c83`                                                                |
| Predecessor            | [PR #624](https://github.com/FSS-Ltd/pathway/pull/624), host-confirmed merged 2026-10-13T20:14:10Z        |
| PR / revision / CI     | Pending local verification and PR creation                                                                |
| Merge state            | Unmerged; no completion claim                                                                             |
| Next permitted action  | Finish checks, raise 1.2 PR, verify latest CI and merge; only then start 1.3                              |

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

Steps 1.3–1.6 and 2.01–2.31 are **planned, not started**, as specified in
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

| Check                                       | Result                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| API unit suite                              | 212 suites / 1,496 tests passed before final added settings tests; final targeted 34 tests passed |
| Web unit suite                              | 21 suites / 160 tests passed on final rerun                                                       |
| Admin unit suite                            | Passed (exit 0); UI mapping assertions cover both Learning Centre screen families                 |
| Platform unit suite                         | 180 passed; five opt-in destructive database-smoke tests skipped locally                          |
| Workspace `pnpm -r typecheck`               | Passed after generated enums and settings prop correction                                         |
| Root lint and explicit admin app/lib ESLint | Passed; changed admin test inputs made precisely typed                                            |
| Changed-file Prettier check                 | Passed                                                                                            |
| `prisma validate` / `prisma:generate`       | Passed using disposable database configuration                                                    |
| `permission-definitions:check`              | Passed; registry drift zero                                                                       |
| API / admin builds                          | Passed; admin uses local API URL and synthetic Clerk publishable key for static compilation       |
| Web build                                   | Passed                                                                                            |
| Database integration                        | Final full run: 91 suites / 568 tests passed, including both new provisioning/replay cases        |
| Independent branch review                   | No critical/important findings; saved single-choice configuration edge fixed and exercised        |

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
