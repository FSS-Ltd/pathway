# NexSteps Finance delivery progress

Every T01–T19 step is a separate PR. The next step may not start until the current PR revision has applicable passing CI and GitHub confirms the PR merged into master. A draft, local commit, green stale revision or merge-queue entry does not clear the gate.

**T01:** Discovery and compatibility findings recorded. [PR #632](https://github.com/FSS-Ltd/pathway/pull/632) is still a draft; current-revision CI and merge are pending.

The previous checked revision was `216b966c36d9fd1a0924bdd10bd84cbca10650c0`. Its CI passed before the current documentation update. Current-revision CI must pass before merge.

### T01 CI evidence

On PR head `216b966c36d9fd1a0924bdd10bd84cbca10650c0`, GitHub reported passing typecheck, lint, all unit-test suites, integration tests, organisation-role RLS, permission-definition database, system-role seed database identity, both Analyze jobs and CodeQL. This result predates the current documentation update and must be superseded by current-revision CI before merge.

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

PR #632 remains draft until the current documentation revision has passed local review and current-revision CI. T01's compatibility evidence records both the sandbox account facts and the specific missing school-connected fixture; the account-scoped payment tests are acceptance criteria in T07–T10, and Bacs remains blocked in T13. Record the final checked head and required CI results from GitHub, then add the merge commit and timestamp only after GitHub confirms merge. T02 is not permitted to start before T01 is merged.
