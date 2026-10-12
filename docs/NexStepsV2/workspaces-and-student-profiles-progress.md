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
2. **Compact per-person permission badges — planned.** Begins after the Academic setup width correction merges.
3. **ACE behaviour category creation and creator badge — planned.** Begins after step 2 merge.
4. **Staff and parent student overviews — planned.** Begins after step 3 merge.
5. **ACE PACE placement management in profile editing — planned.** Begins after step 4 merge.

Step 1 local verification: admin typecheck, changed-file lint and Prettier,
shell/navigation regression checks, and production build passed. The build
used explicit mock API mode and a synthetic Clerk public key. Browser review
of authenticated views is blocked by Clerk's external sign-in handshake in
this isolated checkout; no live sign-in was attempted.

The user identified the Academic setup page's remaining `max-w-4xl` wrapper
after step 1 merged. [Follow-up PR #602](https://github.com/FSS-Ltd/pathway/pull/602)
starts from the merged `master`, removes that constraint, and arranges its
settings in a responsive grid. CI, authenticated visual review, and merge
remain pending before step 2 begins.

Behaviour, merits, demerits, discipline and PACE remain ACE-only. Academic
results appear only from supported data sources. Finance and merit-wallet
tabs stay hidden while those modules are unavailable.
