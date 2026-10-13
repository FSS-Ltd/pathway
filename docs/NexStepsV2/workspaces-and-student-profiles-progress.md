# Workspace and student profile delivery

This record tracks the approved five-step change across the authenticated
Nexsteps web app. Start each step from the merged `FSS-Ltd/pathway` `master`.
Do not begin the next step until the current PR passes applicable CI on its
latest revision and GitHub confirms its merge.

1. **Wider responsive staff and family workspaces — merged.**
   [#601](https://github.com/FSS-Ltd/pathway/pull/601) targets `master` from
   base `9309ad2b825484d2754caaa1a1def6713940f337`. All eight CI checks
   passed on head `66bd9ca905256d805abe07eefd5656709016697d`. GitHub
   confirmed merge commit `c11f51b1dc2340b1149c79e2875aa8a596246dff`
   on 2026-10-12 at 13:41 UTC.
2. **Compact per-person permission badges — merged.** [PR #603](https://github.com/FSS-Ltd/pathway/pull/603) passed all eight checks on head `e60719b757ba65f7987d54c65798fb4dad89e6e7`. GitHub confirmed merge commit `b8e5da8fb7d46bf513d77ddc8e2cc508c548a163` on 2026-10-13 at 07:59 UTC.
3. **ACE behaviour category creation and creator badge — in progress.** Branch `feature/ace-behaviour-category-creation` starts from merged commit `b8e5da8fb7d46bf513d77ddc8e2cc508c548a163`. PR, CI and merge evidence will be added before step 4 begins.
4. **Staff and parent student overviews — planned.** Begins after step 3 merge.
5. **ACE PACE placement management in profile editing — planned.** Begins after step 4 merge.

Step 1 local verification: admin typecheck, changed-file lint and Prettier,
shell/navigation regression checks, and production build passed. The build
used explicit mock API mode and a synthetic Clerk public key. Browser review
of authenticated views is blocked by Clerk's external sign-in handshake in
this isolated checkout; no live sign-in was attempted.

The user identified the Academic setup page's remaining `max-w-4xl` wrapper
after step 1 merged. [Follow-up PR #602](https://github.com/FSS-Ltd/pathway/pull/602)
removed that constraint and arranged its settings in a responsive grid. All
eight CI checks passed on its latest revision. GitHub confirmed merge commit
`a8dbf4193d07d469b9d23282cb4cc90be3066d2f`. Authenticated visual review
was unavailable in the isolated checkout.

Step 2 replaces the person badge table with wrapping pill controls and a
hover/focus/touch details panel. The existing mutation, exclusion confirmation,
and revision contracts remain. Local admin typecheck, targeted integration
test, changed-file lint and Prettier, and production build passed. Authenticated
visual review remains unavailable in the isolated checkout.

Behaviour, merits, demerits, discipline and PACE remain ACE-only. Academic
results appear only from supported data sources. Finance and merit-wallet
tabs stay hidden while those modules are unavailable.

Step 3 adds the `behaviour-category-creator` value to the persisted
`AccessTagKey` enum, plus the ACE-only
`ace.behaviour.categories.create` permission. Deployment must apply the
migration, synchronise permission definitions, and run the protected
system-role seed so existing Organisation Head roles receive the default
permission. The seed retains explicit badge exclusions. No live database
seed or production migration has been run from this worktree.

Step 3 local verification: Prisma validation; platform, auth, DB, API, and
admin typechecks; changed-file ESLint and Prettier; API behaviour policy unit
tests (18 passed); database-backed policy concurrency tests (2 passed);
platform access-tag tests (7 passed); auth template tests (7 passed); DB role
seed tests (4 passed, 1 existing environment-gated skip); the full admin unit
script; and the admin production build all passed. Authenticated visual review
remains unavailable in this isolated checkout. The Graphify code graph was
updated; its HTML view was omitted by Graphify because the graph exceeds its
visualisation size limit.
