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

**T07:** Stripe-connected Finance entitlement and onboarding merged in [PR #660](https://github.com/FSS-Ltd/pathway/pull/660). The catalogue and NexSteps sandbox Finance product use the user-directed recurring GBP prices of £29/month and £290/year. The change adds tenant/org-scoped Stripe connections, immutable connection identity and terminal-disconnect evidence, active-only account management, status/onboarding/refresh/disconnect routes, and a disabled-by-default Accounts v2 adapter. School invoice collection remains separate from NexSteps subscription billing; collection readiness stays false until Stripe reports card payments active.

T07 local verification included API/database typechecks, Prisma validation, focused API and database tests, catalogue/configurator tests, focused lint and formatting, and `git diff --check`. The admin package typecheck was unavailable locally because TypeScript could not resolve the installed `@stripe/stripe-js` dependency in that worktree. GitHub CI passed on final PR head `05468016996cbbba5148c80b17bff7fd7c42f562`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge into `master` on 17 October 2026 at 23:52:59 UTC, merge commit `b12fc72499fb24b260c64601bb90075a3a99646f`.

**T07 provider proof:** The user-provided `TEST_STRIPE_SECRET_KEY` successfully authenticated to NexSteps Sandbox in test mode. Accounts v2 account creation and hosted onboarding-link creation returned HTTP 200. The connected account remained card-payments `restricted`, so collection readiness remained false. A Stripe API version mismatch for one onboarding-link field was removed and covered by a regression test. No payment was created and no live-mode request was made. The test-mode Finance webhook now uses its separate `FINANCE_STRIPE_WEBHOOK_SECRET_TEST` setting; no credentials or hosted onboarding link are recorded here.

**T08:** Durable Finance Stripe webhook inbox and replay implemented in [PR #665](https://github.com/FSS-Ltd/pathway/pull/665), merged into `master`. `POST /finance/stripe/webhook` verifies Stripe's signature against the exact raw body and mode-specific Finance webhook secret, then persists before acknowledging. The inbox deduplicates Stripe event IDs, binds known account IDs to tenant/org scope, preserves unknown accounts as `UNMATCHED`, and applies forced tenant RLS plus immutable payload evidence. It maps v1 connected-account IDs and Accounts v2 `acct_` contexts or `v2.core.account` related-object IDs; malformed or unrelated contexts remain unmatched. A worker lease/retry/dead-letter loop renews each claim immediately before processing and skips reclaimed events. The worker calls a timing-safe authenticated internal endpoint over HTTPS (or local HTTP), refreshes account status from Stripe for account-update events, and defers payment/unknown event types until their owning Finance handlers are implemented. T08 does not post receipts.

T08 local verification passed: API, worker and database typechecks; Prisma schema validation; API Finance Stripe tests (6 suites, 25 tests); worker focused tests (2 suites, 8 tests); Finance ledger/RLS E2E (8 tests, including duplicate, unmatched, scope discovery and forged cross-tenant insert); targeted ESLint; Prettier; and `git diff --check`. API and worker TypeScript builds passed when emitted to temporary directories. The normal package build commands could not write their configured output paths inside this managed worktree (`EPERM`); no generated build files were added. A fresh isolated local database applied all 160 migrations with no pending migrations before the E2E run. The shared `pathway_test_e2e` database has unrelated migration-history drift and was left otherwise unchanged; the two failed local attempts against `20261012000000_module_change_grants` are marked rolled back.

GitHub CI passed on final PR #665 head `968f6dce9009374fb233f19e4fc4cbdb47751fdd`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 18 October 2026 at 09:19:05 UTC, merge commit `d35d76b3d7cb5e30aa3c7b20462fbdb202d8abdb`.

**T09:** Checkout recovery is implemented and merged in [PR #669](https://github.com/FSS-Ltd/pathway/pull/669). Checkout attempts have a partial unique constraint per invoice obligation, tenant RLS, immutable session evidence and connection/grant/invoice scope validation. The API calculates the amount from the current invoice balance, reuses unresolved attempts with a stable Stripe idempotency key after timeouts, expires/replaces stale sessions when the balance changes, and never treats a return redirect as payment. Manual allocation reserves funds promised to unresolved card sessions. Payer-grant revocation expires open hosted Checkout sessions before revocation commits; in-flight session creation rechecks the grant before exposing a URL.

T09 local verification: Prisma validation and deployment of all 161 migrations passed on a fresh isolated database cloned from the T08 fixture; focused checkout and payer-grant unit tests passed (4 suites, 23 tests); Finance ledger/RLS and receipt-allocation integration tests passed (2 suites, 9 tests), including checkout-attempt insertion/scope-trigger coverage, schema RLS, uniqueness and allocation reservation. The post-rebase repository hook passed Turbo lint across 16 packages, API unit tests (265 suites, 1,875 tests), worker tests (14 suites, 59 tests), and auth tests (3 suites, 15 tests). API and database typechecks and TypeScript builds passed; database unit tests passed (11 suites, 74 tests); targeted API ESLint and Prettier checks passed; `git diff --check` passed. The initial T08 scope-discovery assertion exposed a sub-millisecond precision edge; its test cutoff now includes a one-second grace and the full Finance RLS/receipt set passes. The repository's global `prisma migrate reset` path failed on the disposable database because the legacy `app` schema survived reset and the historical `20251223102405_new_auth_config` migration then targeted a pre-existing table; verification used a fresh cloned test database with `prisma migrate deploy` instead. No production or shared application database was changed.

GitHub CI passed on final PR #669 head `8c7001479db97b640c50e9edc038e6b434fc88aa`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 18 October 2026 at 20:44:44 UTC, merge commit `c6b3f542a750dc846340fe54e2432405f1534249`.

**Provider evidence and limitation:** the NexSteps Sandbox has a school test connection, but its card-payments capability is not active. Provider-backed Checkout creation remains unverified; no payment was created. The account-scoped provider contract, timeout recovery, revocation expiry and receipt reservation are covered by local tests. This does not block T10's signed-event and ledger implementation; provider-created payment evidence remains a release assurance item.

**T10:** Signed Checkout Session events are validated against the stored event, connected account, environment, immutable attempt, invoice, amount and currency. Only `payment_status=paid` creates an immutable confirmed receipt. Completed-but-unpaid sessions retain their reservation; failure and expiry release it; a later confirmed event can settle an attempt after an earlier failure/expiry event. Receipt creation and allocation run in one tenant-scoped transaction under an invoice row lock. Allocation cannot exceed the current outstanding balance, so excess remains unapplied. Duplicate events/sessions cannot create a second receipt. Processor fees and payouts remain separate from family debt. Implemented in [PR #670](https://github.com/FSS-Ltd/pathway/pull/670).

T10 local verification: all 162 Prisma migrations deployed to a new disposable local database; Finance receipt and allocation E2E tests passed (2 suites, 2 tests), including post-expiry payment confirmation, duplicate-session replay, competing manual allocations and concurrent Stripe receipts bounded to the remaining invoice balance. Focused webhook/payment unit tests passed (2 suites, 13 tests); API typecheck, targeted ESLint and Prettier checks, and `git diff --check` passed. The existing E2E database was left untouched because it is behind at migration 130. No Stripe payment was created; the sandbox school account still lacks active card-payments capability.

GitHub CI passed on PR #670 head `2b112b825dd830ba3a3033c3f8c61985bf03175c`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 18 October 2026 at 21:43:29 UTC, merge commit `144d4e3f68c807932cc63a76d484c75e3532f28b`.

**T11 (complete):** Private invoice, credit, receipt and statement documents, on-demand and month-end statements, scoped secure notices, and school currency settings. The selected legal country determines the local collection currency (EUR for 21 euro-area countries, CZK/DKK/HUF/PLN/RON/SEK for the other six EU countries, and GBP for the UK). Stripe onboarding requires saved settings, and checkout uses the immutable invoice currency. Settings lock after Stripe setup or Finance activity. Implemented in [PR #672](https://github.com/FSS-Ltd/pathway/pull/672).

T11 verification on final PR head `a7aa4eac3675f3a34e981c17641abdaafd15ec3f`: local commit hook passed workspace lint, API unit tests (283 suites, 1,938 tests), worker tests (15 suites, 66 tests), and auth tests (3 suites, 15 tests). Focused manual-transfer E2E passed against disposable database `pathway_finance_t11_20261019`; earlier Finance ledger/RLS, receipt allocation and invoice lifecycle E2E checks also passed. API, admin, database and platform typechecks; API and admin production builds; Finance PDF smoke test; Prisma validation; platform country/currency and database schema contracts; Prettier; targeted lint; and `git diff --check` passed. The admin build used explicit mock API mode and a fake test-format Clerk key for static generation. GitHub CI run #1597 passed on the final head: typecheck/lint/unit, integration (108 suites, 641 tests), one-connection transaction checks (2 suites, 13 tests), organisation-role RLS, permission-definition database, and system-role seed database identity. Run #1596 exposed a stale manual-transfer response expectation after currency and outstanding-balance fields were added; the assertion was corrected and the final CI passed. GitHub confirmed merge to `master` on 19 October 2026 at 13:20:42 UTC, merge commit `73bf3783cf6a60c85ae6d5208adeb3f7f13cb090`. No Chrome browser E2E was run, per the user's memory constraint. The connected school Stripe test account still lacks active card-payments capability; no payment, live-mode action or deployment was performed.

**T12 (complete):** Independently approved refunds and dispute/return movements are implemented in [PR #673](https://github.com/FSS-Ltd/pathway/pull/673), started from T11 merge `73bf3783cf6a60c85ae6d5208adeb3f7f13cb090`. The final checked code revision was `efbee88b8ccb8a84bf71ebebc2cd6b23d2dfd64f`. After CI run #1600 exposed a test that assumed order between two same-transaction return events, the assertion was corrected to require both event types without assuming their relative order; the focused Finance E2E rerun passed.

T12 local verification on 19 October 2026: API unit tests passed (288 suites, 1,963 tests); Finance E2E passed (5 suites, 14 tests) against disposable database `pathway_finance_t12_check_20261019_01`; API and database typechecks, API production build, targeted Finance ESLint, Prettier, Prisma validation, the three Finance schema-contract tests, and `git diff --check` passed. A Stripe provider regression test covers `metadata: null` during retry reconciliation. The strict RLS gate passed with the repository’s accepted-exposure setting; all Finance T12 tables are included in the enforced RLS gate. Graphify refreshed after T12 and the handoff update (8,659 nodes, 12,893 edges); HTML visualization is omitted for this graph size. No Chrome test, Stripe payment, live-mode action, production database access, or deployment was performed. Provider refund submission was verified with unit mocks because the connected sandbox account is not enabled for card payments.

GitHub checks passed on final PR #673 head `efbee88b8ccb8a84bf71ebebc2cd6b23d2dfd64f`: Typecheck, Lint & Unit Test; Integration Tests; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 19 October 2026 at 17:15:07 UTC, merge commit `e179931918355a5d999d23f635241ec6830e6057`.

**T13 (complete):** Hosted mandate setup, fixed instalments and monthly draft-invoice generation are implemented in [PR #712](https://github.com/FSS-Ltd/pathway/pull/712). The user authorized test-only submission with fictional payer details. Stripe confirmed the hosted SetupIntent and mandate on the synthetic GB school account; a direct connected-account GBP PaymentIntent transitioned from `processing` to `succeeded`, and an insufficient-funds test transitioned from `processing` to `requires_payment_method`. The observed objects were test mode only (`livemode=false`); no real school, bank account, live payment or production data was used. Bacs submission is enforced as test-only in the API and provider binding. The worker command is `pnpm --filter @pathway/workers finance:bacs:run-due`, using the HTTPS internal endpoint and `FINANCE_BACS_COLLECTION_JOB_SECRET`. GitHub merged PR #712 into `master` on 21 October 2026 at 18:28:05 UTC, merge commit `67849d32cc8424613f70ea6166afc339d7433e75`; final PR head `27c17189d7138910008b94c47d3bcee9e87c3fe5`.

Local T13 checks: Prisma client generation and schema validation passed; API, database and worker typechecks passed; API and worker builds passed; focused API Finance tests passed (9 suites, 42 tests) plus the collection-plan duplicate-prevention regression (1 suite, 1 test); Bacs worker tests passed (1 suite, 4 tests); Finance schema contracts passed (3 tests); targeted ESLint, Prettier and `git diff --check` passed. Migration deployment was not run locally: PostgreSQL initialization is blocked because the restricted environment denies `shmget`, and no separate disposable database is configured. Provider cancellation and return/dispute simulation remain release-assurance items; application cancellation, delayed-status handling, duplicate-event handling and Bacs receipt-return processing have unit coverage. Bacs collection remains test-only and no production payment or deployment is authorized by this test evidence. Do not replace the charge model without an approved architecture decision.

GitHub CI passed on final PR #712 head `27c17189d7138910008b94c47d3bcee9e87c3fe5`: Typecheck, Lint & Unit Test; Integration Tests (1/2); Integration Tests (2/2); Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. The checks were from workflow run `39647262905` and security-analysis run `39647259558`.

**T14 (complete):** Staff Finance workspace, receivables overview, invoice and payment workflows, statements and ledger-based reports/exports are implemented in [PR #723](https://github.com/FSS-Ltd/pathway/pull/723). Reports keep issued gross, credits, confirmed receipts, refunds/returns, allocations, outstanding/overdue, unapplied funds, fees and payouts distinct; CSV exports are scoped, audited and protected against spreadsheet formulas. The requested Finance add-on price remains £29 monthly / £290 annually; T14 does not create or change Stripe catalogue prices or enable live checkout.

T14 local verification on final PR head `3d699eb873898c0f3dcd0adb55b3fa3c5b83b2cd`: workspace lint passed; API unit tests passed (332 suites, 2,129 tests); worker tests passed (16 suites, 70 tests); auth tests passed (3 suites, 15 tests); admin tests passed with the Finance formatter test included. API build, API/admin/platform typechecks, Finance currency and schema contract tests, targeted ESLint, Prettier, and `git diff --check` passed. Local DB-backed E2E was not run because the shared database is stale and lacks `app.FinanceProfile`; fresh-database integration shards passed in CI.

GitHub CI passed on final PR #723 head `3d699eb873898c0f3dcd0adb55b3fa3c5b83b2cd`: Typecheck, Lint & Unit Test; Integration Tests (1/2); Integration Tests (2/2); Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 21 October 2026 at 23:43:42 UTC, merge commit `b30b573acca8a3ebd7b4803261964fa3b73f54a7`.

**T15 (complete):** Family Space invoice and statement views, payer-scoped reads, server-confirmed hosted-checkout status, payment-return recovery, and private document downloads are implemented in [PR #728](https://github.com/FSS-Ltd/pathway/pull/728). The family flow uses the shared ledger balance and blocks future access after payer-grant revocation. It does not treat checkout redirects or transfer notices as payment evidence. The requested Finance add-on prices remain £29 monthly / £290 annually; T15 changed no Stripe catalogue price. Before PR creation, the branch was verified against `master` at `d58cd75e3956dc1e0828fcabdb237e9274b0a687`, which included the API deployment fix in PR #726.

T15 local verification on final PR head `698b7495b9cf3e2244639176c90d9a42b5a663a5`: workspace lint passed; API unit tests passed (334 suites, 2,148 tests); worker tests passed (16 suites, 70 tests; the PostgreSQL-dependent AV30 seed fixture was unavailable locally); auth tests passed (3 suites, 15 tests); focused Finance API tests passed (2 suites, 13 tests); Family Space tests passed (5 suites, 13 tests); mobile typecheck, targeted lint, changed-file Prettier, lockfile validation and API serverless packaging passed. Standalone API and web typechecks still report existing errors in unchanged React-PDF and configurator files; CI typecheck passed. iOS Simulator review was unavailable because CoreSimulatorService was disconnected. No Chrome was opened.

GitHub checks passed on final PR #728 head `698b7495b9cf3e2244639176c90d9a42b5a663a5`: Typecheck, Lint & Unit Test; API serverless artifact (Node 24, 1024 descriptors); Integration Tests (1/2); Integration Tests (2/2); Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. GitHub confirmed merge to `master` on 22 October 2026 at 21:40:02 UTC, merge commit `d9c0be0b9d4cf5d986e3b2e24d67264351f1a60b`.

**T16 (complete):** Finance environment boundaries and a guarded PostgreSQL backup/restore rehearsal are implemented in [PR #730](https://github.com/FSS-Ltd/pathway/pull/730). Live Finance Connect requires an explicit production-only opt-in; production environment sync excludes test Stripe secrets and validates provider mode, HTTPS redirects and isolated Finance webhook configuration. CI migrates disposable PostgreSQL 16 databases, seeds a synthetic Finance profile, dumps and restores it, and verifies the restored record and forced RLS. No schema migration, production secret, Stripe object or deployment was changed. The branch was rebased on current `master` at `846dd9141c517dca117d2d0677a48fd7a2a091fe` before PR creation.

T16 local verification: workspace lint, API typecheck, API unit tests (334 suites, 2,151 tests), worker tests (16 suites, 70 tests), auth tests (3 suites, 15 tests), Finance Stripe configuration tests and backup/environment guard tests (12 tests) passed during implementation. The first CI run exposed missing required Tenant timestamps in the restore fixture. After correcting the fixture, root-script ESLint, changed-file Prettier, Node syntax checks, six backup/environment guard tests and `git diff --check` passed on the final revision. A fresh PostgreSQL 16 rehearsal applied all 198 migrations and passed synthetic seed, archive dump/restore and forced-RLS verification. No Chrome was opened.

GitHub checks passed on final PR #730 head `5e75bf9407a0ff426c84abb81f965c6e707a1e63`: Typecheck, Lint & Unit Test; API serverless artifact (Node 24, 1024 descriptors); Finance Backup Restore; Integration Tests (1/2); Integration Tests (2/2); Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; Analyze (actions); Analyze (javascript-typescript); and CodeQL. CI workflow run `39873059656` and security-analysis run `39873053754` checked that revision. GitHub confirmed merge to `master` on 23 October 2026 at 00:13:23 UTC, merge commit `398ca0ad844b27340ffa4cdcca4e733b735dacc1`.

**Next delivery boundary:** T17 is the next numbered step and must use Sol, as requested by the user. The user confirmed Sol is selected, so after T17 passes current-revision CI, merges and has its evidence recorded, continue to T18 without a model-switch pause. Live checkout remains gated on commercial approval; the Finance add-on price remains £29 monthly / £290 annually.

**T17 (in progress; current PR [#733](https://github.com/FSS-Ltd/pathway/pull/733)):** Started from the verified T16 evidence merge `e3f6124d1ff2b2d48add3661d6063164de2c3f8b`. The complete scope and remaining work are tracked in [reconciliation-and-recovery.md](reconciliation-and-recovery.md). The first increment adds an account/mode-scoped, read-only Stripe reconciliation adapter and fixes A10's aged unknown-Checkout replacement path. Unknown attempts now retain their obligation after a 23-hour safety window instead of being locally expired and replaced. Three focused API suites / 29 tests passed. The second increment adds scoped coverage/case/history tables and immutable API-recovery provenance in an additive migration; 24 real PostgreSQL 16 reconciliation and ledger/RLS tests passed on a disposable local database. The third increment adds atomic page/cursor transactions, reclaimable leases, explicit retention gaps and a bounded runner with dry-run inspection; 11 database tests and 16 window/runner unit tests passed. Prisma validation/generation, API/database typechecks, targeted lint, Prettier and whitespace checks passed. The strict RLS gate passed with the repository's accepted-exposure setting, reporting three unchanged unrelated disabled tables. No production migration, full T17 completion, sandbox reconciliation, CI or merge is claimed; scheduled jobs, canonical replay, cases/console, dry-run repairs and runbooks remain in this same T17 step.

**T17 servicing checkpoint:** Provider servicing now has an explicit environment/key configuration independent of new collection. Webhooks, account status, approved refunds and reporting remain configurable when collection is disabled. Current account state is fetched outside database transactions and rechecked under a lock, preserving concurrent disconnection. Nine focused API suites / 56 tests, API typecheck, targeted lint, formatting and whitespace checks passed. No environment, key or deployment changed. T17 remains in progress with no PR; its complete remaining scope is unchanged.

**T17 retention checkpoint:** Unknown Bacs operations now pause for review after 23 hours; refund retries have a durable, immutable attempt timestamp and switch to read-only recovery after that window. Existing approved refunds receive a conservative backfill rather than a fresh window. Four API suites / 29 tests, four database suites / 39 tests, three Finance schema-contract tests, Prisma validation/generation, API/database typechecks, targeted lint, formatting and whitespace checks passed. No production migration ran. The migration requires an administrative role for its RLS-protected backfill. Scheduled recovery, canonical evidence ingestion, settlement cases, operator console, dry-run/sandbox proof, runbooks and full branch verification remain in T17; no PR or merge is claimed.

**T17 Checkout checkpoint:** Lost session IDs can now be matched to stored operation facts and captured with immutable API provenance. Minimal evidence reuses the canonical receipt handler, deduplicates replay, preserves existing PaymentIntent IDs, retains unmatched money as cases and records genuine accepted payments after grant revocation. Open/processing observations do not create receipts; dry run writes nothing. Three unit suites / 36 tests and two database suites / 20 tests, API typecheck, targeted lint, formatting and whitespace checks passed. This path is not yet registered for scheduled execution. The remaining T17 scope is listed in the recovery design; no PR, CI or merge is claimed.

**T17 non-card compatibility checkpoint:** A read-only check of the existing synthetic Bacs payments found `py_` Charge IDs. The reconciliation adapter and refund/dispute validators now support these alongside `ch_`; nullable refund metadata is accepted without inferring ownership. Five regression assertions failed before the fix; four suites / 37 tests, API typecheck, targeted lint, formatting and whitespace checks passed. The actual adapter listed four test charges and retrieved a successful non-card Charge under the verified Sandbox account. No provider object or configuration changed. Full T17 sync/tooling, console, runbooks and assurance remain incomplete; no PR, CI or merge is claimed.

**T17 reversal checkpoint:** Minimal current refund/dispute observations now enter the canonical ledger handlers. Original provider-event IDs/times and proven balance-transaction times are retained; processor fees never enter family debt. Refund and return movements remain distinct. Receipt lookup and refund-provider requests enforce test/live scope, including the documented refund response that has no `livemode` field. Pending unknown operations, confirmed unmatched money and missing refund-success history produce explicit cases. Dry run reports the history gap without writing. Six focused unit suites / 70 tests and three normal database suites / 28 tests passed on Node 24, along with API typecheck, targeted lint, changed-file Prettier and whitespace checks. Scheduled integration, the staff console and the other remaining T17 deliverables are still pending; no PR, CI, merge or full-step completion is claimed.

**T17 original-event checkpoint:** Account-scoped provider events now retain their actual IDs, types and times in the durable API-recovery inbox. Lost Checkout linking reuses the canonical receipt path; unrelated customer and setup-Checkout events become minimal observations. Invalid or unmatched financial evidence becomes a scoped case. Card PaymentIntent observations must match their linked Checkout amount, currency and event status, and never create a second receipt. Refund/dispute charge lookups and movement expansion run before the page transaction, with four concurrent reads at most and a page-local cache. Five focused unit suites / 49 tests and four database suites / 36 tests passed; after extracting payment matching into a focused module, its six database tests passed again. API typecheck, targeted lint, formatting and whitespace checks passed. The scheduler, historical sweeper, current-object Bacs/settlement paths, operations console, tooling and runbooks remain within T17; no PR or merge is claimed.

**T17 current-payment checkpoint:** Current PaymentIntent reads can recover a lost Bacs operation through the same canonical handler used for provider events. Processing creates no receipt; confirmed success creates and allocates one receipt despite repeated replay. Changed principal is held, and dry run does not link or enqueue anything. A shared observation persistence module preserves the distinct provenance of current-object and original-event evidence. The Bacs webhook service's provider type now exposes only the cancellation operation it uses, with no collection-creation capability. Three new database tests failed on missing behavior before implementation. Five database suites / 39 tests, five unit suites / 41 tests, API typecheck, targeted lint, formatting and whitespace checks passed on Node 24. All database data is disposable and synthetic; no Stripe call or live configuration changed. This remains an unregistered recovery path pending the full T17 scheduler/operations delivery.

**T17 mandate-servicing checkpoint:** Historical SetupIntent, Mandate and PaymentMethod reads and pending cancellation now use the independent servicing connection. New Bacs setup/collection stays test-only. Payer cancellation works with collection disabled; outages retain the pending flag, and a later Dashboard detachment can be recognised without repeating the write. The servicing client checks account/mode, customer, resource identity and setup-session metadata, then strips private bank/contact/acceptance details. Seven provider assertions and two database cancellation assertions failed before implementation. Four unit suites / 39 tests, two database suites / five tests, API typecheck, targeted lint, Prettier and whitespace checks passed on Node 24. Actual read-only Sandbox proof matched the existing synthetic school's SetupIntent, active mandate and Bacs method under the selected test platform; both PaymentMethod retrieval routes agreed. The proof transport rejected all writes. No real cancellation, environment change, migration, live switch or T17 PR occurred.

**T17 case-identity checkpoint:** Maximum-length provider IDs no longer overflow Checkout/refund reconciliation case keys. Normal keys retain their identity; long keys use a digest while keeping the complete provider reference. Two real-database regressions first failed with a column-length error, then passed with distinct cases for IDs differing only at their final character. Two suites / 21 database tests, API typecheck, targeted lint, formatting and whitespace checks passed. No schema or provider change occurred.

**T17 setup-retention checkpoint:** An unknown setup response, lost session persistence or local expiry now retains the original mandate as UNKNOWN. A second setup is blocked until evidence resolves it; a usable unexpired session is reused. Three database regressions failed before the fix; two suites / six database tests, API typecheck, targeted lint, formatting and whitespace passed. This remains part of the unmerged T17 branch.

**T17 mandate-recovery checkpoint:** Current and original setup/mandate/method evidence is matched to stored account, environment, customer and consent before queueing. Current unconfirmed setup is observed, never inferred as failure. Canonical replay respects revoked grants and cancels future plans after actual inactivity. Active provider events retain pending cancellation. Setup success never counts as confirmed money. Nine projection and ten database assertions were RED before behavior; the later three money-classification regressions were also RED. Final Node24 checks: three unit suites /30 tests; three DB suites /19 tests (plus the earlier four-suite /22-test run), API typecheck, targeted lint, formatting and whitespace passed. Scheduling and the rest of T17 remain outstanding.

**T17 sweep-foundation checkpoint:** Provider pages now support validated limits; the capture runner requests ten objects. SetupIntent discovery uses its own read-only stream. Historical unresolved inspection has a separate five-minute cutoff and durable cursor across Checkout, debit, mandate, refund and dispute operations. Its read-only selector pages all ages by immutable identity, matches receipts through the stored connection, retains confirmed refunds for return inspection, and excludes reinstated withdrawals. An additive migration extends the stream allowlist and adds five scoped paging indexes; no financial rows change. Eight page assertions, a window assertion, a database stream constraint and four missing-selector tests were RED before implementation. Final Node24 verification: three unit suites /49 tests, two DB suites /18 tests, API typecheck, Prisma validation, targeted lint, formatting and whitespace passed; all five indexes were inspected in the disposable database. The runtime sweeper and scheduler are not registered yet.

**T17 integration checkpoint:** Historical operation reads, cancellation target checks, saved settlement/payout evidence, staff cases and durable operator requests now connect to bounded recovery entry points. The scoped CLI defaults to dry run; the five-minute worker and canonical inbox drain are gated off. Saved-evidence reports expose account/environment, freshness, truncation and coverage limits. Central PostgreSQL runs passed thirteen runtime tests, ten dispatch/request/report tests, five payout/case-recheck tests and three staff action tests. Four runtime and three internal-auth tests, eleven cutoff tests, focused agent suites and API typecheck passed. A controlled Sandbox dry run exercised all twelve streams with zero failures and unchanged financial/recovery record counts; unmatched historical fixtures stayed exceptions. Full verification, fresh review, current-master rebase, PR and green merge are still required. No deployment, production migration or live switch occurred.

**T17 local review and verification candidate (`5c7646399fa9811dbbb455096afa80d7cd1e3e08`):** A fresh Sol branch review found three Important issues. The fixes add a single refund/independent-return financial case through canonical provider handlers, isolate failed operator requests with durable retries/manual-review outcomes, and preserve saved fee/payout reports after restriction or disconnection. Regressions were RED before fixes. Final focused database verification passed seven suites /43 tests; the full Finance database run passed 26 suites /137 tests. Scoped fixture assertions remain accurate under the administrative bootstrap role; separate low-privilege tests prove RLS denial.

Workspace lint passed all 16 tasks. API, admin, worker and database typechecks passed. Worker tests passed 21 suites /96 tests; the full admin suite passed on Node20, matching repository CI. API/admin/worker builds, actual PDF generation, schema contracts (three tests), role-RLS gate tests (22 tests), formatting and whitespace passed. The isolated Node24 serverless artifact passed with a 1024 descriptor limit after removing generated worker-build JavaScript siblings from module resolution; those generated outputs were preserved locally. The strict RLS gate requires both new settlement tables and passed under the repository's existing accepted-exposure setting, reporting only three unchanged unrelated disabled tables. A separate database assertion denied backend discovery execution to PUBLIC and the tenant role.

The complete API unit run passed 365 suites /2425 tests using one worker with bounded memory. Earlier default/serial attempts were interrupted after host contention and heap exhaustion; those attempts are not claimed as complete. PR [#733](https://github.com/FSS-Ltd/pathway/pull/733) is ready for review. Its initial checked revision `0a2974c8bec50ad98e77927eaa7dc5895c3e1943` passed type/lint/unit, serverless artifact, security, backup-restore and role gates, but failed the public-schema migration gate. The corrected revision must pass every applicable CI check and merge before T18. No production deployment, migration, live collection or scheduled-worker enablement occurred.

**T17 CI portability correction:** The permission-definition gate reproduced a hardcoded `app` table reference against the supported `public` core schema. Recovery paging migrations now resolve the actual Finance schema; the private discovery function binds safely quoted table names while retaining its empty search path and revoked public execution. Raw operation/request reads follow the transaction schema. All 202 migrations, nine permission smoke tests and ten suites /17 production-schema trigger tests passed in a separate disposable public-schema database. Public discovery executed successfully; both settlement tables force RLS and the tenant role cannot execute backend discovery. The app-schema Finance run passed 26 suites /137 tests after making discovery fixture priority deterministic within its bounded page. API typecheck, changed-file lint/format, three Finance schema tests and whitespace checks passed. The original full API units and build evidence above remains applicable; fresh CI must verify the corrected PR revision. No production database changed.

## T17 merged gate

T17 [PR #733](https://github.com/FSS-Ltd/pathway/pull/733) is **merged**. GitHub confirmed merge on 23 October 2026 at 13:11:33 UTC, merge commit `74882be294cc2c71016a51eb146c3db23e69d226`. Its exact checked revision was `be5027bb4a05d8dab33ca7a2983e53220da915f9`. All eleven applicable checks succeeded: Typecheck/Lint/Unit; Integration Tests (1/2); Integration Tests (2/2); Finance Backup Restore; Organisation Role RLS; Permission Definition Database; System Role Seed Database Identity; API serverless artifact (Node24,1024 descriptors); Analyze actions; Analyze JavaScript/TypeScript; CodeQL. CI workflow [39953851048](https://github.com/FSS-Ltd/pathway/actions/runs/39953851048) and security workflow [39953843613](https://github.com/FSS-Ltd/pathway/actions/runs/39953843613) checked that revision. Integration shard 1 passed 69 suites /476 tests plus two billing suites /13 tests; shard 2 passed 68 suites /357 tests. No failed, stale, missing or pending check was used to clear the gate.

Current GitHub master was refreshed and contains the checked revision and merge commit. This gate record precedes T18 implementation; T18 starts from `74882be294cc2c71016a51eb146c3db23e69d226`. The user confirmed Sol is selected, so there is no model pause. No live collection switch, manual production deployment or production migration was performed as part of T17 delivery. T18 assurance and the explicitly authorised T19 live pilot/handover remain unfinished.

## T18 assurance in progress

T18's initial delivery **merged in [PR #734](https://github.com/FSS-Ltd/pathway/pull/734); assurance closure is still incomplete**. The branch starts at the verified T17 merge above. All A01–A48 and expanded-contract evidence is mapped in [the assurance matrix](release-evidence/t18-scenario-matrix.md); pending rows are not passing claims.

Observed monetary regressions now have real PostgreSQL coverage: reinstatement after replacement payment restores only current debt and retains excess as unapplied; period-end ledger cutoffs exclude later-captured evidence and carry it as next-period adjustments. Actual recurring template/invoice generation exposed invalid Prisma nested tenant/org fields; scoped parent relations now supply those fields correctly. Concurrent manual/card/Bacs receipts, invoice numbering, monthly generation, scheduler restart, PI/Charge ordering and cancellation-before-final-payment scenarios passed their focused database runs.

Actual AppModule HTTP assurance passed active/servicing document and export access, locked/wrong-role/wrong-tenant/wrong-payer denials and payer-grant revocation. Signed ingress assurance passed ten scenarios covering raw-body signatures, test/live routing, five duplicate deliveries, durable acknowledgement during worker outage, persistence failure, stale-lease crash recovery, unknown-status quarantine/operator visibility, Dashboard refunds and separate SaaS handler replay. Operator exceptions now expose scoped unresolved webhook evidence without inventing amounts or exposing raw errors. Statement downloads recheck access after storage retrieval; generic retention preserves Finance audit types pending an approved school policy.

Collection amounts now have explicit NexSteps support bounds before new attempts/schedules and at provider boundaries. Invalid amounts return permanent422 feedback; invoice debt and manual receipts remain unchanged. The shared helper passed16 tests, the affected API suites passed44 tests, and Family Space passed all15 suites/70 tests. Staff preview, revoked-access state, report filters, narrow-screen layout, focus and contrast fixes are being checked against rendered actual components. The complete API unit run passed 366 suites / 2,449 tests. The full admin script passed under the repository's Node 20 runtime; a Node 24 rerun failed an unrelated existing staff-loading timing assertion and is not claimed as passing. Final affected checks, database/build gates and current-master integration remain required before PR publication.

An actual test-only school-scoped £1 card Checkout completed in the in-app browser. Its genuine signed event reached the SQL inbox while the worker was stopped; receipts stayed0 and outstanding100minor until canonical replay. Five signed duplicate deliveries and a restarted worker retained one receipt, allocated100minor and outstanding0. Provider settlement showed100minor principal,23minor Stripe fee and77minor net, with no application fee or destination transfer. This proof used an isolated access adapter; actual access is established separately by HTTP tests. The return page was a proof harness, not product UI evidence.

Fresh Sandbox reads still report two incomplete Standard school accounts with payouts disabled. The returned descriptor is a synthetic placeholder, not school acceptance. Payout reconciliation and additional Bacs provider assurance remain open; neither inactive Sandbox capabilities nor successful test payments establish live eligibility. No production migration, deployment, live payment, live Bacs enablement or T19 pilot occurred. T19 cannot begin before T18's current-revision CI succeeds and its PR is confirmed merged.

A fresh Sol whole-branch review found one Important issue: a previous human invoice preview could approve or issue a changed review cycle. The HTTP contract now requires an opaque server-owned review revision, including charge details, review events and current school/payer identity. Each transition rechecks it while holding invoice and identity locks; stale or missing previews return 409/400 before mutation or numbering. The admin sends the exact preview revision and requires a fresh preview after conflict. The actual HTTP regression was observed RED, then passed all five cases; staff interaction assertions also passed in the full admin run. No migration or dependency was added.

Rendered staff checks used actual Finance components with explicitly mocked local APIs. At 375 × 812 and 200% text, body width remained 375, the scrollable confirmation was 311 × 748, scroll position was zero, and initial focus was the visible title. Escape closed the idle dialog; a mocked 409 closed confirmation and announced the fresh-preview requirement. The primary confirmation text contrast measured 7.13:1 after the local Finance button fix. This is browser interaction evidence, not native-device or screen-reader certification. Temporary viewport overrides were reset.

A real disposable full-database backup/restore preserved the populated card ledger, completed provider event and canonical zero balance. The selected source/restored ledger snapshots shared digest `be7fc28ce51ebc2048d44aa094679f2a3a881483ad4cf60a83a814715927ff4c`, with forced tenant RLS preserved. The initial app-schema-only dump failed because it omitted public schema types; the successful full dump restored in one transaction. No production database was accessed.

The latest actual Bacs confirmation was blocked by Stripe HTTP 400: the selected account's allowed payment method types were not activated. The pending test setup did not submit a debit, post a receipt or reduce debt. Delayed Bacs outcomes, cancellation/return and payout proof remain mandatory T18 gaps; a draft PR may preserve verified application changes but does not clear this gate. A complete Finance database run passed 36 suites / 179 tests and failed one test because global webhook discovery included prior suites' deliberately retained evidence. The test now compares the newly discovered scope delta while preserving exact tenant row-isolation assertions; its focused rerun passed 10 tests. The aggregate must be rerun on the rebased revision.

Final local static checks passed for API, admin, mobile, workers and platform, with ESLint across changed TypeScript files. API/serverless compilation and admin production build passed. The admin build used explicit synthetic public build configuration, not production credentials. The real invoice/credit/receipt/statement PDF smoke passed. Worker tests passed all 21 suites / 97 tests. The serverless runtime smoke initially refused to run without an explicitly named disposable `TEST_DATABASE_URL`; that guard failure is not a passing test.

After supplying the guarded disposable local `TEST_DATABASE_URL`, the serverless runtime smoke passed: packaged application startup, health, CORS preflight and unauthenticated-route handling were exercised without loading source TypeScript. The original missing-variable refusal remains recorded as a failed setup attempt, not a product failure.

T18 preservation revision `54b8f6f440abf5512f2d584a498454ed570c28bc` was rebased cleanly onto current GitHub master `4bd8862e1c93464b462fef49e7dfa1ddbfd062d9` before draft PR publication. The current-master payer checkout-status controller regression passed. The complete rebased Finance PostgreSQL run passed **37 suites / 180 tests**, including all tenant RLS assertions and the corrected discovery-delta test. Formatting and diff checks passed on that revision. Further focused assurance examples remain in progress; CI is running and no merge is claimed. The PR stays draft while mandatory application/provider proof remains open; T19 is not permitted to start.

Actual Sandbox accepted-response-loss recovery passed through the Checkout adapter and application services. Two accepted create requests with the same key/body produced one provider session, one persisted attempt and no payment. The subsequent cached start reused that attempt. Real signed expiry ingestion and canonical worker handling changed it to `EXPIRED`; the invoice remained outstanding100minor with no receipt allocation. Separate access enforcement remains established by actual HTTP tests, not this isolated provider fixture.

Additional application assurance passed 19 of20 new cases initially. The servicing fixture used a date outside the reviewed 2026–2028 bank calendar and correctly received400; using a valid historical date inside that calendar passed the focused servicing case. These runs cover the exact30000/5000 credit/refund, accepted-before-timeout refund recovery, reinstatement races/credit ordering, persisted three instalments, weekend/holiday/London DST scheduler boundaries, forged-return debt, wrong-destination operator review, issued document/tax snapshots and servicing approval/job denials. Unknown-status recovery passed six resource types with unchanged debt and held evidence or durable retry failure. No new production fix or migration was needed for these additional examples.

### T18 initial merge and required assurance closure

GitHub reports PR #734 merged by the repository owner on 23 October 2026 at 15:59:51 UTC, with merge commit `82770da7fd836d031c2e3ed76f127e5c723a5249`. Its checked head was `54b8f6f440abf5512f2d584a498454ed570c28bc`. All eleven applicable checks completed successfully: API serverless artifact, Typecheck/Lint/Unit, Integration Tests1/2, Integration Tests2/2, Finance Backup Restore, System Role Seed Database Identity, Permission Definition Database, Organisation Role RLS, both CodeQL analyses and the CodeQL aggregate. CI run `39975659294` and security run `39975655164` provide the host evidence.

This merge preserves the initial T18 changes; it does not establish that the documented outstanding application/provider assurance has passed. Additional verified examples and the `IDEMPOTENCY_CONFLICT` response fix were still local at merge time. They require a focused T18 assurance-closure PR from the current merged master, with its own current-revision verification and CI. An externally initiated refund also requires a visible pending-treatment review signal in addition to its confirmed principal reversal. This finding remains under reproduction; no provider refund has yet been initiated for that proof.

**Next permissible work:** close T18 application/provider assurance, verify and merge its focused follow-up PR. T19 remains unstarted. Bacs/payout onboarding, actual delayed/return proof and explicit live-pilot authorization remain unmet gates. No live activation, production migration or deployment is authorized by this merge record.

### T18 assurance follow-up verification

The follow-up branch `fix/finance-t18-assurance-closure` starts from current merged master `82770da7fd836d031c2e3ed76f127e5c723a5249`. The named idempotency response was observed missing in an actual HTTP regression, then fixed to return `409 IDEMPOTENCY_CONFLICT` while preserving the existing status, error and message. The command/preview rerun passed seven tests.

A signed external-refund regression exposed the missing pending-treatment case. A focused helper now creates one scoped, durable review case after canonical external refund posting, without changing the refund or allocation treatment. Duplicate/replayed evidence retains one case; confirmed refund returns resolve the no-longer-applicable signal. The exceptions report and review-required amount include open external refund reviews. Issued charges and confirmed debt projections still use the ledger. The signed ingress suite passed ten tests after the fix; affected unit suites passed fourteen tests. The existing reversal recovery suite passed eleven tests.

The complete current Finance PostgreSQL run passed **43 suites / 200 tests**. This includes all twenty expanded assurance cases together with the existing Finance suites, correcting the earlier invalid-date fixture aggregate. API typecheck, focused lint, API/serverless compilation and packaged runtime smoke passed. No migration or dependency was added. The initial T18 full admin/mobile/worker checks remain recorded above; the follow-up's new production changes are API-only.

Actual provider proof also advanced: an external school-scoped test API refund of20minor generated two genuine signed events and eight duplicate captures, leaving one movement and one pending-treatment case. The invoice changed from allocated100/outstanding0 to allocated80/outstanding20. A second independently approved internal refund20 was accepted once by Stripe, then its first response was deliberately discarded. The reservation remained intact; two provider list reads recovered the original refund, with no second create request. Total confirmed outflow40 left allocation60/outstanding40. These are synthetic Sandbox funds; Dashboard UI navigation and an internal signed-webhook race are not claimed.

The latest connector readiness read still returns exactly two Standard GB accounts: details unsubmitted, charges/payouts disabled, and payment capabilities inactive. Bacs confirmation and actual payout proof therefore remain blocked. The owner/manager must finish hosted onboarding and required method activation in the same NexSteps Sandbox. T18 is not complete and T19 remains unstarted, regardless of the initial source merge.

The exact A01 example also passed a focused PostgreSQL test after the complete200-test run: one30000 principal receipt/allocation, persisted470 fee/29530 net, zero family debt, and consistent family/settlement report reads. This additional test uses provider evidence fixtures and does not claim actual Stripe pricing for that example. The final follow-up CI must include it.

### T18 follow-up PR and interaction checkpoint

Draft [PR #735](https://github.com/FSS-Ltd/pathway/pull/735) preserves the focused assurance closure on `master`. Source revision `c12f4e22fdd3624a3e93c847c5f637da7c374557` was refreshed against master `82770da7fd836d031c2e3ed76f127e5c723a5249` before publication. Its API serverless artifact, both CodeQL analyses and aggregate CodeQL check succeeded. Typecheck and lint steps succeeded; the remaining CI workflow is still running. These partial results do not clear the merge or T18 gate. No merge commit exists for this follow-up at this checkpoint.

Additional in-app-browser inspection used the actual staff Finance components with explicitly labelled local API mocks. Under emulated reduced motion, the invoice confirmation focused Cancel, retained its detailed financial preview and exposed a dark-text/teal primary action. Reports rendered no animated elements; a simulated HTTP 503 showed the retry alert, and retry restored the report. Existing results during a same-filter failure retained their generated timestamp. Light and dark colour-scheme preferences both retained the product's supported light tokens (`rgb(244,246,248)` background and `rgb(15,23,42)` text); this is not proof of a separate dark theme. The route loading skeleton's reduced-motion rule was inspected in source, not rendered by this component harness. Native-device and screen-reader checks remain unproved. Browser emulation was reset and the temporary tab/server closed after inspection.

A fresh selected-Sandbox account read still found exactly two GB school accounts with details unsubmitted, charges/payouts disabled and payment capabilities inactive. The school selected for Bacs has 36 currently due requirements; the other has 41. Account existence does not establish completed onboarding or method readiness. No additional Bacs submission, owner agreement, live request or production change was performed.

### Native runtime and integration-budget findings

An actual iPhone 16e/iOS 26.3 simulator running Expo Go SDK 54 reproduced a Family Finance render crash: native `Intl.NumberFormat` rejected BigInt input. Removing that call exposed a second native limitation, missing `formatToParts`. Both failures were reproduced in the regression before the final fix. The formatter now derives the currency/sign layout from numeric 1 and inserts exact decimal strings; money never converts to floating point. The complete mobile suite passed **15 suites /71 tests**, with mobile typecheck and focused lint passing. Actual native invoice/processing/statement components then rendered; all eight supported currency samples displayed correctly. The local mock-action harness also exercised checkout HTTP503 feedback, over-balance transfer validation and a notice explicitly labelled as not a receipt. An initial native date error was a harness timestamp where the existing invoice contract requires a date-only string; only that fixture changed.

The native harness uses the actual components and brand font assets, with clearly labelled synthetic API actions. It proves neither production authentication nor provider/ledger behavior. A 2.14 native font scale was observed at a 390-point viewport and a fresh render wrapped enlarged content. Full enlarged scrolling/control inspection and screen-reader assurance remain pending; this is not a complete native accessibility pass. The original 1.00 text preference was restored after five increases/decreases. Expo reported 54.0.33 with a recommended 54.0.37 patch; no dependency upgrade was performed.

CI run [40007106981](https://github.com/FSS-Ltd/pathway/actions/runs/40007106981) checked revision `824be447a08a5c457cc15f641f1ec73b09af1fce`. Ten checks succeeded, including integration shard 2. Shard 1 reached its 30-minute job limit after 75 passing suites, with no test failure reported. Test discovery confirms 78 suites in that shard, leaving three suites plus its separate one-connection database check unfinished. The integration job budget is now 40 minutes to accommodate the expanded suite and final database check. The test commands, assertions, sharding and required checks are unchanged. Cancellation is not a pass; the new revision must clear fresh CI before merge.

### Prefilled synthetic school checkpoint

The owner clarified that no separate school logins are available and explicitly authorized fake business details. Stripe rejected updates to the original two full-Dashboard fixtures because their hosted onboarding links had locked those fields. Their historical payment evidence remains preserved. One additional GB Accounts v2 fixture was created with the same full Dashboard, Stripe fee/loss responsibilities and direct-charge model. Synthetic business/representative information, documented verification tokens and Stripe's GB test payout bank were supplied before creating its onboarding link. Idempotency retained one account/representative; an empty-bank guard prevented replacement of existing data.

The owner explicitly approved sandbox-only agreement acceptance and fictional representative hosted onboarding. Stripe rejected API acceptance with `tos_acceptance_on_behalf_not_allowed`; no agreement was recorded by that request. The approved hosted flow reached password creation. Browser security policy requires human entry/submission of new credentials, so the in-app-browser page is handed over for that step. No school password was created or stored; the test API key cannot replace browser credentials. A separate setup-only probe on this prefilled account still received HTTP 400 because Bacs was not activated. No debit was submitted. Existing approvals remain valid after sign-in, but account activation, delayed/return/payout proof and the T18/T19 gate remain unresolved.

### European-name PDF rendering correction

Actual rendered invoice inspection found that the standard Helvetica PDF font
silently corrupted Polish and Romanian payer names. An expanded real-renderer
regression failed before the fix because the document lacked Unicode text maps.
Embedding Nunito fixed extended Latin and Cyrillic, but the Greek case still
failed; a locally embedded Noto Sans fallback closes that glyph gap. The final
PDF regression verifies the rendered Unicode mappings for the tested Latin,
Greek and Cyrillic name characters. Four static font assets and their two SIL
Open Font Licenses are included locally; no package dependency or runtime font
download is added. Font provenance is recorded beside the assets.

Invoice, negative credit and six-page statement PDFs were rendered with the real
renderer and inspected with Poppler. The statement retained all 70 synthetic
activity rows once and in order, with a footer on each page. Names, euro/sterling
amounts, negative credits, period, cutoff and separate unapplied funds were
legible in the inspected output. This is document-layout evidence, not ledger
or actual private-object-store verification. Existing stored issued documents
are not regenerated by this change.

API typecheck, focused lint, formatting, full API/serverless build and the PDF
regression passed. The staged serverless test verifies byte-identical font and
license assets without staged source files, then passes its HTTP/auth/database
runtime checks. The first local runtime attempt stopped on a missing Prisma
engine; the rerun used the established cached local engine and passed. Current
head CI and merge evidence must still be obtained after publishing this fix to
draft PR #735. T18 remains incomplete and T19 remains unstarted.

### Settlement-dependent card refusal evidence

Actual account-scoped Sandbox currency checks created and expired 14 unpaid
sessions: eight supported currencies at the product maximum, and six at their
minimum. The GB test account rejected DKK250 and SEK300 minor units because
their converted amount fell below its GBP30-minor-unit settlement minimum.
Read-only retrieval verified all 14 accepted objects remained test-mode,
expired and unpaid. Only the two refusals were repeated after the first
harness failed writing its relative evidence path; accepted sessions were not
created again. The redacted provider evidence is preserved privately.

The real Checkout adapter/service regression reproduced the misleading HTTP503
response for a definitive refusal. It now returns a safe HTTP422 after closing
that failed attempt, while temporary and unknown outcomes retain their durable
identity and retry recovery. Family feedback offers another payment method or
school help for422 and retains the distinct temporary503 explanation. No raw
provider message, exchange-rate assumption or money mutation is introduced.
The local minimum remains a NexSteps product bound, not universal processor
acceptance. Non-GB account eligibility and actual settlement remain unproved.

Both API regression cases were RED before the fix. The family422 message test
was also RED; the final complete mobile suite passed 15 suites /73 tests, with
mobile types/lint passing. The focused API service/provider run passed two
suites /22 tests using the established cached Prisma engine after an initial
missing-engine attempt. The initial malformed mobile runner executed no tests
and was corrected before the recorded RED/GREEN runs. Full API/serverless build,
staged artifact HTTP/auth/database smoke, focused API/mobile lint, formatting and
diff checks passed. Current-head CI and merge evidence must still be recorded
for this follow-up. T18 remains incomplete; T19 has not started.

### Stored document immutability correction

The earlier font checkpoint overstated stored-document preservation. Source
inspection found that invoice, credit and receipt downloads regenerated their
PDF and uploaded with overwrite enabled. Layout checks had not established byte
immutability. No production font deployment or storage write was performed by
this assurance work.

The new request-driven storage helper reads an existing private object first.
On first creation it disables overwrite and reads back the canonical stored
object, including when another request wins the upload race. Lost upload
responses recover the existing bytes on retry; missing readback fails closed.
Current payer/staff authority is still checked before and after document access.
Statement uploads also disable overwrite while retaining their immutable digest
keys and verified download digest. Other uploads retain their existing default
overwrite behavior. No new dependency, schema migration or polling is added.

Four initial document cases and four valid-fixture storage cases were RED before
the fix. Focused document/storage/statement verification passed three suites /23
tests. Real HTTP/database authorization, lifecycle, concurrent receipt delivery
and revision checks passed four suites /17 tests. API types/build/serverless,
staged runtime, real PDF smoke and focused lint passed. The build completed with
exit0 before a requested stop for local compiler contention reached it. The
first complete API unit run exhausted its 4GB heap after143 passing suites; it
is not a passing aggregate. A bounded two-worker run with memory recycling is
underway and must be recorded separately before claiming a complete unit pass.

Jest's existing renderer boundary now also replaces the ESM font loader; the
real PDF smoke and staged font-byte verification remain unchanged. Their
successful results do not imply actual hosted private-bucket configuration or
screen-reader proof. PR #735 stays draft and T18 remains incomplete.

The owner's replacement agent rules also require event-driven worker wakeups.
The existing signed Finance webhook path commits its inbox entry, but source
inspection found canonical draining through scheduled worker invocations without
an immediate post-commit wakeup. This is a further T18 assurance gap, recorded in
the recovery document. No event service or deployment has been introduced. The
local CI polling watcher was stopped; GitHub jobs continue independently.

The final focused storage/document rerun passed all23 tests in three suites,
including the added canonical-read and create-only assertions. Changed API
sources, fixtures and Jest configuration passed targeted ESLint and formatting.
An extra lint invocation outside the package's configured source globs found the
renderer test helper's pre-existing unused `_document` parameter; no unrelated
renderer behavior was changed. The complete bounded unit run is still pending.
Host inspection confirmed revision6b3dc89 failed four API suites on the ESM font
loader's `import.meta`; subsequent integration jobs were skipped. The local Jest
boundary correction addresses that cause, but only fresh CI can close the gate.

### Repeated external-refund recovery correction

Independent Sol review found that a confirmed external refund reused the generic
reversal-operation case key. Matching provider recovery resolved that key; after
identical evidence had completed, deduplication prevented another worker delivery
from reopening the school's pending-treatment warning. The new signed-ingress
regression reproduced `RESOLVED` where `OPEN` was required. Its first attempt
failed to compile because the fixture account was nullable; that attempt ran no
tests and is not the behavioral RED evidence.

External refund treatment now has a distinct case purpose, separate from provider
matching. Two actual recovery/worker cycles retain the warning and its5000-minor-
unit report amount without a second movement or allocation. A confirmed refund
return resolves the treatment case while preserving both movements. Both full
PostgreSQL/signed-ingress and reversal suites passed21 tests after the fix in a
separate disposable review database; earlier provider evidence was not reset.
This helper was introduced in unmerged PR #735, so this correction does not
assume or run a production legacy-key migration. T18 remains incomplete.

API typecheck, targeted lint and formatting passed. After an additional assertion
comparing the entire post-recovery ledger to its pre-recovery snapshot, the
selected signed-ingress regression passed again (one executed test; nine excluded
by the explicit name filter). Independent Sol review found no remaining P0–P2
issue in this focused correction. The complete bounded API unit run remains in
progress; neither old CI failure nor missing runtime evidence is waived.

The bounded two-worker API rerun subsequently completed with exit0:368 suites and
2464 tests passed. Jest reported one worker failing graceful teardown and forcing
its exit; this is not proof of clean process shutdown. This checkpoint covers the
storage/font/refund source before the new event-delivery continuation. New worker
and dependency changes require their own checks; the aggregate is not being
presented as verification of code added afterward.

### T18 assurance correction merge and event-delivery continuation

GitHub confirms [PR #735](https://github.com/FSS-Ltd/pathway/pull/735) merged into
master on 23 October 2026 at 21:58:02 UTC, merge commit
`c886a54d529c8ced8c5183e7f3ad31208999993b`. Its final checked revision was
`f21c6cd436b85f98635c4cc447ef417a7dfbef47`. All eleven applicable checks succeeded:
API serverless artifact; typecheck/lint/unit; both integration shards; Finance
Backup Restore; System Role Seed Database Identity; Permission Definition
Database; Organisation Role RLS; both Analyze jobs; CodeQL. CI run 40024101056 and
CodeQL run 40024096831 cover that revision. This closes that correction PR's gate,
not T18's remaining assurance or T19's pilot authorization.

The event-delivery continuation stays within T18. A transactional empty PostgreSQL
notification now accompanies runnable durable inbox changes. A disabled-by-default
listener subscribes before catch-up, drains canonical scoped claims, schedules
persisted deadlines and reconnects without idle SQL discovery. Supported Bacs and
refund evidence missing linked records persists a retry instead of entering an
unsupported-handler hold. No payment, balance or snapshot algorithm is replaced.
The direct `pg` dependency is necessary because Prisma cannot subscribe to NOTIFY;
existing lockfile resolutions are preserved. The 203rd migration adds only a
trigger, restricted backend discovery function and two indexes. Index creation
requires controlled migration locks; no production migration was applied.

Independent Sol review found three P2 defects: immediate start/stop leaked a
subscription, arbitrary URL query overrides bypassed connection safeguards, and
pg's code-less unexpected disconnect was misclassified as configuration failure.
Five new regression cases failed behaviorally before correction. The listener
now checks shutdown before creating its client; URLs reject unsupported query
overrides; connection-event failures retain a safe reconnectable classification.
Both complete focused suites passed 30 tests afterward. Full worker verification
passed 24 suites / 139 tests, typecheck, lint and a build with output isolated from
API sources. Relevant API units passed 4 suites / 20 tests. Five real PostgreSQL
suites passed 29 tests, including the three new suites' eight unique cases plus
existing signed-ingress/reversal coverage. The minimal public-core migration
smoke also passed; it is not a full public-schema security assurance claim.

An enabled CLI process subscribed to the owned disposable PostgreSQL database,
accepted SIGTERM, exited 0 and left zero subscription clients and zero HTTP calls.
Disabled CLI verification proves it needs neither credentials nor a Prisma engine.
The initial Prisma validation attempt hit a local cache-utime permission error;
validation passed with both established cached engine paths explicitly supplied.
These local results do not verify an approved persistent deployment, direct/session
runtime URL or operator grants. Existing scheduled recovery stays unchanged until
activation is authorized and proved. T18 remains incomplete; T19 is unstarted.

Current event-delivery API verification passed typecheck/full build on the CI's
Node 24 runtime with a 4096 MB heap, the staged serverless HTTP/auth/database/font
smoke at a 1024-descriptor limit, the real Unicode PDF smoke, focused API lint,
formatting and whitespace checks. The initial Node 20 / 3072 MB bundle attempt
exhausted its heap after TypeScript passed; it is not a successful build. The
complete 368-suite API unit result and PR #735 CI above predate this event source;
fresh aggregate CI is required for this continuation. Self-review inspected each
changed module, test, migration, manifest and document; no live runtime was enabled.

The event-delivery continuation is preserved in draft
[PR #737](https://github.com/FSS-Ltd/pathway/pull/737), rebased onto current master
`c886a54d529c8ced8c5183e7f3ad31208999993b` before publication. The initial source
head `49b2aa30bc35f89c83ca57c6ef6280ff2c0cfe9f` has CI run40032001845 and
CodeQL run40031999503 in progress. Pending checks are not passing evidence.
The checked revision and final results must be refreshed after every push;
no merge or full T18 completion is claimed.

### T18 hosted Bacs setup correction

Read-only revalidation of all three known synthetic school accounts still found
charges/payouts disabled and incomplete onboarding. That did not establish that
every Sandbox Bacs operation was unavailable. A bounded real-adapter probe using
an existing accepted test mandate created one £1 (100 GBP minor units) direct debit in
`processing`. Its later provider status was `requires_payment_method`; this is
not a confirmed receipt or complete cancellation/return assurance. The probe's
durable operation identity and provider references are retained privately.

The earlier T18 harness attempted direct SetupIntent confirmation, whereas
[Stripe requires hosted Checkout setup for this Bacs path](https://docs.stripe.com/payments/bacs-debit).
Exercising the actual hosted adapter exposed HTTP 400 `parameter_unknown` for
`setup_intent_data[usage]`. Removing that unsupported Checkout override produced
an open test-mode session restricted to Bacs. After explicit user approval of
the new fictional payer mandate, in-app-browser submission completed. An
account-scoped authenticated read verified SetupIntent `succeeded`, usage
`off_session`, active mandate and matching customer/payment method. Hosted setup
created no PaymentIntent. No school onboarding password was needed for that
separate payer flow; school payout readiness remains unverified.

The real return also exposed URL-encoded `{CHECKOUT_SESSION_ID}`. A second
regression reproduced it. The adapter now serializes the mandate identifier
before appending Stripe's literal placeholder, matching the existing card flow.
A fresh unsubmitted test session retained that literal template and was expired
through the real mandate-servicing adapter. Readback confirmed `expired`, a
cancelled unsubmitted SetupIntent, no mandate/method and no PaymentIntent. The
first expiry harness incorrectly expected no SetupIntent at all; that assertion
failed after expiry. Read-only recovery verified the retained cancelled object
without creating or expiring another session.

Both product regressions were behaviorally RED; final provider/servicing units
passed two suites /27 tests. An initial combined command named a nonexistent
mandate unit file; its nine provider tests passed but the aggregate failed. The
corrected complete suites are the successful 27-test result. API typecheck/full
Node 24 build, focused lint and formatting passed. Independent Sol review found
no P0–P2 issue in the two changed product files. These changes require fresh PR #737
CI; results on its previous head do not cover this correction. Bacs live stays
disabled, and T18/T19 completion is not claimed.

**Queued owner request:** Add a Finance setting named “Name on parents' bank
statements”, with validation and a preview, as a separate focused PR after the
current PR passes and is confirmed merged. Card statement names and paid Bacs
Custom Branding must be distinguished. No Bacs branding fee was enabled or
approved; no implementation of that next change has started.
