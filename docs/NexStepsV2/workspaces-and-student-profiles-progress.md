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
3. **ACE behaviour category creation and creator badge — merged.** [PR #604](https://github.com/FSS-Ltd/pathway/pull/604) from branch `feature/ace-behaviour-category-creation` started from merged commit `b8e5da8fb7d46bf513d77ddc8e2cc508c548a163`. All eight CI checks passed on head `9c5ab68b9cb50ce0a35ecdfbf9f5d7a6b333c140`. GitHub confirmed merge commit `17788327d19b5a5bbc837685bf206483f77dfa98` on 2026-10-13 at 08:47 UTC.
4. **Staff and parent student overviews — merged.** [PR #607](https://github.com/FSS-Ltd/pathway/pull/607) passed all eight CI checks on head `8692ba8ed74f04f57f385f2ea599e2b24ec51ab7`. GitHub confirmed merge commit `35e5bcf6ad907d12d02053eacb7324235288f2a3` on 2026-10-13 at 09:38 UTC.
5. **ACE PACE placement management in profile editing — merged.** [PR #608](https://github.com/FSS-Ltd/pathway/pull/608) from branch `feature/ace-pace-profile-placement` started from the step 4 merge commit `35e5bcf6ad907d12d02053eacb7324235288f2a3`. All eight CI checks passed on head `0eb8d2ec429d75e359f474cc9cbd136f69078113`. GitHub confirmed merge commit `37a025ccacc2aba3878254e7b4146083d2a2bd2d` on 2026-10-13 at 10:20 UTC.

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

Step 4 adds separate staff and linked-parent overview endpoints with explicit
section states and server-approved tabs/actions. The family landing advertises
the generic overview across sectors, while ACE summary pages retain their
notices and messages. ACE parent PACE and general behaviour counts require a
full current guardian link, active enrolment, and the parent-progress grant;
sensitive behaviour entries are filtered before aggregation. Existing family
release policy keeps parent reports hidden. Parent contacts and registration
remain hidden because the current records include other guardians' private
details and sensitive intake information without a family-visibility rule.
Staff academic results use published family-safe term-report summaries; no
general gradebook data source exists.

Step 4 local verification: admin and API typechecks and production builds,
the full admin test script, all 199 API unit suites (1,423 tests), three
database-backed family/child integration suites (20 tests), changed-file
ESLint and Prettier, and `git diff --check` passed. The integration run first
exposed a stale fixed-name fixture in the existing child test; its name now
uses that test's per-run nonce and the rerun passed. Authenticated visual
review at the planned widths and zoom remains unavailable because Clerk's
external sign-in handshake cannot be completed from this isolated checkout.
The Graphify code graph was refreshed after the implementation; its HTML view
is omitted automatically because the graph exceeds the visualisation limit.

Step 5 adds an ACE-only Subjects & PACEs editor tab for authorised staff,
reusing the existing assignment and revision form. An unassignment requires an
end date, reason and confirmation. The new endpoint verifies the active site,
child and `ace.pace.record` permission, serialises against PACE commands, keeps
the placement and assessment history, clears the disposable active progress
projection, and writes audit and outbox records atomically. There is no schema
migration. The active placement list now shows current progress from the
projection rather than a stale starting value. API/admin typechecks, the full
admin test script, all 201 API unit suites (1,434 tests), the database-backed
PACE placement lifecycle test, and both production builds passed. Changed-file
lint and formatting were checked explicitly. Authenticated responsive and
focus review remains unavailable in this isolated checkout because Clerk's
external sign-in handshake cannot be completed here. The Graphify code graph
was refreshed; its HTML view exceeds the visualisation size limit.

## CF-1: Database-backed child and family filters (2026-10-26)

Standalone follow-up to the completed workspace work above. The repository-wide
lookup audit found three remaining blind text filters: Children, Parents &
Guardians, and session attendance. These now share a native dropdown over the
existing authenticated API records and filter by stable ID. Existing creation
fields and database-backed mobile, family, learning, safeguarding, ACE, notices,
trips and Finance choices remain. Cross-origin child/parent lookups now include
the active-site cookies and return safe errors. No schema or dependency changes.

Implementation and local verification are recorded in
[PR #751](https://github.com/FSS-Ltd/pathway/pull/751), targeting `master`.
The PR’s **CF-1 delivery evidence** section is the current record for checked
head/test-merge revisions, CI results, review status and host-reported merge
evidence. Plan, audit, acceptance criteria and local verification evidence are in
[the CF-1 record](../superpowers/plans/2026-10-26-child-family-selection.md).
The branch is `feature/child-family-db-selection`, based on host-verified merged
PR #750 at `ba3d7fd282b4aaf19d4ae5f9a0857dc6246b0ee8`.

Local admin full unit suite, typecheck, changed-file lint/formatting, production
build and independent review passed. Desktop/mobile component previews and
keyboard type-ahead used synthetic HTTP data; live signed-in database E2E was
not run because no isolated Clerk identity/database setup was available. No
server implementation changed. Graphify updated its code graph; the HTML view
exceeds its size limit. The user authorized merging PR #751 after all required
CI passes. Delivery is complete only when the linked host record proves both
passing checks for the required revision and a merged PR with its merge commit.
