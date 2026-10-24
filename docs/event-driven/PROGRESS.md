# Event-driven delivery progress

Approved plan: [Event-driven updates and worker wakeups](README.md).
Base: FSS-Ltd/pathway `master`; step 1.1 starts at
`82770da7fd836d031c2e3ed76f127e5c723a5249` (PR #734 merged).

| Step | State       | PR / evidence                                                                                                | Next permitted action                                                   |
| ---- | ----------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1.1  | Merged      | [#736](https://github.com/FSS-Ltd/pathway/pull/736), merge `0ae915f8`; all 12 current-revision checks passed | Observe authorized deployment; capture remains off                      |
| 1.2  | In progress | [PR #739](https://github.com/FSS-Ltd/pathway/pull/739), branch `build/event-driven-1-2`                      | Finish verification/review; require current CI, authorization and merge |
| 1.3  | Planned     | No implementation started                                                                                    | Wait for 1.2 gate                                                       |
| 1.4  | Planned     | No implementation started                                                                                    | Wait for 1.3 gate                                                       |
| 1.5  | Planned     | No implementation started                                                                                    | Wait for 1.4 gate                                                       |

## Step 1.1 decisions and evidence

- Existing user changes in the original checkout remain untouched. Implementation
  uses the attached isolated worktree and current hosted master.
- Capture reuses OutboxEvent and reserves the realtime namespace; it does not
  introduce a new event service, new table or browser data access.
- Capture defaults off until the dedicated consumer is deployed and verified.
  Reason: PR sequencing can delay step 1.2 and must not strand an unbounded backlog.
  Risk: activation must be explicitly checked during step 1.2 release verification.
- Database tests first failed on missing committed intents, rollback coupling and
  organisation isolation; worker tests failed on missing namespace exclusion.
- Local PostgreSQL integration then passed 8 cases; workers passed 97 tests.
  Staged activation regression was separately observed failing before its guard.
- Full migration chain, including the new capture migration, applied successfully
  to a separate disposable PostgreSQL 16 database.
- Production activation is not authorized. Current merge workflow deploys database
  migrations and apps, so leave a concrete verified PR for the user's merge decision.

Live latest-head CI, review and merge evidence will be recorded in the PR's delivery
record. Do not mark this step complete from local checks or a pushed branch alone.

## Local verification

- Full database suite with the notification fixture enabled: 96 passed; 33
  existing opt-in database proofs skipped because their separate fixture flags
  were not enabled. The new suite passed all 22 cases (9 capture cases and 13 test-target validation cases).
- Workers: 21 suites / 97 tests passed.
- Database and workers typechecking, targeted ESLint, workers build, changed-code
  and new-document Prettier checks, and `git diff --check` passed.
- Full Prisma migration history, including the new migration, deployed to separate
  disposable PostgreSQL 16 databases with app and public schema layouts.
- No UI or provider delivery changed in step 1.1; browser/mobile E2E and live
  Supabase subscription/dispatch checks belong to subsequent delivery steps.

## Independent review

- Reviewed implementation range 82770da7..f9f6622d. No additional production
  correctness defect was established; current source-table RLS and cursor guards
  were inspected separately from the minimal capture fixture.
- P2 fixed: reject URI query parameters/fragments and non-PostgreSQL schemes;
  pass the canonical validated fixture URL to libpq. Six override cases and four
  scheme/canonicalization cases were observed failing before their fixes. The full
  database suite then passed with all 22 notification/guard cases.
- No deferred minor findings. Remaining production authorization/bridge-view
  verification limits are recorded in README.md. Future-step behavior was correctly
  outside this review; it has not been implemented or claimed complete.
- Latest pushed revision, CI results and merge state are recorded in PR #736's
  delivery record. Step 1.2 remains gated until current-revision CI and merge.

## Step 1.1 merge evidence

- User authorized merge and its production deployment after passing CI.
- Checked head: `fc9acaefbfc911a67b51237dc3d258db47f7f220`; [CI](https://github.com/FSS-Ltd/pathway/actions/runs/40030912057) and all 12 checks passed.
- Verified hosted merge at `2026-10-23T22:42:13Z`: `0ae915f8c70b258056ec10164fff225da4c3d62a`.
- Tested merge `a1724431` and actual merge have identical tree `89eee1e4289dba3ed6a3d839ff7ad66cadc5b10e`.
- [Deployment](https://github.com/FSS-Ltd/pathway/actions/runs/40035308020): all migration, web, admin and API deployment jobs passed.
- The isolated checkout is reused for the active next step; original user changes remain untouched.

## Step 1.2 implementation verification (not merged)

- [Draft PR #739](https://github.com/FSS-Ltd/pathway/pull/739) implements messaging
  conversion. No 1.3 work has started; current CI, review, production authorization
  and confirmed merge remain required before progression.
- Private user/site inbox invalidations commit with source mutations and durable
  outbox intent. Signed anchor claims retain existing join checks; publication
  rechecks each source's current recipients, including other conversations.
- Final local API units: all 367 discovered files covered exactly once across
  four bounded shards, 2,462 passed, none failed/skipped. The initial single-process
  run exhausted its heap; bounded shards resolved the local resource limit.
- Platform: 249 passed, five pre-existing skipped. Database: 96 passed,
  33 pre-existing skipped. Full browser units, API/admin/platform typechecks,
  targeted lint and current API/serverless/admin builds passed.
- Actual Supabase provider: all 15 cases passed, covering commit/rollback, read
  cursors, duplicates, strict queue errors, forced RLS, signed-scope isolation,
  revocation, off-screen inbox updates, renewals and transport recovery. Added
  tag-only responder join/delivery/revocation and guardian eligibility checks for
  both live delivery and pending-intent reconciliation.
- HTTP family security: 15 passed. Verification also ran without ambient local
  environment files, which were restored afterward. Open-handle detection in
  [Node 24 provider CI](https://github.com/FSS-Ltd/pathway/actions/runs/40049672666)
  passed and exited normally; the earlier pooled-worker exit warning did not recur.
- ECR's shared anonymous download quota initially blocked CI before tests. The
  fixture now uses verified official Docker Hub releases and can reuse same-version
  cached CLI images locally. No provider version or runtime event service changed.
- Upstream #737 has all 12 checks green and is confirmed merged at `85d449db`.
  Integrated it in `a1cfa3ba`; current verification includes that finance base.
- [Activation and recovery runbook](MESSAGING-RUNBOOK.md) records migration impact,
  provider versions and hosted restart/upgrade verification limits. Production
  merge/activation authorization is still required for this step.

- Independent whole-branch review completed for `85d449db..b2a52b3e`. The guardian
  eligibility finding reproduced a two-row metadata leak before the shared ACL
  fix; all 15 provider cases and 15 HTTP security cases then passed. The tag-key
  finding was rejected after checking Prisma's enum mapping and proving actual
  tag-only behavior. Review decisions and limits are recorded in STEP-1-2.md.
- The final ACL-fix revision still needs current-revision CI and separate merge/
  deployment authorization. No later delivery step has started.

- Read-only production metadata preflight passed with verified TLS: queue columns/
  defaults and migration-role INSERT privileges are compatible; existing ACE
  private-topic policies use the authorizer. Bounded discovery found zero pending
  realtime intents. Public core/identity/outbox plus partial app bridge views are
  recorded in the runbook. Exact-layout local authorization and durable publication
  passed inside a rolled-back transaction, including the public outbox trigger path.
