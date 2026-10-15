# NexSteps Finance delivery progress

Every T01–T19 step is a separate PR. The next step may not start until the current PR revision has applicable passing CI and GitHub confirms the PR merged into master. A draft, local commit, green stale revision or merge-queue entry does not clear the gate.

| Step | Scope                                                                                                       | PR         | Checked revision                                                          | Checks and merge evidence                                                                                                                                                                                | State                                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| T01  | Repository map, reconciled Finance specification, access/provider decisions and sandbox compatibility proof | Not opened | build/finance-t01-discovery from 47d698d053df8d91696fec7e330d837e28f93c2b | API billing/entitlement 6 suites / 62 passed; Platform 12 suites / 189 passed (5 skipped); Auth 3 suites / 15 passed. Provider sandbox proof not run: no authorised disposable test account credentials. | In progress; provider proof blocker. |

## T01 evidence

- Repository code graph was missing at checkout. graphify update . generated 7,265 nodes and 10,788 edges across 2,035 files. After the Finance docs were written, semantic nodes were added and the supported Graphify build/cluster/report APIs regenerated a 7,280-node, 10,796-edge graph and report. HTML export was skipped because Graphify does not support visualising graphs over 5,000 nodes.
- Dependency installation completed package linking but exited with ERR_PNPM_IGNORED_BUILDS for unapproved dependency build scripts. The repository pnpm-workspace.yaml was restored to its tracked content; no build-script approvals were added.
- Jest baselines were invoked directly from installed package binaries to avoid changing pnpm's script approval policy. Prettier and git diff whitespace checks passed for the documentation.
- API tests run directly through the installed Jest binary: billing provider configuration; entitlement service/enforcement; module grants; buy-now service; Stripe buy-now provider (6 suites, 62 tests passed).
- Scope is planning/discovery only. No production migration, payment account, Stripe Product/Price, live payment, deployment, or source-code change.

## Merge gate

Update the T01 row with its PR URL and exact checked head, current required CI results, merge commit and merge timestamp only after GitHub verifies each. Do not mark T01 complete while its provider proof is missing. T02 is not permitted to start before T01 proof, passing current-revision CI, and confirmed merge.
