# Event-driven delivery progress

Approved plan: [Event-driven updates and worker wakeups](README.md).
Base: FSS-Ltd/pathway `master`; step 1.1 starts at
`82770da7fd836d031c2e3ed76f127e5c723a5249` (PR #734 merged).

| Step | State                        | PR / evidence                                                            | Next permitted action                                          |
| ---- | ---------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1.1  | PR open; review fix verified | [#736](https://github.com/FSS-Ltd/pathway/pull/736); local checks passed | Verify latest-head CI; obtain production merge authorization   |
| 1.2  | Planned                      | No implementation started                                                | Wait for 1.1 PR, current-revision green CI and confirmed merge |
| 1.3  | Planned                      | No implementation started                                                | Wait for 1.2 gate                                              |
| 1.4  | Planned                      | No implementation started                                                | Wait for 1.3 gate                                              |
| 1.5  | Planned                      | No implementation started                                                | Wait for 1.4 gate                                              |

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
