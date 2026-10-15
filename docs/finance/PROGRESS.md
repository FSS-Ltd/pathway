# NexSteps Finance delivery progress

Every T01–T19 step is a separate PR. The next step may not start until the current PR revision has applicable passing CI and GitHub confirms the PR merged into master. A draft, local commit, green stale revision or merge-queue entry does not clear the gate.

| Step | Scope                                                                                                       | PR                                                          | Checked revision                                      | Checks and merge evidence                                                                                                                           | State                               |
| ---- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| T01  | Repository map, reconciled Finance specification, access/provider decisions and sandbox compatibility proof | [#632](https://github.com/FSS-Ltd/pathway/pull/632) (draft) | CI passed on 81ccaae82ccbc8a379a7c48ca18d6554e227679a | CI checks and local test baselines are recorded below. Provider sandbox proof not run: no authorised disposable test account credentials. No merge. | Draft open; provider proof blocker. |

### T01 CI evidence

On PR head `81ccaae82ccbc8a379a7c48ca18d6554e227679a`, GitHub reported passing typecheck, lint, all unit-test suites, integration tests, organisation-role RLS, permission-definition database, system-role seed database identity, both Analyze jobs and CodeQL. CodeQL passed on this docs-only revision. This result does not clear T01 because the required Stripe sandbox compatibility proof is still missing.

## T01 evidence

- Follow-up pricing direction: the user specified target standalone Finance Stripe prices of £29 monthly / £290 annually. The current catalogue still lists £15/£150 as Proposed; T07 must reconcile the catalogue and Stripe configuration before any live checkout. No price or payment account was changed in T01.

- Repository code graph was missing at checkout. graphify update . generated 7,265 nodes and 10,788 edges across 2,035 files. After the Finance docs were written, semantic nodes were added and the supported Graphify build/cluster/report APIs regenerated a 7,280-node, 10,796-edge graph and report. HTML export was skipped because Graphify does not support visualising graphs over 5,000 nodes.
- Dependency installation completed package linking but exited with ERR_PNPM_IGNORED_BUILDS for unapproved dependency build scripts. The repository pnpm-workspace.yaml was restored to its tracked content; no build-script approvals were added.
- Jest baselines were invoked directly from installed package binaries to avoid changing pnpm's script approval policy. Prettier and git diff whitespace checks passed for the documentation.
- API tests run directly through the installed Jest binary: billing provider configuration; entitlement service/enforcement; module grants; buy-now service; Stripe buy-now provider (6 suites, 62 tests passed).
- Scope is planning/discovery only. No production migration, payment account, Stripe Product/Price, live payment, deployment, or source-code change.

## Merge gate

The draft PR is #632. Record its final checked head and required CI results from GitHub, then add the merge commit and timestamp only after GitHub confirms merge. Do not mark T01 complete while provider proof is missing. T02 is not permitted to start before T01 proof, passing current-revision CI, and confirmed merge.
