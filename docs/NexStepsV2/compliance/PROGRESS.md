# Compliance delivery progress

Plan: [README.md](README.md), [DELIVERY.md](DELIVERY.md).
Updated: 2026-10-15. Base repository: `FSS-Ltd/pathway`; branch: `master`.

## Current step: medical encrypted-value correction

**State: medical correction in progress; not complete.** Steps 1.1–1.6 are merged. England research is preserved; its runtime pack is not published.
No country pack is published.

| Evidence               | Value                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Scope                  | Unreadable medical fields, overwrite prevention and truthful live evidence                         |
| Branch                 | `fix/compliance-medical-ciphertext`                                                                |
| Verified starting base | `47d698d053df8d91696fec7e330d837e28f93c2b`                                                         |
| Predecessor            | [PR #631](https://github.com/FSS-Ltd/pathway/pull/631), host-confirmed merged 2026-10-15T11:18:42Z |
| PR / revision / CI     | Not raised; local fix verification in progress                                                     |
| Merge state            | Unmerged; no completion claim                                                                      |
| Next permitted action  | Verify and deliver this correction; resume the preserved England research afterward                |

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
