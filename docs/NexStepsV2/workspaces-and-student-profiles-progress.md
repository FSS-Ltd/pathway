# Workspace and student profile delivery

This record tracks the approved five-step change across the authenticated
Nexsteps web app. Start each step from the merged `FSS-Ltd/pathway` `master`.
Do not begin the next step until the current PR passes applicable CI on its
latest revision and GitHub confirms its merge.

1. **Wider responsive staff and family workspaces — draft PR.**
   [#601](https://github.com/FSS-Ltd/pathway/pull/601) targets `master` from
   base `9309ad2b825484d2754caaa1a1def6713940f337`. CI passed on head
   `15831df44aaf2789dcaa53fb731c8bd9521c3883`: typecheck/lint/unit,
   integration, three database checks, and CodeQL. Recheck CI after this
   documentation update. Authenticated browser review and merge remain pending.
2. **Compact per-person permission badges — planned.** Begins after step 1 merge.
3. **ACE behaviour category creation and creator badge — planned.** Begins after step 2 merge.
4. **Staff and parent student overviews — planned.** Begins after step 3 merge.
5. **ACE PACE placement management in profile editing — planned.** Begins after step 4 merge.

Step 1 local verification: admin typecheck, changed-file lint and Prettier,
shell/navigation regression checks, and production build passed. The build
used explicit mock API mode and a synthetic Clerk public key. Browser review
of authenticated views is blocked by Clerk's external sign-in handshake in
this isolated checkout; no live sign-in was attempted.

Behaviour, merits, demerits, discipline and PACE remain ACE-only. Academic
results appear only from supported data sources. Finance and merit-wallet
tabs stay hidden while those modules are unavailable.
