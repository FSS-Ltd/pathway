# Compliance delivery progress

Plan: [README.md](README.md), [DELIVERY.md](DELIVERY.md).
Updated: 2026-10-17. Base repository: `FSS-Ltd/pathway`; branch: `master`.

## Current step: 2.02 Wales — research and implementation

**PR #657 is merged, deployed and checked on the live portal.** Catalogue 1.2.0
contains 154 sources, 106 current actions (108 retained requirement revisions)
and 48 explicitly partial England cells. Published coverage is not a claim that
all England local, specialist or provider obligations have been reviewed.

| Evidence              | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Scope                 | England national detail and modern Overview & Tracker, plus the verified export audit transaction correction          |
| PR / code revision    | [PR #657](https://github.com/FSS-Ltd/pathway/pull/657), `0759cd950e54bd87903d7238f9f425191df5e681`                    |
| CI                    | All eight checks passed; CI 39045945470 and CodeQL 39045942963                                                        |
| Checked test merge    | `e0112ac91b4d8314950252a0f49fe2ae181c0bd8` against master `52fafdf4f2f57986c93eab1a19009324537e84ad`                  |
| Host-confirmed merge  | `9337c8450e583d3d59193b068d9cc8f00585cff6`, merged 2026-10-17T15:52:57Z; file tree equals checked test merge          |
| Release authority     | User explicitly approved merging/deploying #657, live portal verification, then continuing remaining packs            |
| Production workflow   | [39046994895](https://github.com/FSS-Ltd/pathway/actions/runs/39046994895), all four jobs SUCCESS on the merge commit |
| Next permitted action | Verify Wales 1.3, raise its PR after local checks; retain England gaps and keep Scotland gated                        |

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

Steps 2.01–2.31 are **planned, not started**, as specified in
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

### Step 1.3 refreshed CI

Correction head `559b7ae5355805c1527a77fcc70df5b30d44c708` is pushed to PR #627.
Commit hooks passed again. Fresh CI run
[38473567651](https://github.com/FSS-Ltd/pathway/actions/runs/38473567651) and
CodeQL run [38473563698](https://github.com/FSS-Ltd/pathway/actions/runs/38473563698)
are running. Earlier passing checks are not used to waive the new revision's gate.

## Step 1.3 final host evidence and 1.4 start

GitHub confirms PR #627 MERGED at 2026-10-13T21:59:16Z, merge commit
`64ba6eecca4f625118578706df8d7d10f6aa3ebb`. Final head
`559b7ae5355805c1527a77fcc70df5b30d44c708` passed all eight applicable checks
in CI run [38473567651](https://github.com/FSS-Ltd/pathway/actions/runs/38473567651),
CodeQL run [38473563698](https://github.com/FSS-Ltd/pathway/actions/runs/38473563698)
and aggregate CodeQL. Checkout logs confirmed tested merge
`9e885030b03f72aee6d618826d212c94eda9a057`. Earlier pending entries above
are historical and superseded by this evidence. Step 1.3 is complete.

Step 1.4 starts from that merged base; GitHub merge and remote master were
rechecked on 15 October 2026. Medical Information reuses child records and the
existing child editing route. Nullable encrypted medical-condition and medication
fields distinguish unknown from explicitly recorded none. Legacy allergy defaults
cannot prove an explicit confirmation, so an additive confirmation timestamp
preserves that distinction without rewriting historical data. Safeguarding leads
receive read access; institutional administrators receive read and edit access.
All new clinical data stays outside the broad legacy child response projection.

## Step 1.4 implementation and verification

Medical Information now reads the existing active-site child records, distinguishing
unknown information from confirmed none and recorded needs. Editing reuses the
child edit route with a focused medical section. The two new clinical fields are
encrypted; existing allergy defaults gain nullable confirmation metadata without
backfilling an assumption. Administrators manage the register; safeguarding leads
read it. Legacy general child and household responses do not expose the new fields.
[MEDICAL-OPERATIONS.md](MEDICAL-OPERATIONS.md) records the access, export, retention
and additive rollout/rollback contract.

Verified on 15 October 2026 with pnpm 9.7 via Corepack and disposable local
PostgreSQL only. No production deployment or data operation occurred.

| Check                                                                     | Result                                                                                                                   |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                                          | All 16 workspace tasks passed after correcting the audit enum and Child test fixture                                     |
| `pnpm lint`                                                               | All 16 workspace tasks passed                                                                                            |
| Explicit ESLint on every changed admin `app`, `components` and `lib` file | Passed after final accessibility changes                                                                                 |
| Explicit ESLint on changed API files                                      | Passed                                                                                                                   |
| `pnpm --filter @pathway/api test:unit --runInBand`                        | Final run: 216 suites / 1,536 tests passed                                                                               |
| Focused medical, child and attendance unit tests                          | 3 suites / 50 tests passed                                                                                               |
| Medical HTTP/PostgreSQL integration                                       | 5 scenarios passed, including pagination, encryption, cross-site/org denial, Home denial, concurrency and audit rollback |
| `pnpm --filter @pathway/admin test`                                       | Full suite passed, including medical state, retry, conflict, pagination, read-only and cancellation tests                |
| Auth, platform and DB unit suites                                         | 14, 185 and 64 tests passed; existing opt-in database suites skipped by ordinary unit commands                           |
| Exact protected system-role seed proof on dedicated database              | 3 suites / 13 tests passed, including precise read-only safeguarding grants                                              |
| Opt-in permission-definition database smoke                               | All 9 tests passed                                                                                                       |
| Prisma validation, generation and both additive migrations                | Passed on disposable databases                                                                                           |
| Web, admin and API production builds                                      | Passed; admin rebuilt after accessibility corrections                                                                    |
| Changed-file Prettier and final diff check                                | Passed; all changed/new source and documentation inspected                                                               |
| Independent whole-branch review                                           | No actionable findings                                                                                                   |

The running component fixture was inspected at desktop 1440×1000 and mobile
390×844, with keyboard save and 200% text. Unknown, confirmed-none and recorded
needs remain distinct. No horizontal overflow was observed. Primary button text
contrast and enlarged select labels were corrected and reinspected. A simulated
409 preserves the draft and displays the latest saved record for comparison;
read-only views contain no edit action. Screenshots remain local under
`/tmp/compliance-medical-preview/` and contain synthetic records only.

The fixture uses the actual components and admin styles, with controlled API
responses. It is not a signed-in Clerk browser claim. Separate real AppModule,
authentication/permission and PostgreSQL tests verify the server boundaries and
persistence. Existing Home and safeguarding flows are included in the full suites.
There is no checklist/progress engine change in this step, so those scenarios
remain mandatory in step 1.6.

Initial failures were corrected and rerun: a missing audit enum and outdated
full-Child fixture, a test-only SQL UUID cast on a text identifier, and a browser
fixture missing Next.js environment values. The first full API unit run overlapped
the new legacy-concurrency implementation and observed its new regression before
the fix; the final stable run passed all 1,536 tests. Local package-cache sandbox
access required the normal approved escalation. No check was waived.

The permission registry drift check passed against the application test database.
The protected-seed proof database deliberately contains a `site.active` fixture,
so its initial drift result was not used as application-registry evidence. The
opt-in permission smoke and protected seed suites remain separate passing checks.

An initial full integration run passed 93 suites and 579 tests, but the existing
family-messaging suite encountered a socket hangup and its dependent cron assertion
then failed. Isolated rerun passed all 15 tests without changing messaging code;
the precise transport cause is unconfirmed. A final complete rerun is required
before the PR. Browser retry and empty-state checks also passed after correcting
the temporary fixture's failure injection for React StrictMode.

### Step 1.4 final local gate

The final complete integration rerun passed **94 suites / 581 tests**, including
the previously interrupted family-messaging tests. Final API unit results remain
216 suites / 1,536 tests. Registry drift is zero on the application test database.
All required local checks for this step are now passing. The corrected primary
button measures 7.13:1 text contrast in the rendered browser fixture. The final
diff and all 38 changed/new feature files were inspected; generated logs and local
browser artifacts are excluded. Proceed to PR, current-revision CI and verified
merge; step 1.4 is not yet complete.

### Step 1.4 PR and host gate

[PR #628](https://github.com/FSS-Ltd/pathway/pull/628) was raised after local
verification and all commit hooks passed. Head
`0a8a2ada2d1c434fbf0b1385a4b30129a279b2e0` is under test in
[CI run 38709637926](https://github.com/FSS-Ltd/pathway/actions/runs/38709637926)
and [CodeQL run 38709633997](https://github.com/FSS-Ltd/pathway/actions/runs/38709633997).
No merge has occurred; step 1.5 remains unstarted.

The host unit/type/lint job passed. Its checkout log confirms tested merge
`68a0dd0ec175d5b3bcb865e3b70ab619481a6bd8` (head `0a8a2ada…` into base
`64ba6eec…`). All three CodeQL results passed. The four database/integration jobs
are pending; these partial results do not satisfy the merge gate.

### Step 1.4 final host evidence and 1.5 start

GitHub confirms PR #628 MERGED at 2026-10-15T09:19:13Z, merge commit
`c4bbe0317ae4ee988785394788313fc1b7e2dc5b`. All eight current-revision checks
passed for head `0a8a2ada2d1c434fbf0b1385a4b30129a279b2e0`. Unit and integration
checkout logs both verified test-merge `68a0dd0ec175d5b3bcb865e3b70ab619481a6bd8`.
CI run 38709637926 passed all five jobs; CodeQL run 38709633997 and aggregate
CodeQL passed. Host integration results include 94 suites / 581 tests plus the
separate 13-test database proof. Step 1.4 is complete; earlier pending entries
are superseded by this evidence. Step 1.5 starts from the refreshed merged base.

## Step 1.5 implementation and verification

Contract and operational boundaries: [AGREEMENTS-DESIGN.md](AGREEMENTS-DESIGN.md).
Versioned documents, explicit adult assignments, own acknowledgements and recorded
signed PDFs use the active site. Four additive models retain immutable history,
forced RLS, restrictive composite foreign keys and encrypted sensitive fields.
Document locking serializes publication, assignment and acceptance. No guardian
consent, trip permission, email or production deployment behavior is changed.

Verification on 2026-10-15 (final CI/merge evidence still pending):

- `pnpm typecheck` and `pnpm lint`: all 16 workspace tasks passed. Explicit changed
  admin app/components/lib ESLint passed; API lint/type checks also passed.
- Admin full unit suite passed; focused agreement tests cover access, retries,
  escaped content, stale-context abort, conflicts, exact-version acknowledgement,
  history and paged recipient search (including empty filtered pages).
- DB units: 66 passed; platform: 187 passed; auth: 15 passed. Ordinary opt-in
  skips are exercised separately where applicable (DB 33, platform 5).
- Prisma validate/generate passed. All 143 migrations applied to disposable
  databases. Protected role-seed proof: 3 suites / 13 tests passed on port 55441.
- Initial focused API/SQL integration: 2 suites / 8 scenarios passed. Full suite
  additionally includes permission revocation during upload and Home exclusion;
  final result recorded below when available.
- Web/admin/API builds passed. Admin was rebuilt after responsive fixes.
- Actual components inspected in a browser at 1440×1000 and 390×844, including
  keyboard acknowledgement, document/version forms, ordinary/read-only access,
  conflict draft retention, empty and error/retry states, and 200% text. Fixed
  fieldset/legend sizing after the enlarged-text check detected horizontal overflow;
  reinspection passes. Synthetic browser records exercise real components; real
  authenticated AppModule/HTTP/database tests verify persistence and access.
  A live Clerk-authenticated browser session and external storage credentials were
  not used; file transfers are mocked at the existing storage adapter in integration.
- Independent whole-branch review found a PDF signature ASCII-decoding edge case.
  Exact byte comparison and a high-bit regression fixture fix it; narrow re-review
  found no outstanding issues. Full PDF parsing/antivirus is not claimed.
- Docker Desktop was stopped and the main disposable container was absent. Started
  Docker and recreated only that test container. The first permission smoke run
  correctly failed on its new empty database; migrations were then applied before
  rerunning. No production or unrelated databases were modified.

Local logs use `/tmp/compliance-1.5-*`; data-agent logs use
`/tmp/agreements-*`. Browser captures are under `/tmp/compliance-agreements-preview`.
These local artifacts supplement this ledger; they are not committed credentials
or production records. PR creation remains gated on all applicable local checks.

Initial full integration run: 94 suites / 588 tests passed, with 3 failures across
97 suites / 591 tests. Agreement upload revocation returned 503 instead of 403;
agreement history publication returned 404 instead of 201; existing preferences
update returned 501 instead of 200. Investigation and rerun are required before
PR creation. Final full API units passed: 218 suites / 1,541 tests. Permission
smoke passed after schema preparation: 9 tests; application registry drift: zero.

Commands for step 1.5 (repository pnpm 9.7 via Corepack):

- `corepack pnpm typecheck`; `corepack pnpm lint`.
- `corepack pnpm --filter @pathway/admin test:unit`.
- `corepack pnpm --filter @pathway/api test:unit --runInBand`.
- `corepack pnpm --filter @pathway/api test:integration --runInBand` with
  `E2E_USE_GLOBAL_SETUP=true`, the disposable 55439 database, explicit RLS roles
  and `E2E_ALLOW_RESET=false`.
- `corepack pnpm --filter @pathway/admin exec eslint app/admin-navigation.ts
app/admin-shell.tsx app/compliance/agreements components/compliance/agreements
lib/agreements-client.ts`.
- `corepack pnpm --filter @pathway/api lint`; `corepack pnpm --filter @pathway/api typecheck`.
- `corepack pnpm --filter @pathway/admin build`, `--filter @pathway/web build`,
  `--filter @pathway/api build` (public API URL and synthetic Clerk build key).
- `corepack pnpm db:deploy`; `corepack pnpm permission-definitions:check`.
- `corepack pnpm --filter @pathway/platform test:unit -- permission-definition-database.integration`
  with the opt-in flag/token and separate disposable permission database.
- Protected seed proof uses the three existing `system-role-seed-test-database`,
  `seed-system-roles` and `system-role-seed-command` suites with explicit 55441
  disposable identity, opt-in flags and provisioning token; no production URL.

### Step 1.5 final local result

The isolated full rerun passed **97 suites / 591 tests**. The upload-revocation
fixture was corrected to supply the existing required `revokedById`; the API
then rejects post-upload access loss with 403 and commits no document. Focused
agreements/transfers/preferences rerun passed 3 suites / 16 tests. The publication
404 and preferences 501 did not reproduce; no speculative production changes were
made. The subsequent complete rerun is green and supersedes the initial failure.

Final API units: **218 suites / 1,541 tests**. All builds, workspace checks, explicit
admin lint, permission smoke (9), protected seed proof (13), and zero-drift
registry verification passed. Final API build also passed after the PDF fix.
Prettier checked all 46 changed TS/TSX/JSON/Markdown files; Prisma schema and SQL
migration were inspected separately, alongside all changed files and final diff.
Browser checks additionally confirmed disabled pending-save controls, loading,
success and refresh persistence. Generated logs and local screenshots are excluded
from the PR. No outstanding review finding. Proceed to PR and host CI; step 1.5
remains unmerged and is not yet complete.

### Step 1.5 PR and host checks

[PR #630](https://github.com/FSS-Ltd/pathway/pull/630) opened after all local
checks and commit hooks passed. Head `3185a9b4a928de93d6ea330b6c913641465c6a72`.
[CI run 38717233596](https://github.com/FSS-Ltd/pathway/actions/runs/38717233596)
and [CodeQL run 38717229552](https://github.com/FSS-Ltd/pathway/actions/runs/38717229552)
are in progress. Host base advanced to `b3b592be79238f25d9453f5e1bde9dc311f76f72`
(PR #629 public privacy/individual legal documents). Its shared type export addition
is nonconflicting; the host reports this PR mergeable. The institutional agreement
register remains distinct from public platform legal documents. Combined-revision
CI must pass before merge; step 1.6 has not started.

Seven of eight host checks have passed: type/lint/unit, all CodeQL results,
permission-definition DB, role-seed identity and organisation-role RLS. Integration
is still running. The completed unit checkout log confirms merge revision
`a8a7b192308248ca2e4f63ae68a0dd8c099992a8`, combining head `3185a9b4…` with
base `b3b592be…`; its API result is 218 suites / 1,541 tests. Pending integration
is not a passing gate and no merge is claimed at this point.

### Step 1.5 final host evidence

GitHub confirms PR #630 MERGED at 2026-10-15T10:13:08Z; merge commit
`b905f2385776e8210edc99a435fd63d1e1c9ffcf`. All eight current-head checks passed
for `3185a9b4a928de93d6ea330b6c913641465c6a72`; the unit and integration logs
both verify test-merge `a8a7b192308248ca2e4f63ae68a0dd8c099992a8`. Host integration
passed 97 suites / 591 tests plus the separate 13-test database proof. The host
reported CLEAN/MERGEABLE with no required approval outstanding before merge.
Step 1.5 is complete. Earlier pending entries are superseded by this evidence.
Step 1.6 starts from the refreshed merged base; no production deployment occurred.

## Step 1.6 implementation and review

Implemented the site profile, versioned catalogue/applicability engine, manual
tracker, private institutional evidence and seven permission-filtered signal
readers. All 1,488 jurisdiction/sector/topic cells remain explicitly unreviewed;
no legal pack or legal-certification claim ships in this step. The additive
migration preserves household content and adds missing EU location choices.

Independent whole-branch review found two issues: whitespace-only regional fields
could be interpreted as known, and withdrawn requirements lacked a discoverable
history entry. Regional blanks now normalize to unknown. A bounded retained-history
index and read-only UI are being verified, including evidence-only requirements.
Parent review also made unchanged profile saves idempotent, preserving confirmations.
Browser inspection found and corrected progress-label overflow at 200% text size.

Initial verification (final changed-revision checks still pending):

- Workspace typecheck: 16 tasks passed. Initial lint: 15 passed, API failed on one
  unused import; removed and focused API lint passed, final workspace run pending.
- API unit tests: 221 suites / 1,565 tests passed before the history follow-up.
- Focused tracker/evidence HTTP tests: 14 passed before historical-index expansion.
- Database unit tests: 70 passed; auth: 15 passed. Platform exact registry-count
  fixture corrected for the two added capabilities; rerun 189 passed.
- Protected system-role seed proof: 13 passed after correcting expected grant
  ordering. Permission-definition database smoke: nine passed. Registry drift: zero.
- Prisma validation, API build and web build passed.

Full integration, final admin build/UI inspection, final formatting/diff inspection,
review of the history correction and host CI/merge remain required. The work is
not complete and no next-step implementation has started.

### Step 1.6 final review and browser evidence

Both independent-review findings are fixed and the narrow re-review is clean.
The retained-history API includes a scoped union of confirmations and evidence,
bounded pages and scoped cursors. Its read-only UI works even when no current
requirements remain. Expanded HTTP coverage passed 15 tests, including withdrawal,
profile moves, evidence-only records and pagination. DTO coverage passed four tests.

Actual rendered components were exercised at desktop width, 390px mobile and 200%
text. Verified keyboard confirmation/history, manual progress 0→1, conflict
comparison and retry with preserved notes, pending controls, initial error/retry,
failed-refresh gating, profile editing, empty coverage, read-only access and PDF
upload/archive/download. The enlarged mobile document width remained 390px.
Screenshots were inspected in `/tmp/compliance-tracker-preview/`. Browser checks
use synthetic API responses with actual components; authenticated HTTP/database
tests separately verify persistence and access. Live Clerk and external private
storage credentials were not exercised; storage transfers use the test adapter.

`pnpm --filter @pathway/admin test`, admin/API/web builds, explicit changed admin
source ESLint, final workspace lint (16 tasks), Prisma validation and Prettier
checks on all 59 changed TS/TSX/JSON/Markdown files passed. New Prisma model blocks
were formatted without rewriting pre-existing schema formatting; SQL reviewed.

The first full integration run passed 98 suites/605 tests and failed one existing
assignment-overlap EXPLAIN assertion: PostgreSQL chose its organisation index
instead of the expected partial index. The index exists; the fixture table had
unanalysed statistics. The isolated seven-test suite passed unchanged. A complete
unchanged rerun is underway; no unrelated assertion or production index was altered.

The second full integration run reproduced the same single query-plan assertion
failure (98 suites / 605 tests passed). Refreshing fixture statistics alone did
not resolve it. A representative planner-fixture correction is under investigation;
no assertion is waived. The tracker implementation will be raised as a draft PR
with this blocker, as required by the repository gate. It is not complete and
2.01 remains prohibited. Final workspace typechecks passed all 16 tasks.

### Step 1.6 draft PR

[PR #631](https://github.com/FSS-Ltd/pathway/pull/631) is OPEN/DRAFT on head
`8463501f899d3b1381e2ec5ab9b16394ad339e35`, based on `b905f238…`. It records the
remaining integration blocker. Commit hooks passed workspace lint, API 221 suites /
1,567 tests, workers 45 tests and auth 15 tests. CI run `38723813034` and CodeQL
`38723811095` started; pending results do not satisfy the gate.

The correction uses a representative 32-user × 32-role identity fixture inside a
rolled-back transaction. It preserves the exact partial-index assertion and query
shape, without changing production indexes, disabling competing indexes or waiving
checks. Independent narrow review passed; the focused seven-test run passed against
the previously failing populated database. A full normal-reset integration run is
now verifying the correction before it is committed to the draft PR.

### Step 1.6 integration blocker resolved

The complete normal-reset integration suite passed **99 suites / 606 tests** with
the representative index fixture, including the previously failing overlap test.
This supersedes the earlier failed runs; the original failures remain documented.
Only test setup changed: the production query/index/constraints and the exact
index assertion are unchanged. The fixture rolls back all inserted users, roles,
memberships and assignments and propagates unexpected errors. The correction
received a clean independent narrow review.

The verified fixture and this ledger update are being added to PR #631. Final
current-head host CI, required-review state and verified merge remain outstanding;
step 1.6 is not complete and no 2.01 work has started.

### Step 1.6 current revision awaiting host verification

PR #631 is ready for review on head
`4c4840d78949053af088784c425a7a6dfe0f4210` (base `b905f238…`). The correction's
commit hooks also passed workspace lint, API 1,567 tests, workers 45 and auth 15.
[CI 38724378768](https://github.com/FSS-Ltd/pathway/actions/runs/38724378768) and
[CodeQL 38724375610](https://github.com/FSS-Ltd/pathway/actions/runs/38724375610)
are running for this revision. Earlier draft-head results are superseded.
Required checks and the actual host merge remain the only progression gate;
no next-step implementation has started.

### Step 1.6 verified merge and step 2.01 start

GitHub confirms PR #631 MERGED at 2026-10-15T11:18:42Z by `jntagengwa`, merge
commit `47d698d053df8d91696fec7e330d837e28f93c2b`. All eight checks passed on
head `4c4840d78949053af088784c425a7a6dfe0f4210`. Both completed checkout logs
confirm tested merge `19ceed58e9e671eeb7c3b20922721e51a9d59f88`; the earlier
pre-run API test-merge estimate `07ddeda7…` was not the checked revision. Host
integration passed 99 suites/606 tests plus the separate one-connection proof
(two suites/13 tests). Step 1.6 is complete.

Step 2.01 (England) starts from the refreshed verified merge on its own branch.
Research covers six institutional sectors, eight topics, actual provider status,
activity/age conditions and national/local boundaries. Source review, fixtures,
coverage updates and full delivery verification remain required before its PR.

## Medical encrypted-value correction

User reported live allergy text still encrypted. Prioritizing a separate fix branch
`fix/compliance-medical-ciphertext` from verified merge `47d698d0…`. England research
notes are preserved untracked and excluded from this fix PR. Source inspection
confirms failed-decryption ciphertext can be serialized as RECORDED. Live API
revision `b905f238…` includes the medical implementation; PII key metadata is present.
Supabase read-only aggregate access was denied, so live data/key recovery is not
claimed. The signed-in browser medical page stalled while loading admin context.
See MEDICAL-READ-RECOVERY.md for scope and verification.

### Medical correction review and local verification

Implemented UNAVAILABLE/null medical read states for remaining encrypted envelopes,
DTO rejection of submitted ciphertext, server-side whole-record overwrite prevention,
and legacy allergy replacement protection after existing authorization checks.
Unrelated legacy edits and identical resubmissions preserve existing values. The
admin client also sanitizes older responses, shows retry/unavailable feedback, and
blocks saves and unsafe conflict acceptance while preserving drafts. The tracker
reads bounded clinical pages through the PII layer and reports unavailable evidence
as UNKNOWN instead of counting it complete. No key or stored clinical value changed.

Independent whole-fix review found no blocking correctness/security issues. A minor
duplicate progress-table header was corrected. Scope is the Compliance Medical
surface and reviewed write paths; this is not a global PII-reader redesign.

- Focused existing/recovery HTTP: two suites / 13 tests passed. Includes wrong-key
  and malformed values in all three fields, list/detail/export safety, blocked NONE
  overwrite with raw ciphertext unchanged, legacy unrelated/identical writes, and
  read/manage/cross-site/cross-organisation boundaries.
- Medical serializer/DTO units: six passed. Medical signal units: three passed,
  including unreadable data, missing confirmation and bounded pagination.
- Initial full API units: 221 suites / 1,572 tests passed, one new signal fixture
  assertion failed because its third row was omitted. Corrected the fixture and
  all three focused signal tests passed; commit hooks will rerun the full suite.
- Workspace typecheck and lint: 16 tasks each passed. Backend/admin focused types,
  explicit changed-source ESLint, formatting and whitespace checks passed.
- Actual component inspection: desktop, 390px mobile, 200% text and keyboard retry;
  unavailable current/draft/comparison states, preserved conflict drafts, old-response
  ciphertext suppression, zero writes before recovery, retry restoring readable
  synthetic content. Inspected screenshots in `/tmp/compliance-medical-recovery-preview/`.

Full integration passed 100 suites / 614 tests. Admin regression tests and the
API, admin and web production builds passed. Final independent UI re-review found
no blockers; changed-file and diff inspection, formatting and whitespace checks
passed. Commit hooks passed the complete API unit suite after the fixture correction:
222 suites / 1,573 tests, workers 45 and auth 15. PR
[#633](https://github.com/FSS-Ltd/pathway/pull/633) is open; initial implementation
revision `bda05e0a580158d6841c15bca8cd8d7be33727cd` passed local verification.
Current-revision host CI and merge remain required. Live Clerk/production key
compatibility and clinical recovery are not verified; no production action is
authorized or claimed by this fix branch.

### Medical correction verified merge

GitHub confirms PR #633 MERGED at 2026-10-15T11:57:54Z, merge commit
`7a2a8222af04b9a5e46461f0ee32c9bb91f78a20`. All eight checks passed on final
head `85402031264bc1ed9fc57ce3340d1e55bfedb137`: CI run 38729669557 and CodeQL
run 38729663827. Both unit and integration checkout logs confirm tested merge
`cccd5e20607b93a57fac56cf8fb5e53d10f24e06`. Host API units passed 222 suites /
1,573 tests; integration passed 100 suites / 614 tests, plus two suites / 13
single-connection tests. No blocking host reviews were reported. This completes
the source correction's delivery gate, not production deployment or clinical
recovery. User separately authorised deploying the verified medical fix. Read-only Vercel inspection found both production aliases already serving READY CLI deployments of the exact merged revision; no duplicate deployment was triggered.

England resumed from the refreshed merged base. Research notes identify precise
classification and operational facts missing from the initial profile; additive
unknown-by-default facts will support applicability without inferring legal status
from ACE, screen choice, funding labels or billing details.

### Production medical correction verification

User authorised production release of the verified medical fix. Vercel confirmed
`api.nexsteps.dev` serves `dpl_RPYKpxQ59QWf5NwLZBC4mmwitwJR` (READY
2026-10-15T12:02:44.365Z) and `app.nexsteps.dev` serves
`dpl_6CC3AQJqmbxAPDKgXVqe4wNmxRdG` (READY 12:02:32.945Z). Both existing
production deployments report exact merged commit `7a2a8222af04b9a5e46461f0ee32c9bb91f78a20`,
so no duplicate deployment was created. Unfinished England changes are not in that
revision. Public API `/health` returned 200/ok; `/health/ready` is not an existing
route (404). Direct unauthenticated admin fetch returned 403, while the signed-in
browser loaded Medical Information successfully. It shows unavailable allergy
states and the recovery warning, without ciphertext. Original clinical text remains
unrecovered. Error/fatal grouped-log scans for both deployment IDs in the preceding
15 minutes returned no entries; this is a bounded observation, not a guarantee.
No encryption keys or stored clinical values were changed.

### England core implementation and verification in progress

The eight-topic national core contains 62 source records and 68 actions, with
48 `PARTIALLY_PUBLISHED` England cells and 1,440 other cells still `NOT_REVIEWED`.
Partial cells continue to count as gaps. They expose only individually published
requirements whose source/requirement reviews remain current. Regional and
specialist gaps remain explicit; this is not the completed 2.01 deliverable.

Added unknown-by-default operational facts, source `effective.currentAsOf` without
inventing commencement, backward-compatible normalized/no-op profile saves, and
English-only UI questions. Focused source/engine/applicability/fact suites passed
74 tests. Before those passes, one new partial-coverage test assumed the first
coverage row was safeguarding and one previous nursery test assumed an empty
production catalogue; corrected those assertions to check their actual topic and
the now-published national core, preserving actual legal classification. The first
unit invocation used a nonexistent config; reran with `jest.projects.config.ts`
and `--selectProjects unit`. No checks were waived.

New real HTTP/SQL profile tests passed (two cases) including legacy JSON reads,
unchanged saves/revision counts and explicit fact persistence; existing tracker
HTTP tests also passed before the final additive fact. Full integration is running
on disposable local DB 55439. Source review corrected an unverified Royal Assent
publication date, governance source selection, school predicate reuse, and privacy
complaint statutory timing. Full final review, builds and delivery remain pending.

### England core final local verification

Full final integration passed **101 suites / 617 tests** on the corrected legacy
write implementation (`test:integration --runInBand`, disposable DB 55439).
A preceding run had 99 passing suites and two unexpected failures in existing
notice/child HTTP tests: `Parse Error: Expected HTTP/` and an unexpected 404 on
child creation. The unchanged tests passed in isolation (two suites / 16 tests),
then the full unchanged revision passed in isolation. No assertion or timeout was
weakened and no root cause is claimed for the earlier failures.

Workspace typecheck and lint passed 16 tasks each; admin `test:unit` passed with
the new profile-fact regression wired into both test scripts. API, admin and web
production builds passed using synthetic public build configuration. Prisma
validation passed; permission-definition drift check returned zero against the
explicit disposable database URL. Its first invocation lacked DATABASE_URL and
was rerun with the required local configuration.

Independent source/engine review is clean after correcting independent-school
pupil-first-aid selection for legacy profiles. Independent backend review is clean
after preserving enriched facts on old-client saves, allowing explicit null and
rejecting contradictory merged classifications as 400. Focused backend verification
passed 21 units and 11 HTTP/SQL tests. Actual profile UI inspection passed desktop,
390px mobile, 200% text, keyboard choices, unknown/no distinctions, English child
regions, French exclusion, funding/status independence, inherited read-only controls
and partial/regional-gap presentation. Parent inspected mobile evidence in
`/tmp/compliance-england-profile-preview/`. Browser and preview server were closed.

Source closure research for the remaining England national topics continues in
separate temporary notes. It is not included as reviewed runtime content by default.
Step 2.01 remains incomplete; no Wales work has started. Commit hooks, final format/
diff review, PR and host gate remain to be recorded.

### England draft delivery and continued source closure

Commit hooks passed the complete API unit suite: **226 suites / 1,630 tests**,
workers **45 tests** and auth **15 tests**. Formatting and final diff checks passed
before opening [draft PR #634](https://github.com/FSS-Ltd/pathway/pull/634), initial
head `2b56417a2b1c8c0d01c631a5f74bcd2710edc8e5`. CI run 38738185579 and CodeQL
38738180108 started on that revision. Generated path-only Turbo logs were restored;
no unrelated checkout changes were included. Draft publication does not satisfy
the step gate or authorise Wales.

Further reviewed England source work is being integrated on the same step/PR:
maintained/academy governance, SEND/admissions, advanced privacy, premises/activity
routes and childcare-register/funded-entitlement assessments. Root's three childcare
applicability tests failed for absent rows, then passed after implementation. These
remain assessment recommendations where actual register parts or local agreements
are necessary. New content requires final review and renewed checks before push.

### England source additions and independent corrections

Assembled catalogue now validates **119 sources / 98 actions**, including 12
state-school, 7 advanced privacy, 10 premises/activity and 2 childcare-route actions,
with the superseded generic curriculum assessment removed to avoid duplication.
Existing transport/boarding rows were strengthened with actual operator routes,
residential standards and the precise greater-than-295-days definition; no new
profile facts were introduced. All 48 coverage cells remain partial.

Independent review found and corrected overly narrow PECR and private-fostering
conditions: neither can depend solely on controller status or boarding/trips. A
further transfer review found processor-initiated transfers also need the assessment;
that correction passed focused re-review after making the transfer assessment independent of controller status. Scope assessments retain supported no-activity
conclusions in evidence and never certify unreviewed specialist/local requirements.
Integrated five-suite check passed 48 tests before the final transfer correction;
API typecheck and lint passed. Final expanded checks, PR update and host gate remain
pending.

### Expanded verification: messaging failure investigation

Expanded integration initially passed 100 suites / 616 tests and failed one existing
family-messaging case, `requires cron auth and consumes a message outbox event once`:
expected `sent: 1`, received `0`. Its unchanged suite then passed all 15 tests in
isolation. A full isolated rerun is in progress; the failed run is retained.
Read-only tracing found a possible DB/host-clock boundary: default outbox due time
and discovery use database time while claiming compares host time. A measured
62 ms midpoint difference with 155 ms call duration does not prove clock skew was
the cause. No messaging assertions, timeouts or code were weakened or changed.

Initial PR revision `2b56417a2b1c8c0d01c631a5f74bcd2710edc8e5` now has all eight
applicable host checks successful (CI 38738185579 / CodeQL 38738180108). These are
not evidence for the expanded unpushed revision. Expanded API typecheck, lint,
build and focused formatting passed; API units, final integration and new-head CI
remain required. One unused curriculum-overview source was removed after replacing
the generic action, leaving **119 sources / 98 actions**.

The Node 21 full rerun passed messaging but failed two existing family-subject-
timetable tests (`socket hang up` and unexpected 404), ending 100 suites / 615 tests
passed with two failures. Local runtime was Node 21.7.0 while all CI jobs configure
Node 20. An installed Node 20.20.2 runtime and pnpm 9.7.0 were verified and are being
used for the next full run. No causation is inferred from the runtime difference.

Further read-only current-step research is prepared in temporary school-detail,
record-specific-rights and common-operations notes. It is not published catalogue
content. National procedural detail and unreviewed site/regional/provider terms
remain visible gaps; Wales remains prohibited until the agreed England gate.

### CI-matching local result and production release boundary

With Node 20.20.2 and pnpm 9.7.0, full integration passed **101 suites / 617 tests**
for the 119-source / 98-action assembly. Earlier Node 21 failures remain recorded;
this successful run does not establish their root cause. Additional researched
common incident/equality and school/record procedures are being verified separately
before the final expanded PR update.

Read-only inspection identified `.github/workflows/deploy.yml` lines 3–6: a push
to master triggers the production deployment workflow, including migrations and
web/admin/API jobs. The approved plan keeps production deployment a separate
authorised action. User's latest release approval covers medical PR #633 only.
Therefore raising/updating and checking England PR #634 is authorised, but merging
it would also release the England revision and needs explicit release approval
after the concrete current PR is verified. Do not disable the workflow or merge
with an intention to cancel deployment afterward. Wales and other build steps
remain gated.

### 17 October resume: published core preserved and detail release versioned

Host confirms user merged PR #634 at 2026-10-15T21:27:46Z, merge commit
`75ab1d116eeed1667e2710ee6e372f5d507d4cab`. All eight checks passed on head
`2b56417a2b1c8c0d01c631a5f74bcd2710edc8e5`. Unpublished local additions were
preserved in stash `9dea53c56e1d843f4d99c9684aab980a28927e0d` and a patch backup,
then safely applied to `feature/compliance-england-detail` from current master
`113d336783eb2f9effa3c28621ebf3831dcf86fd`. No unrelated original-checkout edits
were touched. Frozen-lockfile dependency installation succeeded and regenerated
the Prisma client for master's existing schema; no lockfile or migration changed.

Because the original catalogue is now published, its v1.1 modules remain unchanged.
The follow-up is catalogue 1.2.0, released no earlier than 17 October: 154 sources,
106 current actions and 108 retained requirement revisions. Transport and boarding
material updates use version 2 and preserve version 1 for prior attestations; new
actions start at the new release date. The original general curriculum assessment
is retained rather than deleted from published history. This supersedes the earlier
unreleased draft's proposed removal. All 48 England cells remain explicitly partial.
Release/history regressions failed before versioning and then passed four cases;
an additional manual-attestation regression is now included in final verification.
Independent source reviews are clean; new release integration review is running.

Earlier interrupted type/build/applicability commands had no completed results and
are not counted as passes. All affected checks will be rerun on the refreshed base.

### 17 October: Overview & Tracker visual revision

User requested a modern layout and liquid-glass progress bar. The current England
follow-up also replaces the native visible meter with a layered teal glass rail,
while retaining a native progress element for assistive technology. Zero completed
shows zero fill; an empty denominator shows "No applicable items" without a meter.
A compact overview keeps applicability, coverage, overdue, renewal and evidence
indicators separate. Topic navigation replaces the long stacked checklist, with
all topic panels retained so unsaved confirmation notes survive switching topics.
Compact expandable rows preserve confirmation, evidence and history behavior.
No backend completion, permission or legal applicability rules changed for the UI.

Passed: admin `test:unit`, targeted admin ESLint (including changed components and
test-style helper), all changed-file Prettier checks, API typecheck/lint/build and
release/history regressions (four suites / 43 tests). Independent integrated UI
review caught small-label contrast; it now uses the existing darker text token.
Independent release review confirmed the immutable v1.1 catalogue and stale prior
confirmations after material v1.2 updates.

Actual browser inspection used the real workspace/components with a synthetic
England catalogue/profile in a local preview; no production or medical data.
Inspected desktop 1440px, mobile 390px, 200% text, native Enter expansion and
Tab/Enter topic selection. Expanded mobile content has document width 390px and
no overflowing elements. Reduced-motion fill transition is 0s. Synthetic 0%, 40%
and 100% states match native progress values; empty totals have no meter or NaN.
Mobile spacing was corrected after visual inspection found overly narrow text
columns at 200%. Screenshots were viewed, not only generated. Existing runtime
regressions cover failed refresh/retry, stale mutations, save conflicts, read-only
access, N/A validation and restricted medical links. The preview is isolated from
the signed-in shell; no new production release is authorised by this UI request.

Final admin build and compliance-suite checks remain pending. A duplicate admin
typecheck and initial expanded unit run were stopped to reduce local memory
contention, and are not counted as passes. They will be run sequentially as needed.
No follow-up PR has been raised yet; England remains partial and Wales is gated.

Final compliance units on the refreshed base passed **22 suites / 184 tests**.
Admin production compilation and built-in type validation passed; prerender then
failed because the command omitted documented `NEXT_PUBLIC_API_URL` build-time
configuration. This is not a passing build. Rerun uses the documented local URL
and synthetic Clerk publishable key after the integration run. Forced-colors
inspection also confirmed a visible fill/border and no mobile overflow.

Refreshed-base full integration finished **106 suites / 633 tests passed**, with
one unchanged attendance-export assertion failing (107 suites / 634 tests total).
It expected three audit rows and observed the two lead-user rows but not the final
staff-user export row. Export/audit source awaits the insert; root cause is not
established. All eight compliance integration suites passed, including tracker,
profile, evidence, agreements/transfers, medical and unavailable-medical tests.
The failing attendance suite is being isolated; no code/assertion/timing was changed.
Prisma validation and permission registry drift check passed (zero drift). The
first registry command lacked DATABASE_URL; rerun explicitly used the disposable
local test database. No production database was accessed.

The isolated attendance rerun did not establish the original audit failure's
cause: under heavy host memory pressure both tests and cleanup exceeded 30s,
and existing 15s database transactions expired (observed 16.6s and 38.5s elapsed).
The failed process was stopped after its failure summary because requests were
still pending. Do not increase timeouts or weaken assertions. A further isolated
and full run must wait for sufficient local capacity. Final targeted overview,
checklist-browser and tracker runtime tests passed after all UI edits.

Admin production build now passes with documented local API URL and a synthetic
Clerk publishable key: compilation, type validation and all 64 pages succeeded.
Existing Browserslist/webpack-cache and Supabase Node 20 deprecation warnings are
retained; no dependency upgrades were introduced into this scoped change.

Attendance isolation passed both tests after local contention eased (201ms and
57ms request scenarios). The next full run passed **105 suites / 632 tests**,
failed two of 107 suites / 634 tests: unchanged unavailable-medical export returned
404 instead of 200; unchanged ACE daily-operations setup returned 501 instead of 200. Attendance passed in that full run. These differing failures remain unresolved;
do not describe full integration as green. Independent read-only diagnosis and
two-suite isolation are underway. The current step may only be raised as a draft
with these explicit verification gaps; no next country or production release.

Both medical/dashboard suites now pass isolated (**2 suites / 9 tests**) without
changes. This does not establish why the earlier full run failed. Independent
review found a concrete attendance response/commit race: the controller sends
CSV within the outer TenantRlsInterceptor transaction; its service joins that
transaction, so the immediate audit query can run before the outer commit. The
controller/interceptor/database files are unchanged from the base. A future
focused transaction-boundary fix should preserve the assertion. Medical 404 and
behaviour 501 remain unexplained; neither route/service references the catalogue.
Do not call these unexplained results proven baseline flakes.

A temporary pnpm wrapper only adds `--runInBand` to the pre-commit API unit
command to avoid launching many memory-heavy Jest workers. The pre-commit hook
and every test remain enabled; no checks or assertions are bypassed. The current
step will be published as a draft while the full integration gate remains failing.

### Draft PR 657: verification blocker transaction correction

Draft https://github.com/FSS-Ltd/pathway/pull/657 was raised on code revision
`e29122bfc4a8ad1a2dbb65d1934700ca6b05f5a9`. Pre-commit passed workspace lint
(16 tasks), API units (245 suites / 1,772 tests), workers (12 / 51) and auth
(3 / 15). Initial CodeQL checks passed; CI remains in progress. This does not
satisfy the current-step merge gate.

A third full integration run again reproduced only the missing attendance audit
row (106 / 107 suites, 633 / 634 tests passed). To resolve this concrete gate
blocker within the current step, the export handler now uses the existing
method-level `IndependentTransaction` mechanism. Auth/permission guards remain;
the service still opens its own tenant/org-scoped transaction, validates dated
band/membership scope and writes its audit atomically. Its promise now resolves
after commit, before the controller sends CSV. Other attendance handlers retain
the request transaction. No broad interceptor or timeout changes were made.

Deterministic transaction-ownership regression failed before the fix and passes
afterward (four interceptor unit tests). Export integration passes three cases:
immediate committed audit plus permission/revocation/site/band boundaries, audit
failure sends no student CSV/download header and leaves no new audit, and invalid
range/unauthorised site rejection. The original immediate-audit assertion remains
unchanged. A full integration run against this fix is in progress. Independent
security/transaction review found no blocker; exact final diff review is pending.

Final three-file export fix review found no blocker. Full integration after the
fix passed attendance, medical and dashboard suites; overall **105 suites / 633
tests passed**, with two of 107 suites / 635 tests failing on `socket hang up`
in tracker permission boundaries and subject-timetable Head API. Neither produced
a failed domain assertion. These transport failures remain an explicit local
verification limitation; do not claim local full integration passed. No client
retries, sleeps or raised timeouts were introduced. Fresh host CI will verify the
updated revision in its isolated database environment; no result on the initial
head counts for the forthcoming fix commit.

### PR 657 pre-merge host verification (historical)

At the time of this entry, PR #657 was ready for review and not yet merged. All eight host checks
passed on `0759cd950e54bd87903d7238f9f425191df5e681`:
[CI 39045945470](https://github.com/FSS-Ltd/pathway/actions/runs/39045945470)
and [CodeQL 39045942963](https://github.com/FSS-Ltd/pathway/actions/runs/39045942963).
Completed unit and integration checkout logs confirm test merge
`e0112ac91b4d8314950252a0f49fe2ae181c0bd8`, whose parents are current master
`52fafdf4f2f57986c93eab1a19009324537e84ad` and the checked PR head.
CI full integration passed **108 suites / 636 tests**; separate one-connection
transaction checks passed **2 suites / 13 tests**. No missing, neutral, skipped or
pending result is counted as success. No reviews or merge conflicts block the PR.

Final local API typecheck/lint/build, admin/web production builds, formatting,
explicit admin component/lib lint, Prisma validation and permission registry
checks passed. Post-fix commit hooks passed API 245 suites / 1,773 tests, workers
12 / 51 and auth 3 / 15 plus 16 workspace lint tasks. A worker teardown warning
remains in the otherwise passing worker command. Full local integration transport
failures remain recorded above; the socket-affected tracker/timetable suites pass
isolated on the final code (2 suites / 10 tests). No transport cause is claimed.

Additional actual browser inspection checked editable confirmation fields at
390px/200% text. A simulated failed save showed the accessible error, retained the
checkbox and notes, left completion at zero, and had no horizontal overflow.
This uses synthetic local data; it is not a production persistence test.
A sample-data design preview is available locally on port 4319.

The next permissible action at that time was explicit approval to merge/release PR #657:
`.github/workflows/deploy.yml` deploys on master pushes, and the approved plan
requires separate production authorisation. Latest existing release approval was
for medical PR #633 only. Do not merge or start the next pack before that release
approval and the current step's host-confirmed merge. This final host-evidence
entry is retained locally while approval is pending; product code is fully pushed.

### PR 657 authorised merge and production release

User explicitly authorised: merge and deploy #657, check the live portal, then
continue the remaining compliance packs. Fresh host checks remained all SUCCESS
on head `0759cd950e54bd87903d7238f9f425191df5e681`; current master/test merge
were unchanged. GitHub confirms MERGED at 2026-10-17T15:52:57Z, commit
`9337c8450e583d3d59193b068d9cc8f00585cff6`. Its tree
`50dbd0d2c21aee8285137d2462bf13642a5f3bdc` equals the checked test merge tree.
Production workflow 39046994895 started automatically; no duplicate deployment
was triggered. Migration stage passed, web deployed; API/admin are building.
Signed-in portal access is available. Live demo profile has no saved operating
location; do not manufacture a location or attest completion for verification.

### PR 657 production verification complete; Wales begins

Production workflow [39046994895](https://github.com/FSS-Ltd/pathway/actions/runs/39046994895)
passed migration, web, admin and API jobs on merge `9337c845`. Vercel production
aliases are READY on that exact revision: admin `dpl_HZDQxFWoCsKnNdA3dEZHEnJK3ssU`,
API `dpl_4cUYxK8Yf9Bq6YGHuPTTwRftUMAe`, web `dpl_C5WmH2XyDfo6sbVMQR6sfY52eLbr`.
API `/health` passed with database time. Production API/admin error/fatal log
aggregates returned no entries for the checked five-minute window.

Actual signed-in live inspection in Dia verified the deployed tracker at desktop
and 390px responsive width, successful refresh with updated evidence observation
time, loading/disabled controls recovering, topic selection by keyboard and
coverage disclosure. Demo profile has no saved operating country/sector: all eight
topic gaps stay unavailable, no England default or misleading completion meter.
No site facts, medical records or attestations were changed. Filled glass-meter
and failed-save scenarios were verified with synthetic local data in the earlier
record; live persistence was not exercised by creating false compliance records.
Browser device emulation was restored to desktop afterward.

Vercel API build logs include NodeNext TS2835 import-extension diagnostics despite
successful deployment. The preceding production API deployment
`dpl_7htc8Xr6FFPoiczniiENwUHJpbmt` contains the same diagnostics (including England
operations/shared imports and auth modules), confirming an existing build-adapter
limitation rather than a new release failure. Local/CI package checks pass; no
checks were suppressed. Keep this diagnostic limitation visible for follow-up.

The user's latest instruction explicitly requests remaining packs after this
release. Wales **2.02** starts on `feature/compliance-wales-pack` from the verified
merge. This supersedes the earlier self-authored instruction to hold Wales for
exhaustive England detail: reviewed national packs are progressive releases;
England stays PARTIALLY_PUBLISHED with its local/specialist backlog. Neither the
England jurisdiction nor the overall compliance project is declared complete.
Acceptance for Wales: separate Welsh applicability, all six sector/eight topic
coverage cells, official source metadata, explicit local/specialist gaps,
immutable published England history, manual completion and tenant boundaries
retained, focused regression/source review plus applicable package/integration
checks and current-head CI before merge. Future production release authority
must be resolved before merging because master pushes deploy automatically.

### Step 2.02 Wales — local implementation in progress

The version 1.3 draft adds 45 Wales-only national actions and 51 reviewed source records. All 48 Welsh sector/topic cells are `PARTIALLY_PUBLISHED` with regional status `IN_REVIEW`. Actual school classification, childcare, employment, food activity, controller role and ICCE participation are evaluated independently. [Wales pack notes](packs/wales/README.md) and [regional inventory](packs/wales/regional-review.md) state the unreviewed local and specialist boundaries. England 1.1/1.2 source, requirement and attestation history is preserved. [PR #659](https://github.com/FSS-Ltd/pathway/pull/659) was raised from `cf07d19dd227fc38b195468302874ea514fda63c`; CI and merge remain pending. Scotland remains gated.

Local verification on 17 October 2026:

- `pnpm --filter @pathway/api test:unit --runInBand`: **250 suites / 1,815 tests passed on the committed revision** in the required commit hook. Before commit, affected catalogue/engine suites passed **15 suites / 138 tests**, and the new combined ACE/ICCE and non-ACE learning-centre acceptance suite passed **2 tests**. Commit hooks also passed 16 workspace lint tasks, 12 worker suites / 51 tests and 3 auth suites / 15 tests; a worker teardown warning did not fail the hook. Host CI still must verify the final PR revision.
- Disposable-database `pnpm --filter @pathway/api test:integration --runInBand`: **108 suites / 637 tests passed**. The focused tracker suite separately passed **9 tests**, including Welsh attestation persistence and cross-site/organisation isolation.
- API `typecheck`, `lint` and `build`: passed. Prisma generation and `prisma validate`: passed. Permission-definition registry drift: zero. `prettier --check` and `git diff --check`: passed. The final 51 source URLs returned HTTP 200; key provision and applicability decisions were checked against primary Welsh, UK, regulator and provider material in the pack notes.
- Admin and web production builds: passed after providing a localhost API URL and a disposable, nonproduction Clerk publishable key. Initial environment-free builds failed on missing configuration, not code. This pack changes no UI files; the previously merged tracker UI was inspected at desktop/mobile and keyboard sizes in the #657 release record.

The final diff was inspected before PR creation; the commit hooks passed and the branch was pushed. The next action is current-head PR CI verification, followed by a host-confirmed merge only with the required release authority. Because master pushes deploy to production, separate authority for the Wales release is still required before merge; approval for #657 was specific to #657. Do not start Scotland before the Wales gate passes.

### Step 2.02 Wales — merged and released

The user explicitly authorised merging and deploying [PR #659](https://github.com/FSS-Ltd/pathway/pull/659) after CI passed. All eight host checks passed on `76c5ad03`; GitHub confirmed merge on 17 October 2026 at 22:35:56 UTC, merge commit `1a7071bddfc5db92ae4479a9ec8318444f4bb096`. Production workflow [39075727255](https://github.com/FSS-Ltd/pathway/actions/runs/39075727255) passed migrations, API, web and admin. The API health endpoint returned HTTP 200 with database time. The signed-out admin compliance route redirected to Clerk as expected. Authenticated Welsh checklist behavior was covered by the local integration suite, not a post-release live session.

### Standalone tracker usability and organisation facts fix — in progress

Branch `fix/compliance-tracker-profile-flow` starts from the confirmed Wales merge. [PR #661](https://github.com/FSS-Ltd/pathway/pull/661) was raised from checked commit `23da5a79`; current-head CI and merge remain pending. A live screenshot showed sector and location unresolved because the tracker read only its separate site profile: the saved organisation sector and vertical were ignored, while `Europe/London` is only a timezone and cannot prove an operating jurisdiction. The fix reads authoritative organisation sector and vertical, requires profile renewal when those facts change, keeps location explicit, and leaves other legal classifications for site confirmation. The UI moves the profile into a modal, groups the page into tabs, starts coverage as a bottom-right collapsed alert, and guides one checklist action at a time with explicit not-applicable reasons and local-authority/regulator advice. No migrations are needed. Scotland remains gated until this standalone PR has passing current-head CI and a confirmed merge.

Local verification: API and admin typechecks and production builds pass; focused API unit tests pass (2 suites, 23 tests); tracker integration passes (10 tests, including site isolation and organisation-change renewal); focused admin tracker and checklist tests pass; changed TypeScript lint, exact-file Prettier check and `git diff --check` pass. Desktop and 390px local browser previews were inspected. The first integration rerun stalled in test setup and timed out; a clean rerun passed. The temporary preview route and authentication wrapper have been removed from the branch. Current-head CI, merge and production release remain pending.

The pre-commit hook passed all 16 package lint tasks. Its full API unit run was stopped after more than 15 minutes of host contention with another worktree's concurrent Jest run; all reported suites passed up to interruption, but the full run is **not** counted as passed. The affected suites were run independently and passed. Full current-head CI remains mandatory before merge.

### Tracker usability fix merged and released; Scotland 2.03 begins

[PR #661](https://github.com/FSS-Ltd/pathway/pull/661) passed all eight host checks on `ee763840384ceda82a7e0830e4afb4880584ec7c`, including full unit and integration, CodeQL, role RLS, permission definitions and system-role identity. The user authorised the production release. GitHub confirmed MERGED at 2026-10-17T23:48:33Z, merge `164d4f66921efc8ea7c6a68d84311dee9ac5ddfc`. [Deployment 39080424669](https://github.com/FSS-Ltd/pathway/actions/runs/39080424669) passed migrations, web, API and admin on that merge. Live API health returned HTTP 200 and database time; the signed-out compliance route redirected to Clerk. Authenticated live tracker state was not inspected in that smoke check. The local desktop/mobile preview and integration tests are recorded above.

Step **2.03 Scotland** starts on `feature/compliance-scotland-pack` from refreshed `fss/master`; the confirmed tracker merge is in its ancestry. Publish reviewed Scottish national requirements across all six institutional sectors and eight topics while retaining explicit local/specialist gaps. Scottish independent-school and Care Inspectorate registration, mandatory PVG regulated-role membership since 2025, Scottish fire law and funded ELC are separate from Welsh rules. The February 2026 fourth-edition additional-support code is presented by its publisher as consultation material and must not silently replace the current operative guidance. Current-step PR, passing latest CI and host-confirmed merge remain the gate before Northern Ireland.

### Scotland 2.03 local verification

Catalogue 1.4.0 adds 31 reviewed Scottish official/provider sources and national actions across all eight topics for six sectors. All 48 Scotland cells are `PARTIALLY_PUBLISHED` with regional status `IN_REVIEW`; see [pack notes](packs/scotland/README.md). Prior England/Wales catalogue records remain unchanged. Scottish school, care, PVG, fire and funded ELC routes are conditional on actual provision. ICCE is a separate provider condition. The draft 2026 additional-support code is not used as operative guidance.

Checked on 2026-10-18: all 31 source URLs returned HTTP 200; API typecheck and build passed after local Prisma client regeneration; targeted catalogue/tracker ESLint passed; 17 relevant unit suites passed (156 tests); two tracker database integration suites passed (13 tests) on a disposable database; exact-file Prettier formatting and `git diff --check` passed. The initial typecheck identified a new readonly condition and a stale generated Prisma client from the unrelated finance schema; both causes were corrected locally without changing finance code. The first unit run exposed the expected coverage CSV/test assertions; they were updated and all relevant suites reran green. No schema or UI files changed, so Prisma migration validation and desktop/mobile inspection are not applicable to this pack. Full current-head host CI remains the PR merge gate.

The commit hook passed all 16 package lint tasks. Its full API unit run was interrupted after several minutes of host contention while suites were still passing; it is not counted as a completed local check. The affected catalogue/tracker suites passed independently. The PR must pass the full current-head unit CI before merge.

### Scotland 2.03 merged; Northern Ireland 2.04 begins

[PR #662](https://github.com/FSS-Ltd/pathway/pull/662) passed all eight GitHub checks on `f15f16fc41b4cb675e6aac47904ccd33f6bd847c`: Typecheck/Lint/Unit, Integration, Organisation Role RLS, Permission Definition Database, System Role Seed Database Identity, CodeQL and both language analyses. GitHub confirmed MERGED at 2026-10-18T00:21:10Z, merge `51cddcc0de6f2e587e4700b199baf6394c61640d`. Production workflow [39082445031](https://github.com/FSS-Ltd/pathway/actions/runs/39082445031) passed migrations, admin, web and API on that merge. Step 2.04 starts from that exact merged `fss/master` on `feature/compliance-northern-ireland-pack`. Its PR/CI/merge gate precedes Ireland.

### Northern Ireland 2.04 local verification

Catalogue 1.5.0 adds 27 official/provider source records and a partial national core across all eight topics and six sectors. All 48 Northern Ireland cells are `PARTIALLY_PUBLISHED` with regional status `IN_REVIEW`; [pack notes](packs/northern-ireland/README.md) identify the unresolved HSC Trust, district-council and specialist boundaries. Independent-school status, actual childcare service, AccessNI role eligibility and ICCE participation are separate conditions. The September 2026 AccessNI supervision change and current 2026/27 attendance guidance were checked; draft replacement SEN material was not treated as operative.

Checked on 2026-10-18: 26 of 27 source URLs returned HTTP 200 in scripted access; the Food Standards Agency Safe Catering PDF returned an automated-access error, though the official document was retrievable through research search. API typecheck and build passed. Full repository lint passed across 16 packages (zero cached); targeted catalogue/tracker ESLint also passed. Eighteen relevant unit suites passed (158 tests), including both new Northern Ireland fixtures and preserved Scotland history. Two tracker database integration suites passed (13 tests) on a disposable database. Exact-file Prettier and `git diff --check` passed. The first focused unit run found that the Scotland-history test included new Northern Ireland records; its prefix comparison was corrected and all 18 suites reran green. No schema or UI changes make migration validation and desktop/mobile inspection inapplicable. The full local API unit suite was not rerun because the preceding step's hook experienced prolonged host contention; full current-head CI remains mandatory before merge.

### Northern Ireland 2.04 merged; Ireland 2.05 begins

[PR #663](https://github.com/FSS-Ltd/pathway/pull/663) passed all eight checks on `d5090c99c767449f8978b7ca21754b0b99022092`, including full unit, integration, role RLS, permission definitions, system-role identity and CodeQL. GitHub confirmed MERGED at 2026-10-18T00:42:02Z, merge `0db99ad94420aeae905d1ccc37045d1e39e9321a`. Production workflow [39083728157](https://github.com/FSS-Ltd/pathway/actions/runs/39083728157) passed migrations, API, web and admin on that merge. Step 2.05 starts from this confirmed merged `fss/master` on `feature/compliance-ireland-pack`. Austria remains gated until Ireland's separate PR has green current-head CI and a host-confirmed merge.

### Ireland 2.05 local verification in progress

Catalogue 1.6.0 adds 26 Irish official/provider sources and 20 national actions across all eight topics and six sectors. All 48 Ireland cells are `PARTIALLY_PUBLISHED` with regional status `IN_REVIEW`; [pack notes](packs/ireland/README.md) identify unresolved local, classification and specialist boundaries. A non-recognised-school child's Tusla registration is a parent duty and appears as provider guidance, while Children First, childcare, Garda vetting, food and ICCE actions depend on actual service, role or participation. The UK records are preserved in the append-only release.

Checked on 2026-10-18: Irish Statute Book and regulator/provider links returned HTTP 200 in scripted access. Some gov.ie pages rejected scripted access and EUR-Lex returned HTTP 202; their official content and links were checked through source search. API typecheck, build and lint passed; 30 compliance unit suites / 230 tests passed on the final care-applicability revision; exact-file Prettier and `git diff --check` passed. The first API build failed only because the sandbox denied writes to generated `dist` files in this managed worktree; rerun with worktree write access passed. A first attempted direct `pnpm exec jest` invocation found no root-level Jest command; the package test command passed. Full disposable-database integration passed 108 suites / 639 tests. After that run, review found a care-classification condition that could omit the operating-standards item when the provider category was care but a separate boolean was false. A shared condition and regression test fixed this; the complete compliance unit set, API typecheck, build, lint and formatting reran green. Current-head host CI will rerun integration on that final change. No schema or UI files changed, so migration validation and desktop/mobile inspection do not apply to this pack.

### Ireland 2.05 merged; Austria 2.06 begins

[PR #664](https://github.com/FSS-Ltd/pathway/pull/664) passed all eight host checks on `e6e75af45bb9e559525188c10a708ce9571f61ff`, including full unit, integration, organisation-role RLS, permission definitions, system-role identity and CodeQL. GitHub confirmed MERGED at 2026-10-18T01:11:38Z, merge `44f6ec26f21cb1a3a7d8a5967d16e88a02f38491`. [Production workflow 39085581874](https://github.com/FSS-Ltd/pathway/actions/runs/39085581874) passed database migrations, admin, web and API on that merge. Step 2.06 starts from this confirmed merged `fss/master` on `feature/compliance-austria-pack`; Belgium remains gated until Austria's separate PR has green current-head CI and a host-confirmed merge.

Austria research found an imminent change that the pack must not apply early: [Privatschulgesetz § 7](https://ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10009266&Paragraf=7&FassungVom=2026-10-18) uses advance notification for the current 2026 opening route, while [the 2026 amendment](https://www.bmb.gv.at/Themen/schule/schulrecht/gvo/psg_novelle.html) introduces a different approval route from 1 January 2027. [Schulordnung 2024 § 4](https://ris.bka.gv.at/NormDokument.wxe?Abfrage=Bundesnormen&Gesetzesnummer=20012587&Paragraf=4) sets a school child-protection concept; applicability to a particular private-school category must be confirmed. Kindergarten licensing, premises and youth-protection rules differ across the nine Länder. The national pack must identify those regional gaps rather than treat one state as national law. Actual sector and provider status remain separate.

### Austria 2.06 implementation and verification in progress

The draft 1.7.0 catalogue adds 16 Austrian national actions and 16 official/provider sources across six sectors and eight topics. It retains all prior requirements as an append-only prefix and marks all 48 Austrian cells `PARTIALLY_PUBLISHED` with regional status `IN_REVIEW`. The [pack notes](packs/austria/README.md) and [nine-Länder inventory](packs/austria/regional-review.md) explain the 2027 private-school transition, conditional school-protection scope and incomplete state rules. The source-link check returned HTTP 200 for 11 of 16 records; RIS returned HTTP 503 for five legal-provision links while official indexed results provided their text. Do not call these five links live-validated.

API typecheck, build and lint passed. Thirty-one compliance unit suites / 232 tests passed; final-date and England non-fallback fixtures passed after the 30 December 2026 review deadline correction. Exact-file Prettier and `git diff --check` passed; the first formatting check found the regional inventory table and it was formatted. Initial typecheck/Jest runs stalled under host contention from unrelated worktree workers; sequential reruns passed.

The first full disposable-database integration run passed 107 of 108 suites but failed two assertions in the unrelated `family-identity-import.e2e.spec.ts` suite. All four identity-import tests passed when rerun alone against a fresh database. A second full run then failed in the unrelated ACE notice draft suite after a 153-second test, while that suite had passed in the first run; the already-failed rerun was stopped to avoid further host load. All ten ACE notice tests passed when rerun alone. The two relevant tracker integration suites passed 13 tests on a fresh disposable database. The full local integration suite is **not counted as passed**. This step must use a draft PR until current-head host CI verifies the full suite; if CI fails, diagnose and fix before merge. No UI or schema files changed, so desktop/mobile inspection and new migration validation do not apply. Belgium remains gated.

### Austria 2.06 merged; Belgium 2.07 begins

[PR #666](https://github.com/FSS-Ltd/pathway/pull/666) began as a draft because the local full integration attempts did not pass under host contention. All eight host checks passed on `1c9b432c3982c64e226c45e9d79f4b3bd347b2f4`, including the full integration suite, unit/type/lint, organisation-role RLS, permission definitions, system-role identity and CodeQL. The PR was marked ready only after that current-head result. GitHub confirmed MERGED at 2026-10-18T07:25:03Z, merge `3d32cfee3c515dd701faf19f6bb8c6effd7e0ff7`. The [production workflow](https://github.com/FSS-Ltd/pathway/actions/runs/39107580352) passed on the merge. RIS direct links returned HTTP 503 during scripted checks; exact 2026 legal text was cross-checked from official indexed RIS results, and the pack retains its explicit source-review deadline of 30 December 2026 before the 2027 private-school law change.

Step 2.07 starts from the verified Austria merge on `feature/compliance-belgium-pack`. Belgium's education and childcare powers differ across language Communities and Regions, so a single national school rule must not be inferred. Publish only reviewed national/shared actions and explicit subnational gaps. Bulgaria remains gated until Belgium's own PR has green current-head CI and a host-confirmed merge.

### Belgium 2.07 local verification in progress

Catalogue 1.8.0 adds 12 conditional shared-core actions and 16 official/provider sources, preserving the 1.7.0 release as an append-only prefix. All 48 Belgium sector/topic cells are `PARTIALLY_PUBLISHED`, with Community and regional status `IN_REVIEW`. The [pack notes](packs/belgium/README.md) and [Community inventory](packs/belgium/regional-review.md) make clear that language Community, Region and local authority routes remain incomplete, especially in Brussels. School recognition, subsidy, ACE identity and the selected portal vertical are separate facts. Model 596-2 follows child-facing role assessment, not mere parent access. ICCE follows actual qualifications.

Primary-source review used Belgian federal, Community and regulator sites, EUR-Lex and ICCE. Scripted link checks returned HTTP 200 for 14 of 16 final source links. The German-speaking Community PDF returned HTTP 403 and FAVV/AFSCA returned a connection failure in curl, while official indexed search exposed both pages and their relevant content; these two are **not** counted as live-validated. The first ONE PDF link returned HTTP 404 and was replaced with its live official HTML page before delivery. Source summaries in Dutch, French and German are labelled working translations. Community-specific duties remain unpublished pending legal and regional review.

Local API typecheck, build and lint passed. Thirty-two compliance unit suites / 234 tests passed on the corrected scope metadata, as did the full disposable-database integration suite (108 suites / 639 tests). Exact-file Prettier and `git diff --check` passed. The first integration attempt exposed that Community source records need the `BE` parent code for catalogue validation; the source metadata and regression assertions were corrected before the complete passing rerun. No UI or schema files changed, so desktop/mobile inspection and new migration validation do not apply. The PR's current-head CI and merge remain the step gate.

The branch was rebased onto current `fss/master` after the unrelated finance webhook merge. All 32 compliance unit suites / 234 tests passed again. The first post-rebase API typecheck found a stale local generated Prisma client for that finance migration; `pnpm --filter @pathway/db prisma:generate` resolved it, and API typecheck and build then passed. The full disposable integration run predates this unrelated finance rebase; current-head host CI must verify the combined revision before merge.

### Belgium 2.07 merged; Bulgaria 2.08 begins

[PR #667](https://github.com/FSS-Ltd/pathway/pull/667) passed all eight required checks on `a6c50f7a2e9396b7bd0fd8a1f92af602a3e1a6a9`: typecheck/lint/full unit, full integration, organisation-role RLS, permission-definition database, system-role identity, CodeQL and both language analyses. GitHub reported the PR clean and MERGED at 2026-10-18T14:25:51Z with merge commit `ae7ec58de58707ca9554a396c53d85d8cb048102`; `fss/master` was verified at that commit. [Production workflow 39135952383](https://github.com/FSS-Ltd/pathway/actions/runs/39135952383) passed on the merge. Step 2.08 begins from that exact merge on `feature/compliance-bulgaria-pack`; Croatia remains gated until Bulgaria's own PR has green current-head CI and a host-confirmed merge.

### Bulgaria 2.08 local verification

Catalogue 1.9.0 publishes 15 conditional Bulgaria actions and 18 official/provider sources across all six coverage sectors and eight topics. All 48 cells remain `PARTIALLY_PUBLISHED`, with oblast and municipal rules explicitly `IN_REVIEW`. The pack distinguishes actual private schools from learning centres and kindergarten registration from nursery health rules. Source links were checked on 2026-10-18: 14 returned HTTP 200; four Ministry of Education/register links returned HTTP 403 to curl, but the current ministry service, law and register were independently found through indexed official ministry pages. No UI or schema files changed, so desktop/mobile inspection and Prisma migration validation do not apply.

Local API typecheck, lint and build passed. All 33 compliance unit suites / 237 tests and the full disposable-database integration suite (108 suites / 640 tests) passed. The first unit run found an invalid nursery test fixture; it was corrected to use the Learning Centre sector and vertical with an early-years provider category before the passing rerun. Exact-file formatting and final diff checks remain before PR creation; current-head CI and host-confirmed merge are the gate to Croatia.

### Bulgaria 2.08 merged; Croatia 2.09 begins

[PR #668](https://github.com/FSS-Ltd/pathway/pull/668) passed all eight required checks on `7658e67a11571484837f6fcc00902a3ec42fe42f`. The first host integration attempt failed one unrelated finance-ledger RLS fixture while 639 tests passed; the rerun passed all required checks on the unchanged head. GitHub reported the PR clean and MERGED at 2026-10-18T20:42:26Z with merge commit `6ec4d1f52bcbeb250f0438ee716ef1e5f44a425e`, confirmed on `fss/master`. Step 2.09 begins from that merge on `feature/compliance-croatia-pack`; Cyprus remains gated until Croatia's own PR is green and merged. Croatia source review has begun with the government school and kindergarten establishment guidance, education inspectorate, workplace-safety guidance, data-protection authority and child-protection police protocol. The Bulgaria merge's production workflow was still running at this handoff and must be checked before any deployment claim.

The Bulgaria merge's own [Vercel workflow 39164535224](https://github.com/FSS-Ltd/pathway/actions/runs/39164535224) later failed in the web build on a `Link` JSX type incompatibility outside the pack; its master CI passed. A subsequent [master deployment 39169102768](https://github.com/FSS-Ltd/pathway/actions/runs/39169102768) on `144d4e3f68c807932cc63a76d484c75e3532f28b`, which includes the Bulgaria merge, succeeded for migrations, API, web and admin. No authenticated live-portal walkthrough was performed for the Bulgaria catalogue.

### Croatia 2.09 local review and verification

Catalogue 1.10.0 adds 16 conditional actions and 18 official/provider sources, with 48 sector/topic cells still partial and all county/Zagreb rules in review. Government guidance separates private-school start approval, kindergarten establishment and shorter preschool programmes; the latter remains a _review recommendation_ for young out-of-school provision because pupil age alone does not establish the legal programme. Source links were checked on 2026-10-18: one redirecting kindergarten link was replaced with its working official page, and all 18 final links returned HTTP 200. API lint, typecheck, build, all 34 compliance unit suites / 241 tests and the full disposable-database integration suite (108 suites / 640 tests) passed. The initial typecheck/build attempts used a stale generated Prisma client after unrelated finance migrations; client regeneration resolved them. Exact-file Prettier and staged diff whitespace checks passed; all changed files and source/applicability conditions were reviewed before PR creation. No UI or schema files changed, so desktop/mobile inspection and Prisma migration validation do not apply. Current-head CI and host-confirmed merge remain the gate to Cyprus.

### Croatia 2.09 merged; Cyprus 2.10 begins

[PR #671](https://github.com/FSS-Ltd/pathway/pull/671) passed all eight required current-head checks on `4630e93bc5406fce1f14be55eadf91e076991565`. GitHub reported it clean and MERGED at 2026-10-18T22:49:41Z with merge commit `143aff5863cda9e27e788840a03fc0bf0bf4911d`; `fss/master` was verified at that commit. Master CI and [production deployment 39173913581](https://github.com/FSS-Ltd/pathway/actions/runs/39173913581) succeeded on the merge. Step 2.10 starts from that merge on `feature/compliance-cyprus-pack`; Czechia remains gated until Cyprus has its own green current-head PR and host-confirmed merge.

Initial Cyprus source review found separate routes for private schools and kindergartens, ministry-approved private institutes, infant and preschool care centres, and school-age day-care centres. A Learning Centre's name or pupil age alone cannot select one of these legal categories; the pack must ask about actual provision and keep unresolved classification visible. Cyprus-specific implementation and tests remain in progress.

### Final coverage audit after step 2.31

Before calling the EU/UK programme covered, re-review every jurisdiction × sector × topic cell and applicable regional subdivision against current primary authority sources. For each cell, verify source currency and classification, provider and activity conditions, expected evidence, and the difference between legal duties, guidance, recommendations and ICCE terms. Exercise representative school, ACE, learning-centre, childcare, food and cross-border fixtures; confirm unresolved profile facts, missing packs and permission-restricted signals never appear as no obligations or completed actions. Recheck manual progress, history and tenant isolation, and inspect the tracker in the running portal at desktop/mobile sizes. Fix discovered gaps through separately verified PRs under the same CI-and-merge gate. Publish a final coverage report listing any remaining partial or unreviewed cells; do not claim full coverage until the matrix and regional inventories support it. Legal applicability remains subject to local authority confirmation for each site.

### Cyprus 2.10 PR raised; CI and merge pending

Catalogue 1.11.0 adds 15 conditional actions and 15 official/provider sources. It separates ministerial private-school and private-institute routes from Social Welfare pre-school and school-age day-care registration. All 48 Cyprus sector/topic cells are explicitly partial with district review outstanding. The legal subtype of out-of-school teaching or childcare is not inferred from the portal vertical or childcare flag; those actions ask for authority confirmation.

Local verification on the pre-rebase branch: the catalogue schema loaded with 48 partial cells, 15 actions and 15 sources; API typecheck, lint, build, 35 compliance unit suites / 245 tests, full disposable-database integration (108 suites / 640 tests), exact-file Prettier and staged diff checks passed. A fixture initially treated unknown childcare as false; it was corrected to preserve the unresolved state, and the suite passed on rerun. Source-link script checks returned 200/202 for 11 distinct URLs; three official police, data-protection and food-registry links returned 403 to scripted access but their current primary-source text was found in search indexing and must be manually rechecked in the final coverage audit. No UI or schema files changed, so desktop/mobile inspection and Prisma migration validation do not apply. [PR #675](https://github.com/FSS-Ltd/pathway/pull/675) was raised from reviewed commit `3c860dc57a523411d315402836ed0af7ce848eaa`, rebased on `fss/master` at `fc85ecc9a380a16bec92278468eb8e8eab993086`. After that rebase, Prisma schema validation, API typecheck, lint and build, 35 compliance unit suites / 245 tests, and the full disposable-database integration suite (108 suites / 642 tests) passed. The commit hook passed 269 API unit suites / 1,895 tests plus worker and auth tests. An initial rebased integration run had transient HTTP/fixture errors in notice and agreement tests; those files passed in isolation and the unchanged revision passed a complete rerun. This progress-record update changes the PR head, so current-head CI and host-confirmed merge remain required. Czechia 2.11 remains gated.

### Cyprus 2.10 merged; Czechia 2.11 in progress

[PR #675](https://github.com/FSS-Ltd/pathway/pull/675) passed all eight required CI checks on current head `74dcedfc0240f990fb6111f2a934eb8467fbbca5`. GitHub reported it clean and MERGED at 2026-10-19T21:29:27Z with merge commit `3d5e60df5b4df2154b432d94cf867dc7efe8be94`, verified at `fss/master`. Czechia starts from that merge on `feature/compliance-czechia-pack`. Its national source and applicability review is under way; Denmark remains gated until Czechia's current-head CI passes and GitHub confirms its merge.

### Czechia 2.11 local review and verification

Catalogue 1.12.0 adds 15 actions and 18 official/provider sources. It separates school-register routes from ordinary and neighbourhood children's-group authorisation; all 48 sector/topic cells remain partial and 14 regional inventories remain in review. The profile's childcare and vertical flags do not establish legal subtype or funding. All 18 source links returned HTTP 200 or 202 on 2026-10-19. Catalogue schema, API typecheck, lint, build, Prisma schema validation, 36 compliance unit suites / 248 tests, full disposable-database integration (108 suites / 642 tests), exact-file Prettier and staged diff whitespace checks passed. The additional unknown-care regression test passed on the current working tree. The commit hook passed 290 API unit suites / 1,971 tests, plus 15 worker suites / 66 tests and three auth suites / 15 tests. No UI or schema files changed, so desktop/mobile inspection and migration validation do not apply. [PR #676](https://github.com/FSS-Ltd/pathway/pull/676) was raised from reviewed commit `aef2c29b67f53ee3a2311526b8b8dd8004e879fb`. This progress-record update changes the PR head, so current-head CI and host-confirmed merge remain the gate to Denmark.

### Czechia 2.11 merged; Denmark 2.12 begins

[PR #676](https://github.com/FSS-Ltd/pathway/pull/676) passed all eight required checks on current head `34eaa416b264af9969c9e206c145281d0a54bc45`. GitHub reported it clean and MERGED at 2026-10-19T21:59:30Z with merge commit `c0bdf72c3c43f94d7d08390162e18adc26b2a256`, verified at `fss/master`. Denmark begins from that commit on `feature/compliance-denmark-pack`; Estonia remains gated until Denmark has its own green current-head PR and host-confirmed merge.

Initial Denmark authority review found distinct routes for [state-subsidised independent primary schools](https://uvm.dk/grundskole/frie-grundskoler/om-frie-grundskoler/vejledning-til-oprettelse-af-en-fri-grundskole-eller-afdeling-heraf/) and [municipally approved private daycare](https://lifeindenmark.borger.dk/family-and-children/childcare/rules-for-day-care-facilities/). The school's subsidy application is conditional; an ACE label does not establish public funding. [Police guidance](https://politi.dk/boerneattest) makes child-certificate collection role- and age-specific rather than an adult-account requirement. [Workplace APV](https://at.dk/kend-din-rolle/arbejdsgiver/arbejdspladsvurdering/), [school/data-protection guidance](https://www.datatilsynet.dk/regler-og-vejledning/skoler-og-daginstitutioner), [food registration](https://foedevarestyrelsen.dk/kost-og-foedevarer/start-og-drift-af-foedevarevirksomhed/autorisation-og-registrering) and [child-protection notification](https://www.sm.dk/arbejdsomraader/boern-og-unge-i-udsatte-positioner/underretningspligt) are candidate pack sources. Municipal approvals matter for childcare. [Statistics Denmark](https://www.dst.dk/da/Statistik/dokumentation/statistikdokumentation/kommunal--og-regionalvalg/sammenlignelighed) records a five-to-four-region change effective 2027-01-01, so the regional inventory must be time-aware. Denmark-specific checklist implementation and source/applicability review remain in progress.

### Denmark 2.12 local review and verification

Catalogue 1.13.0 adds 16 actions and 17 official/provider sources, with all 48 sector/topic cells partial and the 98 municipalities still in review. The source-review expiry is set before the 2027 regional change; the pack excludes Greenland and the Faroe Islands. All 17 source URLs returned HTTP 200 on 2026-10-19. Catalogue schema, API typecheck, lint and build, Prisma schema validation, 37 compliance unit suites / 253 tests, exact-file Prettier, source-reference and staged diff checks passed. The first full disposable-database run reported socket errors in an unrelated student-attendance file and later exited with code 139; that file passed all five tests in isolation, and the unchanged full suite passed on rerun (108 suites / 642 tests). The commit hook passed repository lint plus API, worker and auth tests. No UI or schema files changed, so desktop/mobile inspection and migration validation do not apply. [PR #677](https://github.com/FSS-Ltd/pathway/pull/677) was raised from reviewed commit `f0140e5ee7324fdc46875710e2982ff8530b64b2`. This progress-record update changes the PR head, so current-head CI and host-confirmed merge remain the gate to Estonia.

### Denmark 2.12 merged; Estonia 2.13 begins

[PR #677](https://github.com/FSS-Ltd/pathway/pull/677) passed all eight required checks on current head `72f892502d3dad111bcc98b9022563719c033651`: typecheck/lint/unit, integration, organisation-role RLS, permission-definition database, system-role identity, CodeQL and both language analyses. GitHub reported it clean and MERGED at 2026-10-19T22:32:05Z with merge commit `71700a4bb6db507ce9f8473a72a72faea35768ad`, verified at `fss/master`. Estonia starts from that merge on `feature/compliance-estonia-pack`; Finland remains gated until Estonia has its own green current-head PR and host-confirmed merge.

Initial Estonia review found that the [education ministry](https://hm.ee/uldharidus-ja-noored/opetaja-koolijuht-ja-kooli-pidaja/koolitus-voi-tegevusluba) separates private general-school activity licences, municipal education permits and hobby-school registration. The [Early Childhood Education Act](https://www.riigiteataja.ee/en/tolge/pdf/503092025001) came into force on 2025-09-01 and distinguishes preschool from childcare institutions, including the 2026 transition from former childcare routes; the portal's sector or learner age cannot select a legal subtype. [Child Protection Act section 20](https://www.riigiteataja.ee/en/akt/503022025002) concerns people actually working with children, and [section 27 reporting guidance](https://www.sotsiaalkindlustusamet.ee/lapse-heaolu-hindamise-kasiraamat/teade-abivajavast-ja-hadaohus-olevast-lapsest) directs concerns to local government or 116111. [Labour Inspectorate risk-assessment guidance](https://www.tooelu.ee/en/79/risk-assessment) and [food-authority catering guidance](https://pta.agri.ee/en/food/retail-trade-and-catering) identify conditional employer and food-operator duties.

### Estonia 2.13 local review and verification

Catalogue 1.14.0 adds 16 conditional actions and 18 official/provider sources, with all 48 sector/topic cells partial and 15 counties and 79 municipalities in review. All 18 source URLs returned HTTP 200 on 2026-10-19. Catalogue schema, API typecheck, lint and build, Prisma schema validation with a disposable URL, all 38 compliance unit suites / 257 tests, exact-file Prettier and staged diff whitespace checks passed. Full disposable-database integration passed **108 suites / 642 tests** after providing the required tenant-RLS role. The first unit run exposed an out-of-range review date and a stale Wales count; both were corrected. Two initial integration invocations used the wrong local database or lacked bootstrap/role settings, causing setup failures; the unchanged application code passed once the named disposable database was bootstrapped correctly. The final staged diff and source/applicability conditions were reviewed. No UI or schema files changed, so desktop/mobile inspection and migration validation do not apply. [PR #678](https://github.com/FSS-Ltd/pathway/pull/678) was raised from reviewed commit `fc3de617a6f5d29d22832ee116701b8c993f99b3`. This progress-record update changes the PR head, so current-head CI and host-confirmed merge remain the gate to Finland.
