# NexSteps Finance delivery progress

Every T01–T19 step is a separate PR. The next step may not start until the current PR revision has applicable passing CI and GitHub confirms the PR merged into master. A draft, local commit, green stale revision or merge-queue entry does not clear the gate.

**T01:** Discovery and compatibility findings recorded. [PR #632](https://github.com/FSS-Ltd/pathway/pull/632) is merged to `master` at `2c84296f9e6a729ec919889489a837f45fbb990b`.

### T01 CI evidence

On final PR head `29dafff55b662bb276991a5f739f0e5049663387`, GitHub reported passing typecheck/lint/unit tests, integration tests, organisation-role RLS, permission-definition database, system-role seed database identity, Analyze actions, Analyze JS/TS and CodeQL. GitHub confirmed merge on 15 October 2026 at 12:36:36 UTC with merge commit `2c84296f9e6a729ec919889489a837f45fbb990b`.

## T01 evidence

- Follow-up pricing direction: the user specified target standalone Finance Stripe prices of £29 monthly / £290 annually. The current catalogue still lists £15/£150 as Proposed; T07 must reconcile the catalogue and Stripe configuration before any live checkout. No product or price was changed in T01.
- Read-only NexSteps Sandbox snapshot on 15 October 2026: test mode, GB, Standard company account; card payments and transfers active; charges and payouts enabled. The response included Bacs display settings but no Bacs capability. This establishes account-level card eligibility only.
- Read-only v1 and v2 connected-account lists returned no school-like account. No account-scoped card payment, Checkout session, mandate, charge, refund, payout or webhook simulation was performed. T07–T10 must exercise the school-connected card flow using a disposable connected test account. T13 must prove exact Bacs compatibility; Stripe's current Connect Bacs guide documents destination charges and does not document the planned direct-charge path. Do not substitute charge models without an approved architecture decision.
- No Stripe object was created or changed; no live mode or production credentials were accessed.

- Repository code graph was missing at checkout. graphify update . generated 7,265 nodes and 10,788 edges across 2,035 files. After the Finance docs were written, semantic nodes were added and the supported Graphify build/cluster/report APIs regenerated a 7,280-node, 10,796-edge graph and report. HTML export was skipped because Graphify does not support visualising graphs over 5,000 nodes.
- Dependency installation completed package linking but exited with ERR_PNPM_IGNORED_BUILDS for unapproved dependency build scripts. The repository pnpm-workspace.yaml was restored to its tracked content; no build-script approvals were added.
- Jest baselines were invoked directly from installed package binaries to avoid changing pnpm's script approval policy. Prettier and git diff whitespace checks passed for the documentation.
- API tests run directly through the installed Jest binary: billing provider configuration; entitlement service/enforcement; module grants; buy-now service; Stripe buy-now provider (6 suites, 62 tests passed).
- Scope is planning/discovery only. No production migration, payment account, Stripe Product/Price, live payment, deployment, or source-code change.

## Merge gate

T01's compatibility evidence records both the sandbox account facts and the specific missing school-connected fixture; the account-scoped payment tests are acceptance criteria in T07–T10, and Bacs remains blocked in T13.

**T02:** Implementation [PR #635](https://github.com/FSS-Ltd/pathway/pull/635) merged into `master` on 15 October 2026. It adds tenant/org-scoped GBP ledger tables, integer minor-unit rules, tenant RLS, schema checks and concurrent invoice-number sequence coverage.

T02 local verification on 15 October 2026: Prisma schema validation and client generation passed; the dedicated local E2E database applied migration `20261018000000_finance_ledger_foundation` and reported up to date. API and database typechecks, targeted ESLint, Prettier, the Finance money unit test, schema contract tests, and all four Finance RLS/ledger E2E tests passed. The strict RLS gate passed with the repository's `SUPABASE_RLS_GATE_ACCEPTED=true` setting; it reported three existing unrelated app tables (`ChildGuardianContact`, `IdentityWebhookEvent`, `OrgDeletedUser`) as disabled, which that accepted gate permits. The normal E2E global setup could not run locally because pnpm attempted an install and hit `EPERM` creating a worktree temp file; the Finance E2E suite was run after a guarded Prisma reset of the dedicated local E2E database and the repository's RLS-role provisioning helper. The full pre-commit hook passed: lint; API unit tests (223 suites, 1,575 tests); worker tests (11 suites, 45 tests); auth tests (3 suites, 15 tests).

GitHub CI passed on PR #635 head `e4ff39d9847b5777b7aa4d672ab4ae2ad8a287be`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` at 13:55:25 UTC on 15 October 2026, merge commit `30656413efbf3868732e38ba92576a3be69c90e5`.

**T03:** Finance access modes, payer grants and role permissions implemented in [PR #637](https://github.com/FSS-Ltd/pathway/pull/637). The change adds active/servicing/locked policy enforcement, revocable tenant-scoped payer grants, independently approved actions and Finance servicing capabilities.

GitHub CI passed on final PR head `0f4fe0da80d1f5a89717bc0ec31928d9c16aebbd`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` at 21:45:25 UTC on 15 October 2026, merge commit `99ec75098173043ab31f47c06e0a8ac2cea62fa0`.

**T04:** Invoice and credit-note lifecycle implemented in [PR #641](https://github.com/FSS-Ltd/pathway/pull/641), merged to `master`. The API supports draft, review, independent approval, issue, void, and credit-note flows with immutable issued snapshots, integer-money calculations, idempotent commands, tenant RLS, and concurrent invoice numbering.

Local verification on the T04 revision: API typecheck, targeted ESLint and Prettier, focused health/Finance lifecycle integration tests, and Finance ledger/RLS tests (6 tests with `E2E_TENANT_RLS_ROLE=pathway_e2e_tenant_rls`) passed. The commit hook passed repository-wide lint and API unit tests (232 suites, 1,670 tests). A full local API integration run with the tenant RLS role configured remained red in this shared local database (16 suites and 51 tests failed; 572 passed, 1 skipped). The isolated GitHub integration suite and one-connection transaction test both passed on the final PR revision.

GitHub CI passed on final PR head `eb8e15dc6414247a3a16d792c21202756b0b4195`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 15 October 2026 at 23:43:47 UTC, merge commit `9ddf502d1ffc3b5f3284a8608fcb5551cdd2ed78`.

**T05:** Confirmed receipt allocation, append-only allocation reversals and shared invoice balance projections implemented in [PR #645](https://github.com/FSS-Ltd/pathway/pull/645). Receipt reads and commands are tenant/org scoped; allocations require confirmed funds and the matching payer account, and row locks prevent concurrent over-allocation. Receipt evidence has immutable financial facts and a one-time processing-to-terminal transition. Reversals remain append-only and the new reversal table is included in the strict RLS gate.

Local verification on final PR head `22554acfa31479d38ddf7050253ff54e6bb71485`: Prisma schema validation and client generation, API and database typechecks, API production build, targeted Finance ESLint and Prettier, and `git diff --check` passed. The database unit suite passed (11 suites, 73 tests); the API unit suite passed (233 suites, 1,672 tests). Focused local integration checks passed for receipt allocation, racing allocations, invoice lifecycle and reversal-table RLS. The repository commit hook passed workspace lint, API unit tests (233 suites, 1,672 tests), worker tests (11 suites, 45 tests) and auth tests (3 suites, 15 tests). The first CI run identified a stale hard-coded migration count and a missing reversal table in the strict RLS list; both were fixed before the final checked revision.

GitHub CI passed on final PR head `22554acfa31479d38ddf7050253ff54e6bb71485`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 16 October 2026 at 01:28:40 UTC, merge commit `8ddcc8682fd80b4591cfbb70a3ece7bfd18eb7c9`.

**T06:** School bank-transfer destinations, payer transfer notices, and independently approved manual receipts implemented in [PR #656](https://github.com/FSS-Ltd/pathway/pull/656). Bank details are encrypted at rest, changes and notices are append-only evidence, payer notices do not post receipts, and manual receipts become confirmed only after independent staff approval. The routes enforce Finance access modes, tenant/org scope, explicit payer grants, idempotency and duplicate-reference protections.

Local verification on T06 head `3c6cc92e3098e4870877a114364dfaaa7550b939`: API and database typechecks and lint, Prisma schema validation, focused API unit tests (3 suites, 21 tests), database unit tests (2 suites, 23 tests), manual-transfer E2E (1 test), Finance ledger/RLS E2E (6 tests), changed TypeScript formatting, Node syntax validation for the RLS gate, and `git diff --check` passed. The commit hook passed workspace lint, API unit tests (238 suites, 1,719 tests), worker tests (12 suites, 51 tests), and auth tests (3 suites, 15 tests). Jest noted one API worker needed forced exit at teardown; the suite exited successfully.

GitHub CI passed on PR #656 head `3c6cc92e3098e4870877a114364dfaaa7550b939`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 17 October 2026 at 15:33:39 UTC, merge commit `52fafdf4f2f57986c93eab1a19009324537e84ad`.
