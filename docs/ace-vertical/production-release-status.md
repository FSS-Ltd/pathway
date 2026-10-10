# ACE production release status

Checked on 9 October 2026. Production API, admin, and web aliases point to
READY deployments at merged commit `5c26afca3caca259cc592b20f3b4ebe51ee873fa`.
The API uses the restored London Supabase project `jzofykdzpuslpdyfovxp`;
live `/health` returned HTTP 200 with a database timestamp. The merged ACE
changes through C07f are now served by all three apps.
The [ACE master implementation plan](../superpowers/plans/2026-07-25-ace-vertical-master-plan.md)
defines 150 delivery tasks. Merged task PRs are evidenced for its 22 foundation
and 20 daily-operations tasks: **42/150, or 28% verified plan-task completion**.
The later messaging, learning, add-on, and launch tracks have not been fully
reconciled task by task; 28% is a documented minimum, not an estimate of all
delivered outcomes. Earlier 81% and 52% qualitative estimates below use a
different basis and should not be read as plan-task completion.

For a core school pilot, the plan groups 88 foundation, operations, messaging,
and core-journey tasks with 9 pilot/launch tasks: **97/150 (about 65%)** if all
53 optional add-on tasks are deferred. This is a task-count milestone, not an
automatic readiness threshold; the nine launch tasks require UAT, security,
accessibility, performance, restore, support, and staged go/no-go evidence.
With 42 tasks currently evidenced, 55 core/launch tasks remain to be verified
or completed; some later work is already partially merged. The delivery waves
are: reconcile ACE-M and ACE-C task evidence against merged PRs, finish the
remaining ACE-M messaging/notices/identity tasks through the M20 gate, finish
the remaining ACE-C core journeys, then execute ACE-L01 to L09. Keep each
numbered build step in its own PR with latest-head green CI and a confirmed
merge before starting the next step. Reconcile the count after each merge.

Build update (10 October): step 1.3e5d merged in
[PR #546](https://github.com/FSS-Ltd/pathway/pull/546) at
`5a09d22f02e9a2ea28a4c227e1dd994f56ae81b0`. All eight checks passed
on head `ff32874ce639ce125b43b7b59a741ae4e5fad07a`; the database
integration log confirms the new draft route test ran. Step 1.3e5d1 merged in
[PR #548](https://github.com/FSS-Ltd/pathway/pull/548) at
`24f6bcf4eda7227acc5c8e19fdd2684dde98a381`; all eight checks passed
on head `40bdce5a7c1b7c0fecfd135b1c26590839acee69`, including the notice
author regression in both identity schema layouts. Step 1.3e5e, the ACE-M13
site notice publish and withdraw API, merged in
[PR #550](https://github.com/FSS-Ltd/pathway/pull/550) at
`0272b862a1339a979598f5a76d27a4d04af70b98`. All eight checks passed
on head `6cb0918dd6820650bd45eee48befff6f412a6f0b` (CI run
38069238757; CodeQL run 38069238052), and the PostgreSQL integration log
confirms the ACE notice E2E suite ran. These site-scoped notice APIs have not
been deployed to production. ACE-M13 remains incomplete. On 10 October the
product decision was to share
notice capabilities that benefit all site models, including scheduling and
receipts, while keeping school-specific class and guardian targeting within
an ACE extension with its own audience and access review. The current API
publishes site-wide notices immediately; scheduling, cancellation before
publication, and class/group/guardian targeting remain M13 work.
ACE-M20's identity and security gate remains
open before ACE-C01 through C05 homework tasks begin.

Build step 1.3e5f (merged, not deployed): consolidate site notices
on one canonical record store across site models, import legacy announcements
with original IDs and unknown historical author/receipt state, mirror writes
from older app releases during cutover, and put staff reading and management
under the existing `/notices` entry point. The web editor uses draft,
audience-preview, publish, and withdraw commands; parent-targeted drafts stay
unpublished in the web UI until the family inbox is available. The live
database read found 15 published legacy announcements at five sites and zero
ACE notice rows. PR [#552](https://github.com/FSS-Ltd/pathway/pull/552)
merged into `master` as `9b8835ba8eb750a53837fcc43253879b87a2d86f`
from head `ed078be19a48520bf30ca3a60e7ac3db5e9b428a`. All eight latest-head
checks passed, including Integration Tests and the three database jobs (CI run
38076773221; CodeQL run 38076769974). The migration discovers both `app`
and `public` legacy table layouts and rejects overlapping IDs. This host cannot
start a local PostgreSQL cluster (`shmget`: no free shared-memory segment).

Build step 1.3e5g (merged, not deployed): the relationship-scoped parent
notice API and family inbox use the canonical records, and the shared editor
can publish to parent audiences. PR
[#553](https://github.com/FSS-Ltd/pathway/pull/553) merged into `master` as
`03865b1ac4856210657fe769156d419382edb721` from head
`acfb6724f22a51f576966400db7e3fad273f1c5c`. All eight latest-head
checks passed, including Integration Tests and the three database jobs (CI run
38077903948; CodeQL run 38077901813). The parent database E2E could not run
locally because the test PostgreSQL server at `localhost:5433` is unavailable.

Build step 1.3e5h (merged, not deployed): add optional, write-once acknowledgement to
the shared notice receipt model, guarded reader commands, publisher aggregate
receipt totals, and matching family and staff web controls. PR
[#554](https://github.com/FSS-Ltd/pathway/pull/554) merged into `master` as
`95cc8ea4ff5a2d960bda8db49a78f7ccb26be76e` from head
`07ebb4774e8d043eebc6bd7274addc88b1b10a42`. All eight latest-head
checks passed, including Integration Tests and the three database jobs (CI run
38080016504; CodeQL run 38080013505). ACE-M13 and M14
remain incomplete: scheduled publication and cancellation, narrower school
audiences, mobile notice experience, and launch verification are still open.
The plan-task count remains **42/150 (28%)** because no complete ACE master-plan
task was added by PR #554.

Build step 1.3e5i (merged): schedule and cancel shared site notices
through the existing `/notices` screen and API. A minute cron sweep will
recheck the scheduled publisher's permission, audience, expiry, and draft
revision before using the existing publication transaction. The migration
adds scheduled metadata and a bounded due-notice discovery function. This step
requires a configured API `CRON_SECRET` and a Vercel plan that supports minute
cron before production use. [PR #555](https://github.com/FSS-Ltd/pathway/pull/555)
merged to `master` as `cb2c20d0b66490dd24a6a97da71eed0cdb7b2f0e`
from checked head `70fd7ccbcf422e6e0af269018178374fdba5d5c2`.
All eight latest-head checks passed (CI run 38081211207; CodeQL run
38081208228), including Integration Tests and the three database jobs.
The API Vercel project has a 64-character random production-only sensitive
`CRON_SECRET`; its Pro plan supports minute cron. The production API deployment
for the merge commit is READY, and Vercel shows Cron Jobs enabled with
`/api/internal/notice-schedules/run` scheduled every minute. Vercel's
path-filtered production logs show repeated GET 200 responses from 20:03 to
20:18 UTC on 10 October, confirming that the authenticated sweep is running.
A signed-in staging schedule publishing after its due time is still required
before claiming end-to-end scheduled publication. The plan-task count remains
**42/150 (28%)** because ACE-M13 and M14 are not yet complete.

Build step 1.3e5j (merged, not deployed): add ACE school year-band, site-group, and
one-child guardian targeting to the shared notice draft, preview, publish,
schedule, inbox, and staff editor flow. Year-band staff come from current ACE
staff assignments; group and child notices address guardians only because the
site Group model has no authoritative staff assignment. A recipient's target
child IDs freeze the publication reach while current full guardian links still
gate reads. [PR #556](https://github.com/FSS-Ltd/pathway/pull/556) merged into
`master` as `18850674b91ddfa9526083c7144ebc39caed77ba` from checked head
`14b7d75fd7b1e931699817701841cf74cac4df1c`. All eight latest-head checks
passed (CI run 38084145084; CodeQL run 38084142024), including integration
and database checks. Local API/admin type checks, lint, builds, Prisma
validation, formatting, 39 focused API unit tests, and the staff picker
component test passed. The plan-task count remains **42/150 (28%)** while
ACE-M13 and M14 are not yet fully reconciled.

Build step 1.3e5k ([PR #557](https://github.com/FSS-Ltd/pathway/pull/557),
merged, not deployed): require a second publisher confirmation when the selected
audience or resolved recipient snapshot changes after preview, or a
publish/schedule conflict invalidates it. Keep the current server-side revision and
audience-version checks. The admin test covers empty audience, stale-preview
conflict, reconfirmation, and both send controls. Local admin tests, typecheck,
lint, build with test configuration, formatting, and structural Graphify passed.
All eight latest-head checks passed on `caee165a0c3264e3fe935b9837e2675ca737b0ab`
(CI run 38087062057). GitHub confirmed the merge to `master` as
`0eec3e4e05169a8d97f6eff4ffb2b3d0c112b858`.
The plan-task count remains **42/150 (28%)** because ACE-M13 and M14 still
need full task-level reconciliation.
Mobile notice work is paused at the user's request and excluded from this PR.

Build step 1.3e5l ([PR #558](https://github.com/FSS-Ltd/pathway/pull/558),
web guardian identity onboarding, merged on 10 October): replace the
legacy parent invitation that linked a child and granted a site viewer role
before acceptance. The new staff flow requires an organisation admin to record
the legal access basis, creates a seven-day child-scoped pending invitation,
and supports status, resend, and revoke. A guardian must sign in with the
verified invited address and accept before a reviewed relationship and parent
role are created. The web acceptance page and child profile now use this flow;
child list and creation are staff-only, while a guardian can read an individual
child only with an active full relationship. Existing parent profiles retain
their legacy link after acceptance, but it is no longer sufficient for child
record access. A nullable, backfilled invitation email snapshot retains the
address staff reviewed even when first Clerk sign-in creates an internal user
without an email claim and acceptance transfers the invitation to that user.
Mobile work remains paused. ACE-M15 and M20 remain open until
the remaining identity, relationship, and security tasks are verified. Local
API and admin type checks, lint, and builds passed; API unit tests passed after
the active-site expectation was updated, and admin tests passed. The guardian
database E2E could not run locally because PostgreSQL was unavailable. All
eight latest-head checks passed on `1ab8c066550db863d1cdb0f08b082828d251a4a0`
(CI run 38090625503, CodeQL run 38090623814). The PostgreSQL integration log
confirms the guardian E2E and invitation email migration ran; 79 suites and
487 tests passed. GitHub confirmed the merge to `master` as
`6c8cfce9b67df2a555c8ddaa3e876c1496156c5b`. The verified master-plan
task count remains **42/150 (28%)** because M15 and M20 are not yet complete.

Build step 1.3e5m (merged, web only): return available family sections
with each current guardian or student context and render only those sections at
`/ace/family`. Parent inbox links follow active notice and messaging reader
permissions; volunteering remains ACE school only. Disabling an account now
removes family contexts and denies direct attendance and timetable reads in
addition to the existing relationship and publication checks. The new
response is additive, with a web fallback for older API responses during
rollout. This is part of the web shell work, not completion of ACE-M16 or M18;
mobile remains paused. All eight latest-head checks passed on
`3eb5490da9e8381119a0193f8affb311d03a77c5` (CI run 38093907732;
CodeQL run 38093904618). The PostgreSQL integration log confirms the family
contexts, parent attendance, student attendance, and family subject timetable
E2E suites ran; 79 suites and 492 tests passed. GitHub confirmed
[PR #560](https://github.com/FSS-Ltd/pathway/pull/560) merged to `master` as
`f46405a4841f9ad615217d04fccbb412b50884e2`. The exact ACE master-plan
count remains **42/150 (28%)** because M16 and M18 are incomplete.

Build step 1.3e5n (in progress on `feature/ace-student-identity-web`):
add ACE school student identity invitations, verified-email acceptance,
site policy controls, active-link revocation, and student site discovery to
the web and API. The student identity ADR in the source matrix remains open;
the product owner must confirm the age and safeguarding rule before this
step can merge. The PostgreSQL invitation E2E also requires an executed CI
result because the local test database is unavailable. Mobile work remains
paused. The verified master-plan count remains **42/150 (28%)**; ACE-M15 is
not complete.

PR [#504](https://github.com/FSS-Ltd/pathway/pull/504) corrected the family
discovery policy target and merged as `26d43e4b6d194be5370bbc34f709bea4b025a351`.
The failed Prisma attempt was marked rolled back, then attempt 2 of
[production run 37837131918](https://github.com/FSS-Ltd/pathway/actions/runs/37837131918)
completed all four jobs. Prisma reported 113 migrations and an up-to-date
schema on the new database. Read-only checks confirmed the corrected migration,
four other 8 October migrations, and both policies on the `public` identity
tables. The [recovery runbook](runbooks/family-discovery-migration-recovery.md)
records the exact sequence.

Vercel then reported API, admin, and web deployments READY at `26d43e4b`.
The new API alias returned HTTP 500 on `/health`: its TSX-loaded
`DatabaseAvailabilityFilter` had no constructor injection metadata, so Nest
passed an undefined `HttpAdapterHost` during startup. Vercel runtime logs
confirmed the failure. The API, admin, and web aliases were rolled back to
the prior READY deployments at `a41e09a`; the API recovered to HTTP 200,
marketing and `/configure` returned HTTP 200, and admin redirected to Clerk
sign-in.

REL-3 merged in [PR #505](https://github.com/FSS-Ltd/pathway/pull/505) as
`9e09089cf84c41649e62bfebc10907768aef6e98`. All eight checks passed on
`cdfce7d5617883be34e64d34c483e5e11642c021`. Its
[production run 37840055622](https://github.com/FSS-Ltd/pathway/actions/runs/37840055622)
passed migration and all three app jobs. The new API deployment boots but its
protected `/health` and `/health/env` both return HTTP 500. A production-loader
local request reproduces the second cause: `TenantRlsInterceptor` receives an
undefined `Reflector` because TSX does not emit constructor injection metadata.
The three public aliases stayed pinned to the prior healthy deployments while
REL-4 was prepared.

REL-4 merged in [PR #506](https://github.com/FSS-Ltd/pathway/pull/506) as
`193a569892c38be565ac6755456f41bcf498ed76`. All eight checks passed on
`fe10f8d44e50c033fa9c29b851ac17fccf82f4bb`. Its
[production run 37842827452](https://github.com/FSS-Ltd/pathway/actions/runs/37842827452)
passed migrations and all three app jobs. Vercel reported READY API deployment
`dpl_5RzAB5eYw5KgyjiBmwkvMowzcRC7`, admin deployment
`dpl_Gu7XpikKssZERkSpGz1spQ7HsE7x`, and web deployment
`dpl_Ah2SmwVooat7AhYes8iMECFwDcZt`, all at that merge commit. Before
promotion, the protected API deployment returned HTTP 200 for `/health`,
`/health/env`, and `/public/blog/posts?limit=1`; protected marketing and
configurator returned HTTP 200, and admin redirected to sign-in. The three
aliases were then promoted and read back to those deployment IDs. Live routes
repeated the same responses; unauthenticated family-context and messaging
reads returned HTTP 401. Vercel reported no runtime error clusters for the
three projects in the checked ten-minute window.

This closes the production recovery smoke gate. Authenticated family and staff
journeys, billing callbacks, background workers, and full staging journey tests
were not exercised by these anonymous checks. Continue monitoring and verify
those paths before treating broader ACE parity as complete.

## Signed-in data loading follow-up — 8 October 2026

The production staff messaging screen was observed with “Your session could not
be verified. Please sign in again.” Its client request used a bearer token
captured at sign-in rather than the shared transport's current Clerk token.
The same request pattern existed in ACE settings, attendance, family, PACE,
and staff handover clients. REL-5 moves those requests through the shared current-token transport;
the regression test changes the token after sign-in and checks staff and parent
recipient discovery. A merged client fix still needs a signed-in production
journey before the data-loading issue can be closed.

REL-5 merged in [PR #509](https://github.com/FSS-Ltd/pathway/pull/509) as
`acd91f2e0421c60e553722cdde0ca9c6de1980ec`. All eight PR checks passed
on head `114e9e79c7fcb124d2cf4644d35d8e27d484e546`. [Production run
37848091808](https://github.com/FSS-Ltd/pathway/actions/runs/37848091808)
passed migrations and all three app jobs. Vercel reports READY API
`dpl_9Yz6LwDuGLJzyfLVBbJpkkqV8Qif`, admin
`dpl_BF7eiQyADYCjZyDMeh4RZJ7ecoRn`, and web
`dpl_VNPsS9QGBq94zWvaz3upN11kxwUA` at that commit, each assigned its
production domain. Live API health, environment health, and public blog reads
returned HTTP 200; admin messaging redirected to sign-in; marketing and the
configurator returned HTTP 200. No error events appeared for the new
deployments in the first checked runtime-log window. This confirms release
health, not signed-in data loading.

Read-only queries against the new production database found 44 staff or site
admin memberships, 60 legacy parent-child links, 14 guardian contact records,
no `GuardianIdentity` or `GuardianChildRelationship` rows, no access-tag grants,
and one Organisation Head assignment. The school's `parentPortalEnabled` flag
is false. These facts explain why the current parent portal and school-team
messaging cannot yet work even with a fresh token. Legacy links and contact
records need a reviewed mapping into ACE identity relationships; do not assume
every contact has full legal access. An authorised school responder must also
be assigned by a current fixed Head/Lead role or a scoped responder tag, and
the parent portal must be enabled for the intended school. Verify a linked
parent can discover a responder, open and send one school conversation, and
that the same responder can read and reply. Repeat after tag revocation, child
relationship end, and site switch. Until then, bidirectional production
messaging is **not verified**.

REL-6 addresses a separate signup gap: parent-portal registration created
children and legacy links without the active guardian relationship required
by family and messaging reads. New children registered through an enabled
portal will receive a `FULL` relationship for the registering account. The
existing-child link route will not create one; each of the 60 historical
links needs a legal-access review before conversion. An unauthenticated
signup for an email already in use must go through the verified existing-user
route. This code step does not enable the production parent portal or change
historical relationships.

REL-6 merged in [PR #510](https://github.com/FSS-Ltd/pathway/pull/510) as
`e41574943aba178d6b4f63a5cb81e5db384ce970`. All eight required checks
passed on head `fd98589d74c5271e395c63ae829f3205ec7a255f` (CI run
37849821831, CodeQL run 37849816768). [Production run
37851006289](https://github.com/FSS-Ltd/pathway/actions/runs/37851006289)
passed migrations and all three app deployments. Vercel reports READY API
`dpl_2fHw11vu7F6ibYa1TZgeFYoLtqzk`, admin
`dpl_DP4aMCXuo98N65JQBELxkps8L89a`, and web
`dpl_A7Ait3uAdNrdTzzfDN4NbbHjeDaE` on the production domains. Live API
health, environment health, public blog, and web configurator reads returned
HTTP 200; anonymous admin messaging redirected to sign-in. Signed-in family
and message data loading is still unverified.

REL-7 added immediate staff recipient discovery in Messages. A read-only
production check found five active staff memberships and one role-qualified
parent-message responder at Demo ACE School. The new-message picker now shows
the site's current staff before search while retaining site, role, student,
and permission checks. [PR #511](https://github.com/FSS-Ltd/pathway/pull/511)
passed all eight required checks on `9bf2231660bccae0ecab18a64db2315f4c033406`
(CI run 37853218498, CodeQL run 37853216229) and merged as
`dec83b36bf11a2418ac1beceb73efcc6d501ef64`. [Production run
37854200900](https://github.com/FSS-Ltd/pathway/actions/runs/37854200900)
passed migrations and all three deployments. Vercel reports READY API
`dpl_H6WVEuyVW5RhvVvPUSnnitcRdoNj`, admin
`dpl_6KARBDSkC51Df6FNTtf1EbjeVsGP`, and web
`dpl_DzwBmn8xVycvr2urqf1UypBRt3zH` on the production domains. Live API
health, environment health, public blog, and web configurator reads returned
HTTP 200; anonymous admin messaging redirected to sign-in. Signed-in message
and family data loading remains unverified. REL-7 does not enable the parent
portal or approve historical guardian links.

REL-8 addresses a separate admin API routing failure. Production runtime logs
show Clerk could not find its middleware context in the child-photo route;
both child-photo and staff-avatar routes returned HTTP 500 for anonymous
requests on 8 October. Both route handlers already return 401 when no token is
available, but the production middleware matcher excludes all `/api` paths.
REL-8 runs Clerk middleware for those paths while leaving authentication to
the route handlers. [PR #512](https://github.com/FSS-Ltd/pathway/pull/512)
passed all eight required checks on `c8727909ffb005d25fdcc48fc209f41e9c3b2ae0`
(CI run 37855242849, CodeQL run 37855239066) and merged as
`65a67a8e2574182d2cc0b332b54deafabc6b288c`. [Production run
37856228849](https://github.com/FSS-Ltd/pathway/actions/runs/37856228849)
passed migrations and all three app jobs. Vercel reports READY admin deployment
`dpl_33ND5BreJ1eKaazcwZibQ2VbbiKm` on `app.nexsteps.dev`. Both anonymous
admin API routes now return JSON HTTP 401 rather than 500; API health and the
web configurator return HTTP 200. A fresh signed-in production journey is
still needed to diagnose the Messages session error.

REL-9 prepares a school-reviewed path for historical guardian access. The
restored site has 30 active users across 60 legacy parent-child links, but no
parent `UserIdentity`, Parent role, guardian relationship, or signup-consent
record. An organisation admin may approve an existing same-site, non-guest
link only after the parent has signed in with a verified identity and the
school has checked legal access against records or a legal document. Each
approval creates an audited `FULL` relationship and a fixed Parent role.
The parent portal stays off until a separate school decision enables it.
No historical link is approved automatically. The parent profile read also
limits a parent's own child list to active, approved relationships, and
reserves profile child creation for organisation admins; editing one site's
links preserves links at other sites. The parent profile renders its scoped
detail response directly instead of requiring a separate full child-list read.
Removing a legacy link with current `FULL` guardian access is blocked until
an audited revocation flow is delivered; unlinking alone cannot silently leave
effective access behind.
REL-9 merged in [PR #513](https://github.com/FSS-Ltd/pathway/pull/513) as
`43e47d69ccd840001d9cc3587fb5509ca4b366e9`. All eight checks passed on
head `6bd3a72b1b67823db7d74a2f7ce9adec5d2e6290`. [Production run
37859521980](https://github.com/FSS-Ltd/pathway/actions/runs/37859521980)
passed migrations, API, and admin on its first attempt. The web job passed on
retry after a transient Nunito font-loader failure in an unchanged file. All
three Vercel deployments are READY on their production aliases: API
`dpl_8Zubo1ZKmSQBkUNzoPVqghsKPyP2`, admin
`dpl_CPoLrTZ9enTBDjPAzjh4sPyEs4Eh`, and web
`dpl_3J1aoMv3BLhERSKsFtSNYLWPNsdX`. Anonymous health, blog, admin sign-in
redirect, and configurator smoke checks passed. Signed-in parent-to-staff
messaging remains unverified.

REL-10 added organisation-admin revocation for an approved guardian-child
relationship at the selected site. Revocation requires a reason, records the
actor and time on the relationship, writes an audit event, and immediately
removes that child's effective guardian access. A fixed Parent role can remain
where the parent has other children. No historical links were approved or
revoked automatically. [PR #514](https://github.com/FSS-Ltd/pathway/pull/514)
merged as `2120a185808af996e60868a8f6e085c5199e775c` after all eight checks
passed on `f5f2304eac229b4b9ae321420781d2baca24ba53`. [Production run
37861902083](https://github.com/FSS-Ltd/pathway/actions/runs/37861902083)
passed migrations, API and admin; the web job passed on retry after the
unchanged Nunito font-loader failure. All three Vercel aliases were READY and
anonymous API, admin sign-in, and web smoke checks passed. Signed-in data
loading was still unverified at that release.

REL-11 addresses a confirmed production 500 on the authenticated staff
conversation list. The API's TSX production loader does not emit constructor
type metadata; Nest instantiated the staff messaging controller without its
services. A runtime audit found the same missing injection metadata in 20
other controllers and providers across ACE attendance, academic setup, PACE,
behaviour, dashboard, family access, feedback, NexSteps Home signup, and
privacy. This step adds explicit injection to all 22 affected classes and a
whole-app metadata regression check. The observed error was
`listStaffConversations` on an undefined service after an allowed access
decision; the production response contained no private message data. Local
TSX audit now finds zero missing dependencies among 111 classes with
constructor parameters. [PR #515](https://github.com/FSS-Ltd/pathway/pull/515)
merged as `532bfeb8d65df9d38a33d96ae01cb06f4a2adbff` after all eight
checks passed on `3ff450d1f4ac8f009bb280b689e231b8cbac29da`.
[Production run 37865725001](https://github.com/FSS-Ltd/pathway/actions/runs/37865725001)
passed migrations and all three Vercel deploy jobs; the API deployment
`dpl_2uokkPCA1HRrYFP4AnZKsaurPWD8` is READY on `api.nexsteps.dev`.
Authenticated Messages still returned 500 after this deployment because the
newer tables are in the `app` schema while Prisma queried `public`. The
existing School Team staff inbox and reply routes provide the return path for
parent conversations; the full two-way
journey still needs a live parent with approved guardian access.

REL-12 repairs that schema mismatch for the ten ACE message and notice tables.
It adds invoker-rights public views over the RLS-protected app tables, public
enum domains, and equality operators for Prisma's enum filters. The views
carry no direct Data API role grants. Before release, a transaction that
created the bridge, ran all five representative enum-filter reads, and rolled
back passed on the new database. [PR #516](https://github.com/FSS-Ltd/pathway/pull/516)
passed all eight required checks on `3c0a2350ebf3245cc705377d700019431ac91ad2`
(CI run 37867521249, CodeQL run 37867518620) and merged as
`68eec5eeda13eef0dd34ff771a2ec145ebe8db4b`.
[Production run 37868259048](https://github.com/FSS-Ltd/pathway/actions/runs/37868259048)
passed migration, API, admin, and web jobs. The migration ledger and catalog
show the bridge applied and all ten public views present. Vercel reports READY
API `dpl_BGaFK3YzL6gZKN66BEE4WCCuSr5k`, admin
`dpl_5iUJ5dGr866ARjiz32g7AbGT13Gw`, and web
`dpl_2bKg1i7cv5WnyFBgrY2EgRtXrpJz` at the merge commit on their production
aliases. Live API health, public blog, and web configurator reads returned 200.

A read-only invocation of the staff recipient service against the new database
returned four eligible colleagues for the signed-in Demo ACE School site
administrator; five active staff memberships exist at that site. A staff
conversation-list and recipient request reached the production API after the
migration with allowed access decisions, and Vercel showed no recent messaging
runtime error cluster. These checks do not prove that the recipient picker
rendered in a browser or that a message was sent and received. The signed-in
browser session could not be used to finish that visual check, so the staff
and parent two-way journeys remain open release checks. The restored parent
portal remains off, and historical guardian links still require the school's
legal-access review before activation.

REL-13 prevents the disabled parent portal from appearing as a failed School
Team data load. The staff Messages page uses the organisation's current portal
setting to disable that channel and explain the prerequisite; it continues to
load staff conversations and recipients. The API remains the authority for
portal, guardian, responder, and site access. A parent-to-staff send and staff
reply in production remain unverified pending approved parent access.
[PR #517](https://github.com/FSS-Ltd/pathway/pull/517) passed all eight checks
on `01a916a281fdafe56010c6d41cb5a3fca9478dff` (CI 37870030605, CodeQL 37870029534) and merged as `4c805d636a3cc82c627ef3c3bd42d3c96ea0356d`.
[Production run 37870846650](https://github.com/FSS-Ltd/pathway/actions/runs/37870846650)
passed migration and all three app deployments. Vercel confirms READY API
`dpl_YGP3KBMjjJr5H4WLCwPxRQBKYXih`, admin
`dpl_Fi7H59RCBGyvyw6xK4fd9gNjfpk8`, and web
`dpl_2NbKx11VF12YbF7G1fsrij6hUxyZ` on the production aliases at that SHA.
API health returned 200 with a database timestamp, and the configurator
returned 200. The admin Messages route redirected an unsigned request to
sign-in. In a signed-in browser's accessibility tree, the New message picker
exposed four current-site staff recipients. The screenshot capture remained
inconsistent with that tree, so a visual render and actual send/receive are
still open checks.

REL-14 adds one disposable-database integration journey that opens the parent
school-team thread, sends a parent message, loads it in the responder inbox,
replies as staff, and confirms the parent's inbox, history, and read cursor.
It is a regression gate for the existing two-way API path, not evidence of a
live parent exchange. Production activation still requires the school's
review of guardian access and the parent-portal switch.
[PR #518](https://github.com/FSS-Ltd/pathway/pull/518) passed all eight checks
on `aa44fc3152cb4b327824cb3eb104d663ffd378bf` (CI 37871889213, CodeQL
37871886845). The database integration job passed 72 suites and 459 tests,
including the parent-to-staff reply journey. It merged as
`ae1383b6195eb883bc5e99f08ed3cbc58dfd9741`.
[Production run 37872708126](https://github.com/FSS-Ltd/pathway/actions/runs/37872708126)
passed migrations and all three app deployments. Vercel confirms READY API
`dpl_HmYjzFdmfEhZWQu2FpzbZqHDgqag`, admin
`dpl_BsaPRRngohSJHfbYxUb7oMTK7CZ2`, and web
`dpl_7cB4kFeLDTvgcc442e7Q7iXWyHA7` on their production aliases at that
commit. API health returned 200 with a database timestamp, the configurator
returned 200, and unsigned admin Messages redirected to sign-in. These checks
do not exercise a live parent account.

REL-15 bounds staff and parent recipient discovery so an unanswered request
ends in an actionable retry state. This improves the published messaging
loading experience while the final production check remains open: a reviewed
linked parent must discover a responder, send a message, and see the staff
reply in the same site. The school must approve legal access and enable the
parent portal before that test; no historical link is approved automatically.
[PR #519](https://github.com/FSS-Ltd/pathway/pull/519) passed all eight checks
on `921ddfa8c3819b02f607015b92c2cd5febfea6b3` (CI 37875192316,
CodeQL 37875187357) and merged as
`da27ee63f25a51558d3e68948e04816f416223da`. [Production run
37875939897](https://github.com/FSS-Ltd/pathway/actions/runs/37875939897)
passed migrations and all three app jobs. Vercel reports READY API
`dpl_6hkBozHzFVLepEzDh5VLJuP2a9eh`, admin
`dpl_65UXQpXHgijvnR43WZ5uiUQ4k4vf`, and web
`dpl_HYX6a76nq652vXg6AYTQyHp8KkGc` at the merged commit. API health and
the public blog read returned HTTP 200; unsigned admin Messages redirected to
sign-in; the configurator returned HTTP 200. The signed-in ACE overview later
exposed attendance and PACE counts in the browser accessibility tree. A live
Messages visual check and parent-to-staff exchange remain open.

REL-16 addressed a separate pre-network loading gap. The shared admin API
transport could wait indefinitely for its Clerk token, even after a request's
abort signal fired. Token waiting now honours the request's abort signal,
expires after 15 seconds, and allows a new token attempt on retry.
[PR #520](https://github.com/FSS-Ltd/pathway/pull/520) passed all eight checks
on `b11ec3672862d2119ba445e863053fa8c0cb8a55` (CI 37877846658,
CodeQL 37877841712) and merged as
`4a23ab2cd1d7a8c2feed45603bdbe390f548282e`. [Production run
37878631116](https://github.com/FSS-Ltd/pathway/actions/runs/37878631116)
passed migrations and all three app jobs. Vercel confirms READY API
`dpl_GCQPLJrxUssv7VcRWrta85z9JzDK`, admin
`dpl_55SAY4RCSgcn8Qqq2s5ynFq1eYM8`, and web
`dpl_9mFrmHfiPuLpRoPsaAPBWHYTcGhD` on their production aliases at that
commit. Live API health returned a database timestamp, the public blog and
configurator returned HTTP 200, and unsigned admin Messages redirected to
sign-in. Vercel reported no runtime errors across the three projects in the
checked one-hour window. The user reports that the published pages now load
their data; this is a user observation, not a completed persona-by-persona
smoke test. Parent access remains off pending the school's guardian review.

REL-17 fixes the message composer focus treatment. A user-provided screenshot
showed the blue ring around a container while the text area sat inside it,
making the field appear detached. The shared staff and parent composer now puts
the border and focus ring on the text area itself, with Send adjacent.
[PR #521](https://github.com/FSS-Ltd/pathway/pull/521) passed all eight checks
on `f6dbadb1c78e084ce00a043841b89e05cc18f5dc` (CI 37879678167,
CodeQL 37879675426) and merged as
`a2dd1f2acf6fb9674c38a05b375054302a7da3b8`. [Production run
37880134482](https://github.com/FSS-Ltd/pathway/actions/runs/37880134482)
passed migrations and all three app jobs. Vercel confirms READY API
`dpl_WtfPUEDDp1qKfkNNmTLJN4xc7Y8w`, admin
`dpl_85iLTSCYHFRELnz4dbMirNyH5JNg`, and web
`dpl_D2aNLtYr6U21xJLBSdxqtixM5bRg` on their production aliases at that
commit. API health returned HTTP 200 with a database timestamp, the public
blog and configurator returned HTTP 200, and unsigned admin Messages redirected
to sign-in. Vercel reported no runtime error clusters for the three projects
in the checked one-hour window. A signed-in staff conversation loaded and its
focused composer showed the blue ring directly on the text area border; no
message was sent. Parent-to-staff production messaging remains gated by the
school's guardian review and parent-portal activation.

SEC-1 [PR #523](https://github.com/FSS-Ltd/pathway/pull/523) closed an actor
boundary on the legacy rota endpoints before ACE family/student timetable work.
A site or organisation manager can administer assignments and swaps. Staff
reads stay within their own assignments or swap
participation; staff may change only their own assignment status, request
their own swap, and decide a request only as its recipient or requester.
Swap recipients must be active staff at the site, and competing decisions
cannot both claim an open request. The present manager check uses existing
fixed Head/Lead and administrator authority; a dedicated delegable rota tag
is still to be designed. The family/student released-schedule journey remains
open. All eight PR checks passed on `11352796f02469ec90b5eb35929ff6eac026a8b3`
(CI run 37883306819, CodeQL run 37883303461); the database integration job
passed 72 suites and 461 tests, including the assignment and swap E2E suites.
The PR merged as `291abb9c2673b134eb163a42ba82ad01ca9d8ae8`.
[Production run 37883971325](https://github.com/FSS-Ltd/pathway/actions/runs/37883971325)
passed migration and all three app jobs. Vercel confirmed READY production
deployments for API `dpl_DrZ4Fe19zYjeAyHJkozHGEDcXdpL`, admin
`dpl_8qkv1BYYLFQyx85zwEU4nyAn3V7r`, and web
`dpl_EbtZaZL4t4R9PtTCZ4oZSuG4gdod` on that merge commit. Live API health
returned HTTP 200 with a database timestamp, the public blog and configurator
returned HTTP 200, unsigned assignment and swap routes returned HTTP 401,
and unsigned admin Messages redirected to sign-in. Vercel reported no runtime
error clusters across the three projects in the checked one-hour window.
Authenticated production rota actions were not exercised by this smoke check.

SEC-2 scopes the generic session routes to the same actor boundary before
family/student timetable work. Fixed site or organisation managers retain
site session administration. Assigned staff may read only their own sessions
and rosters and mark staff attendance only for a session to which they are
assigned. Parents cannot read the generic session detail or change sessions;
their future timetable requires a separate released, relationship-scoped view.
Local lint, typecheck, build, unit, formatting, diff, and Graphify checks passed.
The local E2E database was unavailable. All eight PR checks passed on
`57cbdc4e3572b5e1fdfed214cd5a80bcd2d923ff`, including 72 database-backed
integration suites and the session HTTP persona case. PR
[#525](https://github.com/FSS-Ltd/pathway/pull/525) merged as
`206f67ea1b29c916c4b7aa660a6f0a7d6c8d8891`. Production run
[37886741900](https://github.com/FSS-Ltd/pathway/actions/runs/37886741900)
passed migration and all three app jobs. Vercel reported READY API deployment
`dpl_766rw3sMgAmXr1YjD2iDM286kMZ6`, admin deployment
`dpl_5Geh3BQs5ZBgJSWtGb2dqsccMiME`, and web deployment
`dpl_CeYMhMEoZXGYfCoCwgSbqr54EVNY`, each serving that merge commit. Live
`/health` returned 200 with a database timestamp, public blog and configurator
returned 200, unsigned `/sessions` returned 401, and unsigned admin Messages
redirected to sign-in. Vercel reported no runtime error clusters across the
three projects in the checked one-hour window. Authenticated production session
actions were not exercised by this smoke check.

C07a [PR #527](https://github.com/FSS-Ltd/pathway/pull/527) merged as
`8a09d5e48791704a806fcc75bad4c2919c188026`. It adds an explicitly
published seven-day group session timetable for linked parents and students,
with manager publication controls and audited changes. This remains partial
ACE timetable parity: individual subject grids and term publication are later
work. All eight checks passed on head `107aaa6794e763f1cc4f22f3684fb3b7fa2e66a7`
in CI [37890763969](https://github.com/FSS-Ltd/pathway/actions/runs/37890763969)
and CodeQL [37890759635](https://github.com/FSS-Ltd/pathway/actions/runs/37890759635).
The integration job passed 73 suites and 465 tests, including the linked-family
HTTP journey. Local lint, typecheck, unit tests, builds, Prisma schema validation,
and schema-to-migration diff passed; local database E2E was unavailable because
test Postgres at `localhost:5433` was down.

Production run [37891476188](https://github.com/FSS-Ltd/pathway/actions/runs/37891476188)
passed Prisma migration, API, and admin deployment. The first web build failed
in Next.js font loading; retrying that web job on the same merge commit passed,
and attempt 2 ended with all four jobs green. Vercel reported READY production
aliases on this merge commit: API `dpl_crZVqdBmXp83cA2ap3q6zd7XqgPE`, admin
`dpl_4boNnoBcKVahA7WGVoThf1ChgWvx`, and web
`dpl_FCxQgJteiwx6xRTT9Bm2f7p6dyf9`. Live `/health` returned 200 with a
database timestamp, public blog and configurator returned 200, unsigned parent
and student timetable APIs returned 401, and unsigned admin parent timetable
redirected to sign-in. No runtime error clusters appeared across the three
projects in the checked one-hour window. An authenticated production family
journey and a separate staging deployment were not exercised by this smoke
check.

C07b0 [PR #529](https://github.com/FSS-Ltd/pathway/pull/529) merged as
`7dcab12c4ea55bc9f83cee9430bff77ad1b2804b`. Its
[subject timetable design](22-student-subject-timetable-design.md) separates
term-based student grids from C07a group sessions. All eight checks passed on
`ad05a8ed7543c9a9ee682d1eeb4eab6dfb7b16d4` in CI
[37903222291](https://github.com/FSS-Ltd/pathway/actions/runs/37903222291)
and CodeQL
[37903215804](https://github.com/FSS-Ltd/pathway/actions/runs/37903215804).
Production run
[37904048953](https://github.com/FSS-Ltd/pathway/actions/runs/37904048953)
passed migration and all three app deployments. READY aliases serve that merge
commit: API `dpl_Eiae62iuYaaPSdSNvkncU2sgrwcA`, admin
`dpl_HBe62iWbRQUFyE5Bat725v62ThFg`, and web
`dpl_8j5SiqV71guSzayfmDUAHr8rDQoK`. Live health returned a database
timestamp; public blog and configurator returned 200; unsigned family
timetable APIs returned 401; and the unsigned admin timetable redirected to
sign-in. No runtime error clusters appeared across the three projects in the
checked hour.

C07b1 [PR #530](https://github.com/FSS-Ltd/pathway/pull/530) merged as
`27f58688316af070fbd4061e1870eb2aa095a997`. All eight checks passed on
`18a3b46618603ff17031ba1fe74110c88da4c341` in CI
[37907777783](https://github.com/FSS-Ltd/pathway/actions/runs/37907777783)
and CodeQL
[37907771188](https://github.com/FSS-Ltd/pathway/actions/runs/37907771188).
Production run
[37908913978](https://github.com/FSS-Ltd/pathway/actions/runs/37908913978)
passed the additive Prisma migration and all three app deployments. READY
aliases serve the merge commit: API `dpl_GbRuvNJT1L4RoKEcKte5VcabUu8a`, admin
`dpl_BfubwTusLsYARoVRpbfEKCDoXMi9`, and web
`dpl_7V4NV86pyeYjHJoSmcsn89ikNrXh`. Live health returned a database
timestamp; public blog and configurator returned 200; unsigned family
timetable APIs returned 401; the unsigned admin timetable redirected to
sign-in. No runtime errors appeared across the three projects in the checked
hour. C07b2 adds guarded Head schedule, draft, publication, and withdrawal
APIs from that merged master. No family or web route is part of this step.

C07b2 [PR #531](https://github.com/FSS-Ltd/pathway/pull/531) merged as
`8be337698ab570cefcb782de6ba71eb78e1a4324`. All eight checks passed on
`64e08b3126dce7dd2db00e6d332806be668296c3` in CI
[37913569202](https://github.com/FSS-Ltd/pathway/actions/runs/37913569202)
and CodeQL
[37913564920](https://github.com/FSS-Ltd/pathway/actions/runs/37913564920).
[Production run 37914554014](https://github.com/FSS-Ltd/pathway/actions/runs/37914554014)
passed the additive draft-version migration and all three app deployments.
READY aliases serve that commit: API `dpl_ENV8v5NMvnNA7bR4z7zXs5TXeh2p`,
admin `dpl_61igMXrCEkzsU92RjtSFaDUmmxjB`, and web
`dpl_3E177r3rWK2VE7VycrMprHq7vTS6`. API health returned 200 with a database
timestamp; public blog and `/configure` returned 200; an unsigned Head
schedule read returned 401; the unsigned admin route redirected to sign-in.
Vercel reported no runtime errors for the three apps in the checked hour.
Full authenticated publish-and-family production journeys remain unverified.
C07b3 adds the family snapshot reads and Head, parent, and student web journeys
from this merge.

C07b3 [PR #532](https://github.com/FSS-Ltd/pathway/pull/532) merged as
`0aa1be0140ed2323858cdd7099876be0fcca7def`. All eight PR checks passed
on head `3d9e2df58d743b8bf539bc9a210f571548da77a6` in CI
[37919937595](https://github.com/FSS-Ltd/pathway/actions/runs/37919937595)
and CodeQL
[37919935395](https://github.com/FSS-Ltd/pathway/actions/runs/37919935395).
[Production run 37920954979](https://github.com/FSS-Ltd/pathway/actions/runs/37920954979)
passed migration and all three app jobs. READY aliases serve that merge commit:
API `dpl_EDBezFcEKck9gomKxFFuo7WN8WJM`, admin
`dpl_8eZajNDmM6baA98u9B9KqgjbzpBB`, and web
`dpl_A46FyyhN74rDWQe5NLyyPjYubtTZ`. Live API health returned 200 with a
database timestamp; public blog and configurator returned 200; unsigned Head
and family subject-timetable reads returned 401, and the unsigned admin route
redirected to sign-in. A signed-in production Head at Demo ACE School loaded
the new subject-timetable screen and showed the expected academic-setup empty
state. No runtime errors appeared across the three projects in the checked
window. A publish-and-family read journey still needs configured academic data
and a linked guardian or student identity.

C07c [PR #533](https://github.com/FSS-Ltd/pathway/pull/533) merged as
`72f72da6fde0d49ae2fcf1baecae38a1a348598b`. All eight PR checks passed
on `70c8171b4a2de212e55de645b9d31b9f1d0cc9b7` in CI
[37924201387](https://github.com/FSS-Ltd/pathway/actions/runs/37924201387)
and CodeQL
[37924195883](https://github.com/FSS-Ltd/pathway/actions/runs/37924195883).
[Production run 37925146907](https://github.com/FSS-Ltd/pathway/actions/runs/37925146907)
passed migrations and API, admin, and web jobs. Vercel READY production aliases
serve API `dpl_D9XmPEbxKg5LiYcoC9jVZoVVqFB4`, admin
`dpl_5SGXj4cMynP5U1YfqpHHVXKUFxJs`, and web
`dpl_3v96jtHcWcQVn1AZDahrcaAejksD` at that merge. Live API health,
environment health, and public blog, plus marketing and configurator, returned
HTTP 200; unsigned My Schedule redirected to sign-in. A signed-in Head loaded
My Schedule at Demo ACE School with the expected empty assignments and swaps
for that week. No live swap transaction was possible without an assignment.
The runtime error feed showed no new API or web errors; its admin Clerk group
last occurred on an older deployment on 8 October.

C07d [PR #534](https://github.com/FSS-Ltd/pathway/pull/534) merged as
`8565a5a1367caaaca18987c3f4e8274acec396e7`. All eight checks passed on
`ec1fe5d68021c9dae2dcf1802461a25891067fa0` in CI
[37929864732](https://github.com/FSS-Ltd/pathway/actions/runs/37929864732)
and CodeQL
[37929859313](https://github.com/FSS-Ltd/pathway/actions/runs/37929859313).
The CI integration run passed 76 suites and 476 tests. [Production run
37931016306](https://github.com/FSS-Ltd/pathway/actions/runs/37931016306)
passed migrations and all three apps. Vercel READY aliases serve API
`dpl_J7B7VxEpNvU6gdz7G7UEyCZEjuWk`, admin
`dpl_5t3rHQ5VdVdqJfpJeevB6r6xAF4x`, and web
`dpl_F8awati1sZexeh7vKdd3pYNAW51z`. Live health, public blog, marketing,
and configurator reads passed; anonymous rota API and admin page denied as
expected. The signed-in production team rota still needs a user-session check.
The runtime error feed showed no new errors on these deployments.

C07e [PR #535](https://github.com/FSS-Ltd/pathway/pull/535) merged as
`c7857c5f76d7e37d6d91ff90011416bc3783114e`. All eight checks passed on
`6ea22d6a70dd9eee255f7ec7a614cb519b832c1b` in CI
[37934403942](https://github.com/FSS-Ltd/pathway/actions/runs/37934403942)
and CodeQL
[37934398437](https://github.com/FSS-Ltd/pathway/actions/runs/37934398437).
[Production run 37937727626](https://github.com/FSS-Ltd/pathway/actions/runs/37937727626)
applied `20261009134000_staff_unavailable_windows` and passed API, admin,
and web deployment. Vercel READY production aliases serve API
`dpl_4psoeNyVcGiBHiCmFUzk8SGtdPoZ`, admin
`dpl_H62e1iUb6SfWsbxp6YNnHWektH2D`, and web
`dpl_yHor3iYzpXhaFvFkLZvTv8vpCF8E`. Live health, public blog,
marketing, and configurator returned HTTP 200; anonymous staff endpoints
returned 401 and admin My Schedule redirected to sign-in. No new runtime
errors appeared in the checked window. A signed-in availability save remains
unverified pending an approved staff session.

C07f [PR #536](https://github.com/FSS-Ltd/pathway/pull/536) merged as
`5c26afca3caca259cc592b20f3b4ebe51ee873fa` at checked revision
`2722e59907fb59dd87f0e4f90d8c5e841913c1e5`. Seven runnable checks
passed in [CI 37941119248](https://github.com/FSS-Ltd/pathway/actions/runs/37941119248)
and [CodeQL 37941112202](https://github.com/FSS-Ltd/pathway/actions/runs/37941112202).
GitHub Advanced Security's separate CodeQL comparison returned neutral because
the default Actions configuration on `master` was absent from its comparison;
this PR changed no workflow files, and both Actions and JavaScript/TypeScript
analysis jobs passed. [Production run 37942692871](https://github.com/FSS-Ltd/pathway/actions/runs/37942692871)
applied `20261009150000_session_rota_kind` and passed migration, API, admin, and
web jobs. Vercel READY aliases serve API `dpl_FeNY996itxUyKZcEGh9hwobJxUJv`,
admin `dpl_J22EU1SPaXFQDHxarfZuHrDhKZG5`, and web
`dpl_7zKivvkcvDjHP5jp6asJGunP4R3Q`. Live health, public blog, marketing,
and configurator returned 200; anonymous session access returned 401 and admin
rota pages redirected to sign-in. No new runtime errors appeared; the admin
Clerk error group is from 8 October on an older deployment. A signed-in shift
create-and-view check remains unverified pending an approved staff session.

C07g0 [PR #537](https://github.com/FSS-Ltd/pathway/pull/537) merged as
`8dc592b4f4c7a61d4b071c9470ba07d260b43e4f` at checked revision
`1c98be5f3ceb3e0206491e531392299096bf45e8`. Seven runnable checks
passed in [CI 37944338801](https://github.com/FSS-Ltd/pathway/actions/runs/37944338801)
and [CodeQL 37944332896](https://github.com/FSS-Ltd/pathway/actions/runs/37944332896).
The separate CodeQL comparison was neutral because GitHub could not match
its default JavaScript/TypeScript setup; both actual analysis jobs passed and
the PR changed documentation only. Overall completion remains about 79%.
C07g1 [PR #538](https://github.com/FSS-Ltd/pathway/pull/538) merged as
`42c5ab087746318e486d2434cec983ddadc95d7d` at checked revision
`8b7a7427a06973dac519edf8e663f5227523b6cd`. Seven runnable checks
passed in [CI 37951821431](https://github.com/FSS-Ltd/pathway/actions/runs/37951821431)
and [CodeQL 37951816041](https://github.com/FSS-Ltd/pathway/actions/runs/37951816041).
The separate CodeQL comparison was neutral; both actual analysis jobs
passed. The dated parent school-support rota and staff view from the
[design contract](26-parent-school-volunteer-rota-design.md) are merged.
The migration must run before the API and admin app release. Signed-in
parent selection and staff view remain required production checks. C08a0
defines the next [behaviour stage and review contract](27-behaviour-review-parity-design.md).
C08a0 [PR #539](https://github.com/FSS-Ltd/pathway/pull/539) merged as
`5cc12dc68779cf69c23a78349f017332ce62099b` at checked revision
`2fd613106000a0ddd65aa93918abfc8c92556a0f`. Eight checks passed in
[CI 37953868699](https://github.com/FSS-Ltd/pathway/actions/runs/37953868699)
and [CodeQL 37953862088](https://github.com/FSS-Ltd/pathway/actions/runs/37953862088).
The design-only step did not change the overall completion estimate.
C08a1 [PR #540](https://github.com/FSS-Ltd/pathway/pull/540) merged as
`8b1827805d4abd9e18b756b37949c8259b54bff7`. Local typechecks, ESLint,
the pre-commit unit suites, Prisma schema validation, and the ACE governance
inventory passed. Final revision `f7d7353d89784f1fcf9decc08ae354acc56c5663`
passed all eight reported checks in
[CI 37987647525](https://github.com/FSS-Ltd/pathway/actions/runs/37987647525)
and [CodeQL 37987642564](https://github.com/FSS-Ltd/pathway/actions/runs/37987642564).
Branch fixes resolved the integration defects the first CI run exposed: the
reviewer lookup bound a `timestamptz` against the function's `timestamp`
signature, a new test created a system role outside the seed identity, the
cross-site review read needed the restricted RLS role, and the review-request
fixtures needed a Prisma `P2003` expectation plus teardown deletes. The additive
migration must run before the API; signed-in Head/Lead and guardian-denial
journeys remain production verification work.

## Delivery steps

| Step     | Scope                                                                  | State   | PR and base                                                                         | Checked revision and CI                                                                                                                                                                                                     | Merge evidence                             |
| -------- | ---------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1      | Require manual release and validate migration target                   | Merged  | [#346](https://github.com/FSS-Ltd/pathway/pull/346) to `master`                     | `07cd5eeb4432a7400297865166564acb9a8032ab`; all five jobs passed in [run 37317265932](https://github.com/FSS-Ltd/pathway/actions/runs/37317265932)                                                                          | `d27b9df77e4416dc2cd472abf59dc2a6568b7b2a` |
| 1.2a     | Scoped access-tag grant storage and RLS                                | Merged  | [#347](https://github.com/FSS-Ltd/pathway/pull/347) to `master`                     | `143a7bd507127556c5322184a1c2000108fc0346`; all five jobs passed in [run 37322499197](https://github.com/FSS-Ltd/pathway/actions/runs/37322499197)                                                                          | `f1674f41a39e80abb0b1cc4282056a808f83b425` |
| 1.2b     | Typed access-tag catalogue and access decision docs                    | Merged  | [#348](https://github.com/FSS-Ltd/pathway/pull/348) to `master`                     | `a975bc89e36a12f5a5e2e3526d222e310777b1bc`; all five jobs passed in [run 37369195079](https://github.com/FSS-Ltd/pathway/actions/runs/37369195079) (attempt 4)                                                              | `173420159825f2d029c685e4b2c19a7ba07e5970` |
| 1.2c     | Delegation, grant/revoke and effective-access APIs                     | Merged  | [#349](https://github.com/FSS-Ltd/pathway/pull/349) to `master`                     | `ff0d294709cece7f19974697ad57b0fd28f632de`; all five jobs passed in [run 37413254333](https://github.com/FSS-Ltd/pathway/actions/runs/37413254333)                                                                          | `784f261ec9e2463a9a7b519328cb7d8b27560f8f` |
| 1.2d1    | Retire customer role write routes and editor                           | Merged  | [#350](https://github.com/FSS-Ltd/pathway/pull/350) to `master`                     | `1de73eeb12a71882740f8d6dce1b8d8f7d731151`; all five jobs passed in [run 37415925535](https://github.com/FSS-Ltd/pathway/actions/runs/37415925535)                                                                          | `de2ce169476b5809c3f0b46b1567b619cac6b75d` |
| 1.2d2    | Fixed-role-only assignment cutover                                     | Merged  | [#351](https://github.com/FSS-Ltd/pathway/pull/351) to `master`                     | `a9493ed9c5d05fa86a6a96afcd077ba6004cad71`; all five jobs passed in [run 37418692392](https://github.com/FSS-Ltd/pathway/actions/runs/37418692392)                                                                          | `a1f8bbbe19bc056e4e28138657f1acdd2de7bfd5` |
| 1.2d3a   | Read-only custom-assignment inventory                                  | Merged  | [#352](https://github.com/FSS-Ltd/pathway/pull/352) to `master`                     | `9be47a8aed1bcbb808e392fb8db02df54737e6c2`; all five jobs passed in [run 37420486397](https://github.com/FSS-Ltd/pathway/actions/runs/37420486397)                                                                          | `053743614742c4acec9b2180604d294f3102d2e4` |
| 1.2d3b1  | Effective-access parity preview for proposed mappings                  | Merged  | [#353](https://github.com/FSS-Ltd/pathway/pull/353) to `master`                     | `5ddb58ea9cbf49c369590b5efa852f4b8ab20dd1`; all five jobs passed in [run 37424373226](https://github.com/FSS-Ltd/pathway/actions/runs/37424373226)                                                                          | `8eaaa1c0d29a80b391855a0836931487296ed248` |
| 1.2d3b2a | Fresh effective-access reads in a write transaction                    | Merged  | [#354](https://github.com/FSS-Ltd/pathway/pull/354) to `master`                     | `1fd7a972908141892215bbb937d00535e41f2c0e`; all five jobs passed in [run 37428121362](https://github.com/FSS-Ltd/pathway/actions/runs/37428121362)                                                                          | `62e3db49cd4372e3a5908e4674f7fb7fe2185fe2` |
| 1.2d3b2b | Audited assignment retirement                                          | Merged  | [#355](https://github.com/FSS-Ltd/pathway/pull/355) to `master`                     | `6ec5a07b779e4e091a4d41002bf404f63fa79e4d`; all five jobs passed in [run 37433372134](https://github.com/FSS-Ltd/pathway/actions/runs/37433372134)                                                                          | `a7227df78a5bcc068ce2374ce88d5ba620a4b518` |
| 1.3a     | Oasis-to-NexSteps web journey parity contract                          | Merged  | [#356](https://github.com/FSS-Ltd/pathway/pull/356) to `master`                     | `9fe3b714e5d9c131275a827db72ced62efe235a8`; all five jobs passed in [run 37435850091](https://github.com/FSS-Ltd/pathway/actions/runs/37435850091)                                                                          | `676cb7bc5f3a0e3eb895ddd3fcd145ba0ec6b2d5` |
| 1.3b1    | Physical PACE inventory data and permission foundation                 | Merged  | [#357](https://github.com/FSS-Ltd/pathway/pull/357) to `master`                     | `554302c0f97e18296c6c8d705b2aaa299f9b9b36`; all five jobs passed in [run 37444424579](https://github.com/FSS-Ltd/pathway/actions/runs/37444424579)                                                                          | `9aa51c88c7091974017169c0ac0a08f6dce50838` |
| 1.3b2a   | Guarded physical PACE inventory reads                                  | Merged  | [#358](https://github.com/FSS-Ltd/pathway/pull/358) to `master`                     | `8e97d0f7f9259278f01283663f29d37c4d8f3d6e`; all five jobs passed in [run 37448346012](https://github.com/FSS-Ltd/pathway/actions/runs/37448346012)                                                                          | `bb234fadaecc0194ae73086019beaaf96df701f9` |
| 1.3b2b1  | Guarded bulk physical PACE order commands                              | Merged  | [#359](https://github.com/FSS-Ltd/pathway/pull/359) to `master`                     | `cbb388c1e5f9c9383228d1e2c55fd79926cff377`; all five jobs passed in [run 37451346773](https://github.com/FSS-Ltd/pathway/actions/runs/37451346773)                                                                          | `03b62c9c152e5d755ef60e171b35441c7c7eee20` |
| 1.3b2b2  | Guarded physical PACE current-stock entry                              | Merged  | [#360](https://github.com/FSS-Ltd/pathway/pull/360) to `master`                     | `e7db9758f1c2a3f2ef6f1ae2d60a168324d4870e`; all five jobs passed in [run 37454020484](https://github.com/FSS-Ltd/pathway/actions/runs/37454020484)                                                                          | `3bba6edfee0d2bd4754841645da0cf17579bede1` |
| 1.3b2b3  | Forward-only physical PACE delivery transitions                        | Merged  | [#361](https://github.com/FSS-Ltd/pathway/pull/361) to `master`                     | `afdadffbfcae1b6e6bf6c32c6a5cc1dcbfb61e6e`; all five jobs passed in [run 37456709818](https://github.com/FSS-Ltd/pathway/actions/runs/37456709818)                                                                          | `c0fc043fcc7d90040849fad5c9a144cb4a850724` |
| 1.3b2c1  | Read-only physical PACE inventory web journey                          | Merged  | [#362](https://github.com/FSS-Ltd/pathway/pull/362) to `master`                     | `8d99ae4ca11661a5331905726cb6a01048ae6b9f`; all five jobs passed in [run 37487356359](https://github.com/FSS-Ltd/pathway/actions/runs/37487356359)                                                                          | `ae7b9aa17174b0831fbbe9ae3bfba23047a10a27` |
| 1.3b2c2  | Physical PACE order creation web control                               | Merged  | [#363](https://github.com/FSS-Ltd/pathway/pull/363) to `master`                     | `3214a41c930edb7bfae2e18deadaf003dfab5ddb`; all five jobs passed in [run 37492380380](https://github.com/FSS-Ltd/pathway/actions/runs/37492380380)                                                                          | `9b8e2d1b91f5adb34f3711ad3c2186008dfb8009` |
| 1.3b2c2r | Prior merge record and new-project cutover conditions                  | Merged  | [#364](https://github.com/FSS-Ltd/pathway/pull/364) to `master`                     | `117f2b2fe75a38a997ffbe0fa4152ee3ced5761d`; all five jobs passed in [run 37496153641](https://github.com/FSS-Ltd/pathway/actions/runs/37496153641)                                                                          | `6240e5baed782d95aa59fa6c4de16e4c87ebca61` |
| 1.3b2c3  | Physical PACE current-stock entry web control                          | Merged  | [#365](https://github.com/FSS-Ltd/pathway/pull/365) to `master`                     | `613b2ab0f63fe8f262684121c298758df4029a0b`; all five jobs passed in [run 37499827535](https://github.com/FSS-Ltd/pathway/actions/runs/37499827535)                                                                          | `6bb854387a010d8e65230a8342fbcedd6fdebceb` |
| 1.3b2c4  | Physical PACE delivery transition web control                          | Merged  | [#366](https://github.com/FSS-Ltd/pathway/pull/366) to `master`                     | `24ac60112e1527dbb1d23b28bf44c4e69fa9dec5`; all five jobs passed in [run 37502864680](https://github.com/FSS-Ltd/pathway/actions/runs/37502864680)                                                                          | `99044b3cde7f25e1c22313117768da48dc15b8af` |
| 1.3c0    | Diagnostic-results reference and design                                | Merged  | [#367](https://github.com/FSS-Ltd/pathway/pull/367) to `master`                     | `3a957697b7b315ba94d317c46ac6fcd74f14db61`; all five jobs passed in [run 37506409613](https://github.com/FSS-Ltd/pathway/actions/runs/37506409613)                                                                          | `9390d7e23375ed3c5ceb2efe3b5c7d8c94e5d1dc` |
| 1.3c1    | Diagnostic permission registry and fixed-role mappings                 | Merged  | [#368](https://github.com/FSS-Ltd/pathway/pull/368) to `master`                     | `838d6b08aec5297d0689a170343704b5a395718f`; all five jobs passed in [run 37509331904](https://github.com/FSS-Ltd/pathway/actions/runs/37509331904)                                                                          | `e8661fa9cf9e86c1fcb6ad97ecbc919af6a7a3a4` |
| 1.3c2    | Diagnostic facts and tenant RLS                                        | Merged  | [#369](https://github.com/FSS-Ltd/pathway/pull/369) to `master`                     | `4a74e073ef7835248cffdcd5b9e5480a4b2fa523`; all five jobs passed in [run 37513470766](https://github.com/FSS-Ltd/pathway/actions/runs/37513470766)                                                                          | `c88b553840cbe165558144a2bb8f07bdcfda6a68` |
| DB-1     | New-project migration inventory and blocker                            | Merged  | [#370](https://github.com/FSS-Ltd/pathway/pull/370) to `master`                     | `b311080af365db1bf6bf35cedb4b81c6e69d1ae2`; all five jobs passed in [run 37516949020](https://github.com/FSS-Ltd/pathway/actions/runs/37516949020)                                                                          | `56b91b29f515e713fc931e27efa3b398850c8fe0` |
| 1.3c3    | Bounded diagnostic history API                                         | Merged  | [#371](https://github.com/FSS-Ltd/pathway/pull/371) to `master`                     | `a475914c06e26a9d25484a99c57e8246eb022e28`; all five jobs passed in [run 37520082279](https://github.com/FSS-Ltd/pathway/actions/runs/37520082279)                                                                          | `4aa865fa1dcc1d192e372ae7a8a537ab7526bd4e` |
| 1.3c4    | Audited diagnostic record and retraction API                           | Merged  | [#372](https://github.com/FSS-Ltd/pathway/pull/372) to `master`                     | `e4a8faa3a4d891be0cff9bc811824117db2763df`; all five jobs passed in [run 37523331326](https://github.com/FSS-Ltd/pathway/actions/runs/37523331326)                                                                          | `85a3743b90b6e297a9a661943a64ef87525edf53` |
| 1.3c5a   | Read-only diagnostic history web journey                               | Merged  | [#373](https://github.com/FSS-Ltd/pathway/pull/373) to `master`                     | `121c0b77ca26e1fd53f29b1a93b051ffaef42878`; all five jobs passed in [run 37527866517](https://github.com/FSS-Ltd/pathway/actions/runs/37527866517)                                                                          | `55f1a7a55496c07ccacc765819a9b0cf2c1fc770` |
| 1.3c5b   | Diagnostic record and retraction web controls                          | Merged  | [#375](https://github.com/FSS-Ltd/pathway/pull/375) to `master`                     | `53822bb064603e033ccfe4ebf7bbf0517c530f40`; all eight checks passed (runs below)                                                                                                                                            | `eae1e4bb2649a952d603c52a6bff2d29317d4ed7` |
| 1.3d0    | Attendance correction history and site-scope contract                  | Merged  | [#376](https://github.com/FSS-Ltd/pathway/pull/376) to `master`                     | `ad074caa2ade8440bc327da02a866e7836de0c1c`; all eight checks passed (runs below)                                                                                                                                            | `b63718871fe4ac3f84758a7594056e2e7f39a012` |
| 1.3d1    | Attendance correction-event storage and RLS                            | Merged  | [#377](https://github.com/FSS-Ltd/pathway/pull/377) to `master`                     | `cd9122205a7ba1f34d8c2b68c9b58d3a5957e80d`; all eight checks passed (runs below)                                                                                                                                            | `a3895633db6553a01bab4d9f07ef62aa71c21561` |
| 1.3d2    | Atomic attendance correction writers                                   | Merged  | [#378](https://github.com/FSS-Ltd/pathway/pull/378) to `master`                     | `4581d5f3f78dfa717fd78c915d018e297a25733a`; all eight checks passed (runs below)                                                                                                                                            | `420c4d234b7cbb9cc33c4e4e374f1126a881bf61` |
| 1.3d3    | Bounded attendance correction history API                              | Merged  | [#379](https://github.com/FSS-Ltd/pathway/pull/379) to `master`                     | `6d7f2035be51c6d76f80a00e28f44651815cb013`; all eight checks passed (runs below)                                                                                                                                            | `19c045381d856e0b6b3372f3929b63addf8bf40b` |
| 1.3d4    | Staff attendance correction history web journey                        | Merged  | [#380](https://github.com/FSS-Ltd/pathway/pull/380) to `master`                     | `a65252e3c0211cfb6aa78f0d0d06bd9abda35e93`; all eight checks passed (runs below)                                                                                                                                            | `cf0f1d9ac20c25cd97305bae0f72c6ad5cacd0be` |
| 1.3d5    | Daily attendance register contract                                     | Merged  | [#381](https://github.com/FSS-Ltd/pathway/pull/381) to `master`                     | `8d98fb4a4a70a0d8c7ffd45ef02b7304acbec070`; all eight checks passed (runs below)                                                                                                                                            | `2319e7af3dcd83f6775fe906cb0c4208fbc4250d` |
| DB-2a    | New-project backup and Storage restore preflight                       | Merged  | [#382](https://github.com/FSS-Ltd/pathway/pull/382) to `master`                     | `1292f15d45c708d1bb260cea9a8ccdbdb8b1c504`; all eight checks passed (runs below)                                                                                                                                            | `4b04a946134c1b16e42cacb719814e1368c2660b` |
| DB-2b    | Candidate database and Storage restore                                 | Merged  | [#383](https://github.com/FSS-Ltd/pathway/pull/383) to `master`                     | `744001b253fab7131e492ad43723b283a2573e4a` checked head; all eight checks passed: [CI run 37579404044](https://github.com/FSS-Ltd/pathway/actions/runs/37579404044), CodeQL run 37579399674.                                | `f3301adedbe9521280463eda8e983b88fdaab3e5` |
| DB-2c1   | Portable ACE fact trigger checks                                       | Merged  | [#384](https://github.com/FSS-Ltd/pathway/pull/384) to `master`                     | `d617c093120206611f59bf709f84c447c06834c3`; all eight checks passed: CI run 37581566481, CodeQL run 37581562551. Target migration and rollback probe passed.                                                                | `e7a804fb14658ee8c309b3d02080d64cd6c8479f` |
| DB-2c2   | Portable student portal policy trigger                                 | Merged  | [#385](https://github.com/FSS-Ltd/pathway/pull/385) to `master`                     | `39d9eac5c83eff82e5d2031a7f0b51a67a3aa07c`; all eight checks passed: CI run 37583372509, CodeQL run 37583368972. Target migration and rollback probe passed.                                                                | `4c44f0ad92252cf876d702f1b980e311022e9f2b` |
| DB-2c3   | Portable ACE record actor membership trigger                           | Merged  | [#386](https://github.com/FSS-Ltd/pathway/pull/386) to `master`                     | `9dee34ed052cbb5a192cd851ef7e2f888c82023c`; all eight checks passed: CI run 37585173142, CodeQL run 37585167935. Target migration and rollback probe passed.                                                                | `2df25142ebe8c8f1df741d0c44946c8edc35210e` |
| DB-2c4   | Portable message conversation creator trigger                          | Merged  | [#387](https://github.com/FSS-Ltd/pathway/pull/387) to `master`                     | `e5d09084a439121d76332a4c7f46ae88172013f6`; all eight checks passed: CI run 37586852136, CodeQL run 37586847867. Target migration and rollback probe passed.                                                                | `d7eeb72b0a9f009a55e2d6dc8445a803d9f4a62f` |
| DB-2c5   | Portable message participant trigger                                   | Merged  | [#388](https://github.com/FSS-Ltd/pathway/pull/388) to `master`                     | `b819d9892c105ee1a642d26365fffea23bfe1538`; all eight checks passed: CI run 37589121109, CodeQL run 37589117201. Target migration and rollback probe passed.                                                                | `e714aefcd10059c315f54bd0857800c577cdbcee` |
| DB-2c6   | Portable notice audience eligibility                                   | Merged  | [#389](https://github.com/FSS-Ltd/pathway/pull/389) to `master`                     | `0eb7a2039c97f5ffcfe0e6d953c33f2f3362abfa`; all eight checks passed: CI run 37591629004, CodeQL run 37591622867. Target migration and rollback probe passed.                                                                | `102c0361310bb44d246c93fe9e537f53749bbbfd` |
| DB-2d1   | Audit required RLS across restored split schemas                       | Merged  | [#390](https://github.com/FSS-Ltd/pathway/pull/390) to `master`                     | `0a73a9db8fcea9a4ea398fbbfe60b7875716c4e3`; all eight checks passed: CI run 37594263803, CodeQL run 37594259791. Target read-only gate reports 63 required tables with grants.                                              | `1eb3e75c5c2b561cf3df3d21e80457b68a77f378` |
| DB-2d2   | Revoke restored Data API table grants                                  | Merged  | [#391](https://github.com/FSS-Ltd/pathway/pull/391) to `master`                     | `b8c91a200c8857ce9a51a3d35e04fc8e004ac198`; all eight checks passed: CI run 37596845150, CodeQL run 37596839569. Target migration applied; direct and default table grants are zero, with row counts unchanged.             | `26041370c9048861fd577c7c5185141e0ad58b5f` |
| DB-2d3   | Accept public-qualified reviewed role policy text                      | Merged  | [#392](https://github.com/FSS-Ltd/pathway/pull/392) to `master`                     | `ba717d409e129390c5ee3e2a9475fb79fc92f3e4`; all eight checks passed: CI run 37598968312, CodeQL run 37598963345. Strict target gate passes both schemas.                                                                    | `22a66d2e6eb7a8c5634fcc85d793ef6e3d29a173` |
| DB-2e1   | Audit restored migration-history exceptions                            | Merged  | [#393](https://github.com/FSS-Ltd/pathway/pull/393) to `master`                     | `a58a5a47ac035b94e43db0614d719a2e63cafa7c`; all eight checks passed: CI run 37601481964, CodeQL run 37601476750.                                                                                                            | `1c299442a19e99a023366d315be0ee467d6a74ce` |
| DB-2e2   | Restrict restored RLS event-trigger API execution                      | Merged  | [#394](https://github.com/FSS-Ltd/pathway/pull/394) to `master`                     | `ffce7e00987fd7870a3b5456357c0b5b3e44d63e`; all eight checks passed: CI run 37604158878, CodeQL run 37604165904. Target migration applied and verified.                                                                     | `6dd39e8f8f9d0ae6ac50a0fe77101e7c6b70e44b` |
| DB-2f    | Verify restored database and Storage checkpoint                        | Merged  | [#400](https://github.com/FSS-Ltd/pathway/pull/400) to `master`                     | `76641f23be9596d18335305b96365cfda0e1685a`; all eight checks passed: CI run 37619741884, CodeQL run 37619737170.                                                                                                            | `3bc72df48bd4be7a7e8dda547522e5e8a48bebc2` |
| 1.3e0    | ACE messaging API and web contract                                     | Merged  | [#395](https://github.com/FSS-Ltd/pathway/pull/395) to `master`                     | `7d348e56a0311003c68d76861b050196c8fb6d73`; all eight checks passed: CI run 37607152849, CodeQL run 37607148259.                                                                                                            | `523c9bebf28290830836e0607cb0083510fb01d7` |
| 1.3e1a   | Scoped staff conversation list API                                     | Merged  | [#396](https://github.com/FSS-Ltd/pathway/pull/396) to `master`                     | `638ff09b7431905f99761040d5b245a066d9d159`; all eight checks passed: CI run 37611227224, CodeQL run 37611226280.                                                                                                            | `b5bfdebb545b7676dd9871883780c59cdd8f1b85` |
| 1.3e1b   | Scoped staff message history API                                       | Merged  | [#397](https://github.com/FSS-Ltd/pathway/pull/397) to `master`                     | `c8bd8ae5cb4da0ad9b908f7356d33d4e82656dd5`; all eight checks passed: CI run 37613024233, CodeQL run 37613023426.                                                                                                            | `6e30ba5c7f84a4bd7e325f048e808f6ef5017244` |
| 1.3e1c   | Scoped staff read-cursor API                                           | Merged  | [#398](https://github.com/FSS-Ltd/pathway/pull/398) to `master`                     | `af62295036f3a12c5140da3e41ddd1d89da5758c`; all eight checks passed: CI run 37615071206, CodeQL run 37615067768.                                                                                                            | `cd673cb18b3beff7de00b3903c6b31567546ef11` |
| 1.3e2a   | Idempotent staff direct conversation creation                          | Merged  | [#399](https://github.com/FSS-Ltd/pathway/pull/399) to `master`                     | `b2b640f5048cb9beec1157bb9f7e0750e5c07f07`; all eight checks passed: CI run 37617805922, CodeQL run 37617802053.                                                                                                            | `d480172e7b1573544ceb39ff9550a28d53848211` |
| 1.3e2b   | Scoped staff message send API                                          | Merged  | [#401](https://github.com/FSS-Ltd/pathway/pull/401) to `master`                     | `77fe27f3a5a166d239318d91444a81dcfb41fb5c`; all eight checks passed: CI run 37623067709, CodeQL run 37623060227.                                                                                                            | `f5e2f7e25a371d022db8bd67c619c087e60ff4cd` |
| 1.3e2c   | Scoped site staffroom open and reconciliation                          | Merged  | [#463](https://github.com/FSS-Ltd/pathway/pull/463) to `master`                     | `6d0619e712905078775beec602353f04e2051685`; all eight checks passed: CI run 37753028861, CodeQL run 37753023843.                                                                                                            | `fa1c28afbd25ce0d1bf733103cfe31e4f01e3a60` |
| 1.3e2d   | Permission-aware site staffroom web control                            | Merged  | [#467](https://github.com/FSS-Ltd/pathway/pull/467) to `master`                     | `9971601a584a787bebfd89fd41bc0d87eff85321`; all eight checks passed: CI run 37760588499, CodeQL run 37760585038.                                                                                                            | `e3d4f32fb1a393e43b7b3e010db0d874c8b7c72e` |
| 1.3e4a   | Linked-parent school-team conversation list API                        | Merged  | [#470](https://github.com/FSS-Ltd/pathway/pull/470) to `master`                     | `e2843e435f055c10df144a0986ad30da382a2694`; all eight checks passed: CI run 37766725458, CodeQL run 37766721567.                                                                                                            | `5c5a47409ae10fae458fd7daa49982f7bc1af317` |
| 1.3e4b   | Linked-parent school-team message history API                          | Merged  | [#474](https://github.com/FSS-Ltd/pathway/pull/474) to `master`                     | `7cc891144125f2a6eabd770c671d3f99087f3ff1`; all eight checks passed: CI run 37769991851, CodeQL run 37769988310.                                                                                                            | `7fcb36c7800cf73214ef787e54ecca007c9dafb8` |
| 1.3e4c   | Linked-parent school-team read-cursor API                              | Merged  | [#476](https://github.com/FSS-Ltd/pathway/pull/476) to `master`                     | `cbe28d24d9457b829df6412d403bcf064508d301`; all eight checks passed: CI run 37773684601, CodeQL run 37773682585.                                                                                                            | `0f17f8086480bb1c5b488ccebaf71df80a9b7d25` |
| 1.3e4d   | Linked-parent school-team conversation open API                        | Merged  | [#478](https://github.com/FSS-Ltd/pathway/pull/478) to `master`                     | `f54b994d94f811c2f8bfb96cb822c9065b4ce21c`; all eight checks passed: CI run 37777932359, CodeQL run 37777929612.                                                                                                            | `3f1ab2d6043fe59751e0c81e71820f2274b66e2e` |
| 1.3e4e   | Linked-parent school-team message send API                             | Merged  | [#480](https://github.com/FSS-Ltd/pathway/pull/480) to `master`                     | `554a073025f3ae4d5a17b6ee7220c7f571037e22`; all eight checks passed: CI run 37781236015, CodeQL run 37781233614.                                                                                                            | `b21c2baf1c5dfaba288843cce333960470d81779` |
| 1.3e4f   | Linked-parent school-team messaging web journey                        | Merged  | [#482](https://github.com/FSS-Ltd/pathway/pull/482) to `master`                     | `90b22698b93186e99055dae6be59e78b5b53107b`; all eight checks passed: CI run 37787308119, CodeQL run 37787303829.                                                                                                            | `eb0dab891860a287144dbcd27bc6432658b3e0a7` |
| 1.3e4g   | Scoped staff school-team conversation inbox API                        | Merged  | [#484](https://github.com/FSS-Ltd/pathway/pull/484) to `master`                     | `096b9ad0b5b1a1471f0b18be5f9a2e30dff4f8cb`; all eight checks passed: CI run 37792543851, CodeQL run 37792542324.                                                                                                            | `b90d2594b0cbde4331bf987eb386802b34a800ff` |
| 1.3e4h   | Scoped staff school-team message history API                           | Merged  | [#486](https://github.com/FSS-Ltd/pathway/pull/486) to `master`                     | `4dcb094ce32b0d561c351e053e013788338477c5`; all eight checks passed: CI run 37796800922, CodeQL run 37796796579.                                                                                                            | `535c088bbd53539feea19648d7dadef738be61dc` |
| 1.3e4i   | Scoped staff school-team read-cursor API                               | Merged  | [#488](https://github.com/FSS-Ltd/pathway/pull/488) to `master`                     | `d1dddb81d611af5ad1cd8997cf0b06cbc6a8c18b`; all eight checks passed: CI run 37801462309, CodeQL run 37801460439.                                                                                                            | `76f64f3bbffeec60c1be1568f50996a389790e15` |
| 1.3e4j   | Scoped staff school-team reply API                                     | Merged  | [#490](https://github.com/FSS-Ltd/pathway/pull/490) to `master`                     | `89a37dbdf65a2caa4a267b6e0d2567b4a4a3db91`; all eight checks passed: CI run 37805483170, CodeQL run 37805478643.                                                                                                            | `0a9f3f371badda8d895fb16f3c3aa17884208c16` |
| 1.3e4k   | Staff school-team messaging web view                                   | Merged  | [#492](https://github.com/FSS-Ltd/pathway/pull/492) to `master`                     | `9474ba71d21c88e7ecc62a93f32096db971c6bcc`; all eight checks passed: CI run 37809894950, CodeQL run 37809889978.                                                                                                            | `f85fa11a4fb8904d9bf64c8db2137fb2e4a38ef0` |
| 1.3e5a   | ACE site-notice audience and receipt contract                          | Merged  | [#494](https://github.com/FSS-Ltd/pathway/pull/494) to `master`                     | `7b67a3555c218f325d6e74ae051f435738803d14`; all eight checks passed: CI run 37813681749, CodeQL run 37813678605.                                                                                                            | `b65c4e64f32d1ccab608fe8be9fcf31ae5642a66` |
| 1.3e5a1  | Parent notice permission boundary correction                           | Merged  | [#499](https://github.com/FSS-Ltd/pathway/pull/499) to `master`                     | `9ee2322c1efd86a0ad974d060acad25224af7386`; all eight checks passed: CI run 37819210083, CodeQL run 37819205960.                                                                                                            | `29a1780d4663840a6e19bce7aebfe1277e61e30e` |
| 1.3e5b   | ACE parent notice relationship permission                              | Merged  | [#500](https://github.com/FSS-Ltd/pathway/pull/500) to `master`                     | `c5858bf00bba252d508b01f37526755d3ae46f31`; all eight checks passed: CI run 37821295904, CodeQL run 37821292163.                                                                                                            | `e4f5e46ea274150b364cb2d99f370d21bbdda071` |
| 1.3e5c1  | Full guardian eligibility for ACE notice audiences                     | Merged  | [#502](https://github.com/FSS-Ltd/pathway/pull/502) to `master`                     | `7d11c7a253984777f32a9aad738f30d7dfd6c5da`; all eight checks passed: CI run 37828070800, CodeQL run 37828063709.                                                                                                            | `1bf510c6fc01e3ddbfdcb4c90ce3963b26ca9e38` |
| 1.3e5c2  | ACE notice expiry, withdrawal, immutable publication and read receipts | Merged  | [#503](https://github.com/FSS-Ltd/pathway/pull/503) to `master`                     | `3a3b2c7a6b2d6b2b0ddeec3bf69488635231da78`; all eight checks passed: CI run 37833550859, CodeQL run 37833546948.                                                                                                            | `70cc53502f37da07a0e449e5604ce51ee862c015` |
| 1.3e5d   | ACE site notice draft API                                              | Merged  | [#546](https://github.com/FSS-Ltd/pathway/pull/546) to `master`                     | `ff32874ce639ce125b43b7b59a741ae4e5fad07a`; all eight checks passed: CI run 38065354098, CodeQL run 38065351413. The integration log confirms the draft API test ran.                                                       | `5a09d22f02e9a2ea28a4c227e1dd994f56ae81b0` |
| 1.3e5d1  | ACE notice author lifecycle guard                                      | Merged  | [#548](https://github.com/FSS-Ltd/pathway/pull/548) to `master`                     | `40bdce5a7c1b7c0fecfd135b1c26590839acee69`; all eight checks passed: CI run 38067159085, CodeQL run 38067158033. The app and public schema notice author probes passed.                                                     | `24f6bcf4eda7227acc5c8e19fdd2684dde98a381` |
| 1.3e5e   | ACE-M13 site notice publish and withdraw API                           | Merged  | [#550](https://github.com/FSS-Ltd/pathway/pull/550) to `master`                     | `6cb0918dd6820650bd45eee48befff6f412a6f0b`; all eight checks passed: CI run 38069238757, CodeQL run 38069238052. The notice E2E suite ran against PostgreSQL.                                                               | `0272b862a1339a979598f5a76d27a4d04af70b98` |
| 1.3e5f   | Shared site notice records, staff inbox, and existing notices UI       | Merged  | [#552](https://github.com/FSS-Ltd/pathway/pull/552) to `master`                     | `ed078be19a48520bf30ca3a60e7ac3db5e9b428a`; all eight checks passed: CI run 38076773221, CodeQL run 38076769974. PostgreSQL integration and database jobs passed.                                                           | `9b8835ba8eb750a53837fcc43253879b87a2d86f` |
| 1.3e5g   | Parent notice API and family inbox                                     | Merged  | [#553](https://github.com/FSS-Ltd/pathway/pull/553) to `master`                     | `acfb6724f22a51f576966400db7e3fad273f1c5c`; all eight checks passed: CI run 38077903948, CodeQL run 38077901813.                                                                                                            | `03865b1ac4856210657fe769156d419382edb721` |
| 1.3e5h   | Shared notice acknowledgement and receipt summary API/web              | Merged  | [#554](https://github.com/FSS-Ltd/pathway/pull/554) to `master`                     | `07ebb4774e8d043eebc6bd7274addc88b1b10a42`; all eight checks passed: CI run 38080016504, CodeQL run 38080013505.                                                                                                            | `95cc8ea4ff5a2d960bda8db49a78f7ccb26be76e` |
| 1.3e5i   | Shared site notice scheduling and minute cron                          | Merged  | [#555](https://github.com/FSS-Ltd/pathway/pull/555) to `master`                     | `70fd7ccbcf422e6e0af269018178374fdba5d5c2`; all eight checks passed: CI run 38081211207, CodeQL run 38081208228.                                                                                                            | `cb2c20d0b66490dd24a6a97da71eed0cdb7b2f0e` |
| 1.3e5j   | ACE school notice targeting across shared API and staff editor         | Merged  | [#556](https://github.com/FSS-Ltd/pathway/pull/556) to `master`                     | `14b7d75fd7b1e931699817701841cf74cac4df1c`; all eight latest-head checks passed: CI run 38084145084, CodeQL run 38084142024.                                                                                                | `18850674b91ddfa9526083c7144ebc39caed77ba` |
| 1.3e5k   | Web notice recipient-change confirmation                               | Merged  | [#557](https://github.com/FSS-Ltd/pathway/pull/557) to `master`                     | `caee165a0c3264e3fe935b9837e2675ca737b0ab`; all eight latest-head checks passed: CI run 38087062057.                                                                                                                        | `0eec3e4e05169a8d97f6eff4ffb2b3d0c112b858` |
| 1.3e5l   | Web guardian invitation and reviewed acceptance                        | Merged  | [#558](https://github.com/FSS-Ltd/pathway/pull/558) to `master`                     | `1ab8c066550db863d1cdb0f08b082828d251a4a0`; all eight latest-head checks passed: CI run 38090625503, CodeQL run 38090623814. The guardian E2E and migration ran against PostgreSQL.                                         | `6c8cfce9b67df2a555c8ddaa3e876c1496156c5b` |
| 1.3e5m   | Server-driven family web sections and disabled-account read guard      | Merged  | [#560](https://github.com/FSS-Ltd/pathway/pull/560) to `master`                     | `3eb5490da9e8381119a0193f8affb311d03a77c5`; all eight latest-head checks passed: CI run 38093907732, CodeQL run 38093904618. Four family E2E suites ran against PostgreSQL (79 suites, 492 tests).                          | `f46405a4841f9ad615217d04fccbb412b50884e2` |
| REL-2    | Portable family discovery migration and layout replay test             | Merged  | [#504](https://github.com/FSS-Ltd/pathway/pull/504) to `master`                     | `3154ba8f79f5397561643a6be3ce891972eea952`; all eight checks passed: CI run 37836040820, CodeQL run 37836026220.                                                                                                            | `26d43e4b6d194be5370bbc34f709bea4b025a351` |
| REL-3    | Explicit API filter injection under production TSX loader              | Merged  | [#505](https://github.com/FSS-Ltd/pathway/pull/505) to `master`                     | `cdfce7d5617883be34e64d34c483e5e11642c021`; all eight checks passed: CI run 37839063716, CodeQL run 37839059599.                                                                                                            | `9e09089cf84c41649e62bfebc10907768aef6e98` |
| REL-4    | Explicit RLS interceptor injection under production TSX loader         | Merged  | [#506](https://github.com/FSS-Ltd/pathway/pull/506) to `master`                     | `fe10f8d44e50c033fa9c29b851ac17fccf82f4bb`; all eight checks passed: CI run 37841594092, CodeQL run 37841590061.                                                                                                            | `193a569892c38be565ac6755456f41bcf498ed76` |
| REL-10   | Audited guardian access revocation                                     | Merged  | [#514](https://github.com/FSS-Ltd/pathway/pull/514) to `master`                     | `f5f2304eac229b4b9ae321420781d2baca24ba53`; all eight checks passed: CI run 37861062264, CodeQL run 37861058291.                                                                                                            | `2120a185808af996e60868a8f6e085c5199e775c` |
| REL-11   | Repair production API injection across ACE and Home                    | Merged  | [#515](https://github.com/FSS-Ltd/pathway/pull/515) to `master`                     | `3ff450d1f4ac8f009bb280b689e231b8cbac29da`; all eight checks passed: CI 37865176399, CodeQL 37865172972. Deploy 37865725001 passed; messaging schema gap remains.                                                           | `532bfeb8d65df9d38a33d96ae01cb06f4a2adbff` |
| REL-12   | Bridge protected ACE message and notice tables to public Prisma        | Merged  | [#516](https://github.com/FSS-Ltd/pathway/pull/516) to `master`                     | `3c0a2350ebf3245cc705377d700019431ac91ad2`; all eight checks passed: CI 37867521249, CodeQL 37867518620. Deploy 37868259048 passed all four jobs; database migration and aliases verified.                                  | `68eec5eeda13eef0dd34ff771a2ec145ebe8db4b` |
| REL-13   | Show disabled parent messaging state without a failed data request     | Merged  | [#517](https://github.com/FSS-Ltd/pathway/pull/517) to `master`                     | `01a916a281fdafe56010c6d41cb5a3fca9478dff`; all eight checks passed: CI 37870030605, CodeQL 37870029534. Deploy 37870846650 passed all four jobs; aliases verified.                                                         | `4c805d636a3cc82c627ef3c3bd42d3c96ea0356d` |
| REL-14   | Parent and staff two-way database messaging journey                    | Merged  | [#518](https://github.com/FSS-Ltd/pathway/pull/518) to `master`                     | `aa44fc3152cb4b327824cb3eb104d663ffd378bf`; all eight checks passed: CI 37871889213, CodeQL 37871886845. Deploy 37872708126 passed all four jobs; aliases verified.                                                         | `ae1383b6195eb883bc5e99f08ed3cbc58dfd9741` |
| REL-15   | Bound messaging recipient loading and offer retry                      | Merged  | [#519](https://github.com/FSS-Ltd/pathway/pull/519) to `master`                     | `921ddfa8c3819b02f607015b92c2cd5febfea6b3`; all eight checks passed: CI 37875192316, CodeQL 37875187357. Deploy 37875939897 passed four jobs; aliases and anonymous smoke verified.                                         | `da27ee63f25a51558d3e68948e04816f416223da` |
| REL-16   | Bound signed-in API token waiting and allow retry                      | Merged  | [#520](https://github.com/FSS-Ltd/pathway/pull/520) to `master`                     | `b11ec3672862d2119ba445e863053fa8c0cb8a55`; all eight checks passed: CI 37877846658, CodeQL 37877841712. Deploy 37878631116 passed four jobs; aliases, anonymous smoke, and runtime errors checked.                         | `4a23ab2cd1d7a8c2feed45603bdbe390f548282e` |
| REL-17   | Align message text box and focus outline                               | Merged  | [#521](https://github.com/FSS-Ltd/pathway/pull/521) to `master`                     | `f6dbadb1c78e084ce00a043841b89e05cc18f5dc`; eight checks passed: CI 37879678167, CodeQL 37879675426. Deploy 37880134482 and live smoke passed.                                                                              | `a2dd1f2acf6fb9674c38a05b375054302a7da3b8` |
| SEC-1    | Scope rota assignments and swaps to authorised actors                  | Merged  | [#523](https://github.com/FSS-Ltd/pathway/pull/523) to `master`                     | `11352796f02469ec90b5eb35929ff6eac026a8b3`; all eight checks passed: CI 37883306819, CodeQL 37883303461. Deploy 37883971325 and anonymous smoke passed.                                                                     | `291abb9c2673b134eb163a42ba82ad01ca9d8ae8` |
| SEC-2    | Scope sessions and staff attendance to authorised actors               | Merged  | [#525](https://github.com/FSS-Ltd/pathway/pull/525) to `master`                     | `57cbdc4e3572b5e1fdfed214cd5a80bcd2d923ff`; all eight checks passed: CI 37886190003, CodeQL 37886186050. Deploy 37886741900 passed four jobs; aliases and anonymous smoke verified.                                         | `206f67ea1b29c916c4b7aa660a6f0a7d6c8d8891` |
| C07a     | Published family group session timetable                               | Merged  | [#527](https://github.com/FSS-Ltd/pathway/pull/527) to `master`                     | `107aaa6794e763f1cc4f22f3684fb3b7fa2e66a7`; all eight checks passed: CI 37890763969, CodeQL 37890759635. Deploy 37891476188 attempt 2 passed four jobs; aliases and anonymous smoke verified.                               | `8a09d5e48791704a806fcc75bad4c2919c188026` |
| C07b0    | Term-based student subject timetable design contract                   | Merged  | [#529](https://github.com/FSS-Ltd/pathway/pull/529) to `master`                     | `ad05a8ed7543c9a9ee682d1eeb4eab6dfb7b16d4`; all eight checks passed: CI 37903222291, CodeQL 37903215804. Deploy 37904048953 passed four jobs; aliases and anonymous smoke verified.                                         | `7dcab12c4ea55bc9f83cee9430bff77ad1b2804b` |
| C07b1    | Site-scoped subject timetable schema, constraints and RLS              | Merged  | [#530](https://github.com/FSS-Ltd/pathway/pull/530) to `master`                     | `18a3b46618603ff17031ba1fe74110c88da4c341`; all eight checks passed: CI 37907777783, CodeQL 37907771188. Deploy 37908913978 passed four jobs; aliases, anonymous smoke, and runtime errors checked.                         | `27f58688316af070fbd4061e1870eb2aa095a997` |
| C07b2    | Guarded Head subject timetable schedule, draft and publication APIs    | Merged  | [#531](https://github.com/FSS-Ltd/pathway/pull/531) to `master`                     | `64e08b3126dce7dd2db00e6d332806be668296c3`; all eight checks passed: CI 37913569202, CodeQL 37913564920. Deploy 37914554014 passed four jobs; aliases, anonymous smoke, and runtime errors checked.                         | `8be337698ab570cefcb782de6ba71eb78e1a4324` |
| C07b3    | Family subject timetable reads and Head/family web journeys            | Merged  | [#532](https://github.com/FSS-Ltd/pathway/pull/532) to `master`                     | `3d9e2df58d743b8bf539bc9a210f571548da77a6`; eight checks passed: CI 37919937595, CodeQL 37919935395. Deploy 37920954979 and live smoke passed.                                                                              | `0aa1be0140ed2323858cdd7099876be0fcca7def` |
| C07c     | Site-scoped swap candidates and staff rota workspace clarity           | Merged  | [#533](https://github.com/FSS-Ltd/pathway/pull/533) to `master`                     | `70c8171b4a2de212e55de645b9d31b9f1d0cc9b7`; eight checks passed: CI 37924201387, CodeQL 37924195883. Deploy 37925146907 and live smoke passed.                                                                              | `72f72da6fde0d49ae2fcf1baecae38a1a348598b` |
| C07d     | Site-scoped staff team rota and availability entry point               | Merged  | [#534](https://github.com/FSS-Ltd/pathway/pull/534) to `master`                     | `ec1fe5d68021c9dae2dcf1802461a25891067fa0`; eight checks passed: CI 37929864732, CodeQL 37929859313. Deploy 37931016306 passed and live anonymous smoke verified.                                                           | `8565a5a1367caaaca18987c3f4e8274acec396e7` |
| C07e     | Partial-day staff availability and shared profile editor               | Merged  | [#535](https://github.com/FSS-Ltd/pathway/pull/535) to `master`                     | `6ea22d6a70dd9eee255f7ec7a614cb519b832c1b`; eight checks passed: CI 37934403942, CodeQL 37934398437. Deploy 37937727626 passed migrations and all apps; live anonymous smoke verified.                                      | `c7857c5f76d7e37d6d91ff90011416bc3783114e` |
| C07f     | Typed cover and meeting staff shifts with private rota views           | Merged  | [#536](https://github.com/FSS-Ltd/pathway/pull/536) to `master`                     | `2722e59907fb59dd87f0e4f90d8c5e841913c1e5`; seven runnable checks passed, CodeQL comparison neutral/inapplicable to unchanged Actions files. Deploy 37942692871 applied migration and passed all apps; live smoke verified. | `5c26afca3caca259cc592b20f3b4ebe51ee873fa` |
| C07g0    | School volunteer rota design contract                                  | Merged  | [#537](https://github.com/FSS-Ltd/pathway/pull/537) to `master`                     | `1c98be5f3ceb3e0206491e531392299096bf45e8`; seven runnable checks passed in CI 37944338801 and CodeQL 37944332896; separate CodeQL comparison neutral/inapplicable to the docs-only change.                                 | `8dc592b4f4c7a61d4b071c9470ba07d260b43e4f` |
| C07g1    | Dated parent school-support reservations and staff rota                | Merged  | [#538](https://github.com/FSS-Ltd/pathway/pull/538) to `master`                     | `8b7a7427a06973dac519edf8e663f5227523b6cd`; seven runnable checks passed in CI 37951821431 and CodeQL 37951816041; separate CodeQL comparison neutral.                                                                      | `42c5ab087746318e486d2434cec983ddadc95d7d` |
| C08a0    | Behaviour stage and review parity contract                             | Merged  | [#539](https://github.com/FSS-Ltd/pathway/pull/539) to `master`                     | `2fd613106000a0ddd65aa93918abfc8c92556a0f`; eight checks passed in CI 37953868699 and CodeQL 37953862088.                                                                                                                   | `5cc12dc68779cf69c23a78349f017332ce62099b` |
| C08a1    | Site-scoped demerit status, override, and review request API           | Merged  | [#540](https://github.com/FSS-Ltd/pathway/pull/540) to `master`                     | `f7d7353d89784f1fcf9decc08ae354acc56c5663`; all eight reported checks passed: CI 37987647525 and CodeQL 37987642564.                                                                                                        | `8b1827805d4abd9e18b756b37949c8259b54bff7` |
| C08a1f   | Guardian notice routing and review request pagination follow-up        | Merged  | [#541](https://github.com/FSS-Ltd/pathway/pull/541) to `master`                     | `003007830eda2ac8b37abe1be4670dfb5cab1fc9`; all eight checks passed. Focused tests (32), API/test typechecks, lint, formatting, and API build passed.                                                                       | `d84c17621a6d0c8c078a73ed8c37adf7d1664422` |
| C08a2    | Staff web demerit stage, review requests, and current fact             | Merged  | [#542](https://github.com/FSS-Ltd/pathway/pull/542) to `master`                     | `8623ec8f2ec9e90bee7899208e8d210699be8195`; all eight checks passed. Admin unit tests, API/test typechecks, lint, formatting, and both builds passed.                                                                       | `60ca22dcbee8e375e2e323b5f1aeb5110ca69e6e` |
| C08a3    | Mobile demerit stage, review requests, and current fact                | Merged  | [#543](https://github.com/FSS-Ltd/pathway/pull/543) to `master`                     | `9da9c8f535e876a00c671ee8dbefc5a6a04f0d07`; all eight checks passed: CI 38061889907 and CodeQL 38061886739. Mobile suite (41), typecheck, lint, formatting, and iOS Expo export passed locally; simulator run unavailable.  | `1e4b2e50670d608d0c59b69cbe9a8d8500008d6a` |
| DB-2g    | Project-safe production environment preparation                        | Merged  | [#402](https://github.com/FSS-Ltd/pathway/pull/402) to `master`                     | `9dd57ad967110c7fa29255ae317a3ee667dad977`; all eight checks passed: CI run 37626233704, CodeQL run 37626227019.                                                                                                            | `35cb6cba8da6b42e74e94eda13b4f01bdcecb055` |
| 1.3e3a   | Staff messaging web journey                                            | Merged  | [#404](https://github.com/FSS-Ltd/pathway/pull/404) to `master`                     | `ec8b73b3c4142bc3af0bfaf3f7ff017bf0dbbd6f`; all eight checks passed: CI run 37632328840, CodeQL run 37632323368.                                                                                                            | `8e310163e472ca223d03fce1d5f27c8618b2ded5` |
| DB-2h    | Pin restored trigger-function search paths                             | Merged  | [#405](https://github.com/FSS-Ltd/pathway/pull/405) to `master`                     | `814bf9a8df64c1433ae11ee89fb11dba50ad85ac`; all eight checks passed: CI run 37638889700, CodeQL run 37638879624.                                                                                                            | `26efb8040bd3dcbc39388eb7bc786b3933d15dfd` |
| 1.3e3b1  | Scoped staff recipient discovery API                                   | Merged  | [#406](https://github.com/FSS-Ltd/pathway/pull/406) to `master`                     | `c35f07c90326683389c8a5a9b808516f17369331`; all eight checks passed: CI run 37643791257, CodeQL run 37643776507.                                                                                                            | `a41e09aac3fde40f646e0242b0b8e3f0191e0122` |
| DB-2i    | New-project production cutover                                         | Merged  | [#407](https://github.com/FSS-Ltd/pathway/pull/407) to `master`                     | `a45bfb654344cc04042a7b0aa0ecf08457c036de`; all eight checks passed: CI run 37647704662, CodeQL run 37647698814. Production deploy run 37645052412 passed.                                                                  | `9483ea3f84736e169f96638eb08f14d16ebd7718` |
| REL-1    | Authenticated admin post-deploy smoke                                  | Merged  | [#417](https://github.com/FSS-Ltd/pathway/pull/417) to `master`                     | `3f5c0567e569fb1fe2f7029ccaeb59a1134bd60d`; all eight checks passed: CI run 37679071517, CodeQL run 37679066730.                                                                                                            | `2b70c122f0ea0bd161952be732557b94887b1a31` |
| 1.3e3b2  | Scoped staff direct conversation web control                           | Merged  | [#408](https://github.com/FSS-Ltd/pathway/pull/408) to `master`                     | `cfc654754a680baeffb0b93e5151e321b970d320`; all eight checks passed: CI run 37652063721, CodeQL run 37652056053.                                                                                                            | `99f671de57e0031c80ea6b7d48907924643d7608` |
| 1.3e3c   | Scoped staff unread counts and list badges                             | Merged  | [#409](https://github.com/FSS-Ltd/pathway/pull/409) to `master`                     | `87214821eb625ee211945d5a26717c92d9e12266`; all eight checks passed: CI run 37656203634, CodeQL run 37656189481.                                                                                                            | `aac2f36551a793b56cf6fdbeb5a56eaa268b18ac` |
| 1.3e3d   | Scoped direct-message read feedback                                    | Merged  | [#411](https://github.com/FSS-Ltd/pathway/pull/411) to `master`                     | `223df300078c50882000fd6271c4fe7fec3a440f`; all eight checks passed: CI run 37661038756, CodeQL run 37661033054.                                                                                                            | `ac1d2feb66e24d1b5e5f4f27669d30a6e550b03e` |
| 1.3e3e   | Staff messaging conversation UI polish                                 | Merged  | [#461](https://github.com/FSS-Ltd/pathway/pull/461) to `master`                     | `33bb57ceaf91fd2eef75df289cafe43a9c42a7d2`; all eight checks passed: CI run 37747729854, CodeQL run 37747727162.                                                                                                            | `11e9d6c8f2a8633fedbd2f480fc9c079939648f5` |
| 1.3f1    | C02 subject placement progress baseline                                | Merged  | [#413](https://github.com/FSS-Ltd/pathway/pull/413) to `master`                     | `677860b0f7dc9e00dfdd38806a7a7a71137c7470`; all eight checks passed: CI run 37668386401, CodeQL run 37668381804.                                                                                                            | `3b5a86bc4887bca1b0f7e49b7e92c0318bb0de69` |
| 1.3f2    | C01 PACE policy web settings                                           | Merged  | [#415](https://github.com/FSS-Ltd/pathway/pull/415) to `master`                     | `6b4c85663b22c5faa8b9e825a2f056e84281a6f1`; all eight checks passed: CI run 37674606330, CodeQL run 37674600785.                                                                                                            | `47b11a8ec3461db3d0bfeb03475b8e8dbae6231a` |
| 1.3f3a   | ACE core site-scoped subject catalogue API                             | Merged  | [#419](https://github.com/FSS-Ltd/pathway/pull/419) to `master`                     | `8b0f384ec92a7b8191a0fd6293129fc13e384d6f`; all eight checks passed: CI run 37683959404, CodeQL run 37683952847.                                                                                                            | `84f2a8a76492dac78618b67234eaddfd5932c412` |
| 1.3f3b   | ACE core subject catalogue web setup                                   | Merged  | [#421](https://github.com/FSS-Ltd/pathway/pull/421) to `master`                     | `c254e6a7b3a8d3b712fd5ca956cc108879f76a32`; all eight checks passed: CI run 37688482462, CodeQL run 37688478701.                                                                                                            | `a8b597b4ba51edbfcba77f0222971ed9eb4cab24` |
| 1.3g1    | Daily register year-band and staff scope foundation                    | Merged  | [#423](https://github.com/FSS-Ltd/pathway/pull/423) to `master`                     | `876167f2790e870f93fc9f99e28e3bd791a49aa7`; all eight checks passed: CI run 37692936905, CodeQL run 37692931234.                                                                                                            | `ce4053301b3de63927a0f045c7ad0f3620c7083b` |
| 1.3g1a   | Portable year-band membership guard                                    | Merged  | [#425](https://github.com/FSS-Ltd/pathway/pull/425) to `master`                     | `be305b83748d3cbf27adabf19a4525d03213e4b7`; all eight checks passed: CI run 37696081534, CodeQL run 37696076657.                                                                                                            | `a748e14bd1cb4a20509bcce4d199ccd44de6ef20` |
| 1.3g2    | Dated school enrolment foundation                                      | Merged  | [#427](https://github.com/FSS-Ltd/pathway/pull/427) to `master`                     | `871b485a69e60baceae767a619304c93ddb9475d`; all eight checks passed: CI run 37699275536, CodeQL run 37699271978.                                                                                                            | `5cf9634481cdbb2da0b63b4fbe6ac788046878a8` |
| 1.3g3    | Explicit site teaching dates                                           | Merged  | [#429](https://github.com/FSS-Ltd/pathway/pull/429) to `master`                     | `a360d9ec66847780bd432e3a05914183cbd9c6c7`; all eight checks passed: CI run 37702284432, CodeQL run 37702280876.                                                                                                            | `52f8c51d9a892d6067722d0dba02f036eb564960` |
| 1.3g4    | Daily attendance fact and correction-event foundation                  | Merged  | [#431](https://github.com/FSS-Ltd/pathway/pull/431) to `master`                     | `76fdaace01d5e7471daa626c00ab5b475422cff1`; all eight checks passed: CI run 37706815302, CodeQL run 37706809864.                                                                                                            | `3095b3cdae419e4052b1e02a550c660a662fb864` |
| 1.3g5    | Scoped daily-register staff read API                                   | Merged  | [#433](https://github.com/FSS-Ltd/pathway/pull/433) to `master`                     | `06aad2c5ba687c5f9a66ecb48ac0f35eff9b628a`; all eight checks passed: CI run 37709708490, CodeQL run 37709703647.                                                                                                            | `e0d43785eb9b592d0f2db4bcdfd4dee97d780c75` |
| 1.3g6    | Atomic daily-register mark and correction write API                    | Merged  | [#435](https://github.com/FSS-Ltd/pathway/pull/435) to `master`                     | `27a814c792180cb15fbb7a67170528198c437563`; all eight checks passed: CI run 37712759665, CodeQL run 37712756595.                                                                                                            | `69641dae68c1db991a4193d3b34ff6f5f9555ea4` |
| 1.3g7    | Scoped daily correction-history read API                               | Merged  | [#437](https://github.com/FSS-Ltd/pathway/pull/437) to `master`                     | `923a352f80476722d2b20a84448cd9c46850fa5d`; all eight checks passed: CI run 37715465693, CodeQL run 37715461713.                                                                                                            | `be87f6344a694007315c8fcc2c7a2ddeae6ae866` |
| 1.3g8    | ACE staff daily-register web journey                                   | Merged  | [#439](https://github.com/FSS-Ltd/pathway/pull/439) to `master`                     | `3c3fd705446b388a198f297132285cb7082bf424`; all eight checks passed: CI run 37718515055, CodeQL run 37718511575.                                                                                                            | `fff8e69087ef313ab80c640c625af5763b2d83c4` |
| 1.3g9    | Student self-scoped daily mark history API                             | Merged  | [#441](https://github.com/FSS-Ltd/pathway/pull/441) to `master`                     | `46cfbf3c464c4ad51fb4658577cf202b08018397`; all eight checks passed: CI run 37722060232, CodeQL run 37722057745.                                                                                                            | `3000b27f2c0fdfd21c5649848c3afa0b8dbee696` |
| AR-1     | Reuse scoped request transactions and return retryable database errors | Merged  | [#458](https://github.com/FSS-Ltd/pathway/pull/458) to `master`                     | `ad02690185b22becd98d6e00777a6f2153424d31`; all eight checks passed, including the one-connection database proof                                                                                                            | `2bd804c9fbe340a689f27a0ca74ea9279fd7e6c6` |
| AR-2     | Share admin session, site, organisation and access state               | Merged  | [#464](https://github.com/FSS-Ltd/pathway/pull/464) to `master`                     | `a7392e9e6093b82412789875127e5e9dd95219e0`; all eight checks passed, including integration and RLS                                                                                                                          | `2c2a7c961e79e8fab34a8c650ec88e0f128b3cb1` |
| AR-3     | Preserve admin navigation and select one active link                   | Merged  | [#466](https://github.com/FSS-Ltd/pathway/pull/466) on `fix/admin-navigation-state` | `2650297aeba1201096fd49b77f20f160a9b567e2`; all eight checks passed; 20-click browser verification completed                                                                                                                | `3fdabf8d5f7a155a72bf2f56975320feff3f05ef` |
| AR-4     | Grant scoped superuser operational access                              | Merged  | [#469](https://github.com/FSS-Ltd/pathway/pull/469) to `master`                     | `e34171c325f288dfbd92aff09777ec9bbee1be97`; all eight checks passed, including integration/RLS; read-only account mapping verified                                                                                          | `15e088698831e0612ed4c1b807cfee8608da53cb` |
| AR-5     | Correct admin page states and cross-feature recovery                   | Merged  | [#471](https://github.com/FSS-Ltd/pathway/pull/471) to `master`                     | `acc862e535a0fcbe9b4e1c8b9dcc22aaf21b4fc1`; all eight checks passed: CI run 37766561625, CodeQL run 37766558388; admin build and page regressions passed locally                                                            | `04fafae64de1dc5f33c4580d98e0e1987923e9db` |
| AR-6     | Hide dashboard API response bodies and correct failure copy            | Merged  | [#495](https://github.com/FSS-Ltd/pathway/pull/495) to `master`                     | `3dbe33d13ace38b30ec6441a6a5ec30de661ec45`; all eight checks passed: CI run 37814687587, CodeQL run 37814683507; admin test, typecheck and build passed locally                                                             | `8e2b8af583510597d5f05a37fa277e94213dc69c` |
| 1.3b2+   | ACE core web journey slices                                            | Planned | Pending                                                                             | Pending                                                                                                                                                                                                                     | Pending                                    |
| 1.4      | Paid add-ons and entitlement billing                                   | Planned | Pending                                                                             | Pending                                                                                                                                                                                                                     | Pending                                    |
| 1.5      | Shared web UI and messaging finish                                     | Planned | Pending                                                                             | Pending                                                                                                                                                                                                                     | Pending                                    |

AR-1 addresses the production single-connection pool timeouts seen on access,
concerns, and notes requests. GitHub confirmed all six admin reliability steps
merged after their current revisions passed required CI. AR-6 was added after
the dashboard exposed raw 500 response text on a failed announcement request.
The 8 October production check confirmed that the API, admin and public web
still serve `a41e09aac3fde40f646e0242b0b8e3f0191e0122`, before AR-1–AR-6.
The observed Roles & Access request passed permission evaluation but then timed
out waiting for the API's single database connection. An unauthenticated GET
`/announcements` returned 401; the observed announcement reads were authorised
for a signed-in user, though the old admin shell rendered them while its own
role lookup failed. No production deployment or account mutation was included.
The next permissible action is to obtain release authorisation, deploy
compatible API/admin revisions, and repeat the reported user journey.

Step 1.3g4 is merged after the corrected integration assertions passed on the
final PR revision. The daily fact and correction-event schema has not been
applied to the production database; live migrations remain deferred as agreed.
Step 1.3g5 is merged after disposable-Postgres integration verified the
scoped staff roster and fixed-leader view. Step 1.3g6 is merged after CI
Postgres ran the daily write suite and all eight required checks passed. The
bounded correction-history read in step 1.3g7 is merged after CI Postgres ran
68 integration suites and 431 tests, including the daily history suite. Step
1.3g8 adds the staff register web journey after the admin interaction test and
all eight CI checks passed. Step 1.3g9 adds a student-only daily history read
after its identity-link, portal-policy, date-boundary and cross-site integration
checks passed on the corrected PR revision. Parent and student web, exports,
production migration and deployment remain deferred.

Step 1.3g10's linked-parent daily history API merged in
[PR #443](https://github.com/FSS-Ltd/pathway/pull/443) at
`12196b9c17a3c94bc4ff6474b8dd9d0ad71d4f36`. All eight checks passed on
head `e28d067c875e1accc98581a575f1725430c17066` (CI run 37724622686;
CodeQL run 37724617494). CI's disposable PostgreSQL ran the positive and
denied relationship, date, site, and revocation request tests. Local lint,
typecheck, API build, unit and formatting checks also passed. The local
database-backed test command skipped assertions because its disposable
PostgreSQL was unavailable. Parent and student web, exports, production
migration and deployment remain open.

Step 1.3g10a merged in [PR #445](https://github.com/FSS-Ltd/pathway/pull/445)
at `9bf2686a413adff52f956140b1d6cc5e877e38f7`. All eight checks passed
on head `812551e557772a7b75632983c2459aa9d1f6a4df` (CI run 37726513139;
CodeQL run 37726510348). CI's disposable PostgreSQL ran the disabled and
re-enabled parent portal request test. The linked-child attendance read now
rechecks this organisation release control on every request. Production
deployment remains deferred.

Step 1.3g11 merged in [PR #447](https://github.com/FSS-Ltd/pathway/pull/447)
at `ce1de8ef802285ffb6e90551e7b91d2b0beed679`. All eight checks passed
on head `010288fabe1635fe763fcef0b899f59df25e00ae` (CI run 37728884368;
CodeQL run 37728881655). Local admin build, unit tests, 16-package lint and
typecheck, formatting and Graphify passed. It adds dedicated student and
full-guardian daily attendance pages behind their existing API boundaries,
with a family shell that does not mount staff navigation, role lookup or
organisation UI requests. The parent page requires an explicit site and child
link; the student page requires an explicit site link. Self-service site and
child discovery remains open. Production deployment remains deferred.

Step 1.3g12 merged in [PR #449](https://github.com/FSS-Ltd/pathway/pull/449)
at `ed1a0d14cb3f71e2646f5f0c682a9e860d538061`. All eight checks passed
on head `fc1a0b194ea0bb70d248fa9d6215e7a317900310` (CI run
37731266442; CodeQL run 37731264798). CI's disposable PostgreSQL ran the
family-context discovery suite within 71 integration suites and 443 tests.
The self-scoped discovery API and narrow identity read policy are merged but
not in production. A family landing page remains the next web step.

Step 1.3g13 merged in [PR #451](https://github.com/FSS-Ltd/pathway/pull/451)
at `7619de8b3551e4ae804c8077539a99b1ab2debb4`. All eight checks passed
on head `9a430bb7ed9f99ef4fa1d117c31a2f49f784ba95` (CI run
37733318199; CodeQL run 37733314937). Local admin build and the full admin
test script passed, including the family landing interaction test. The
family-only entry point links authorised contexts to guarded daily attendance
pages. It is not in production; broader family journeys remain open.

Step 1.3g14a merged in [PR #453](https://github.com/FSS-Ltd/pathway/pull/453)
at `01788eb01c53a934f7a2903e8e1389b495db62f1`. All eight checks passed
on head `98ebc5a5b1bb5f164a61791a61bfdfb62833bf66` (CI run
37736090466; CodeQL run 37736088162). Local 16-package lint and typecheck,
platform, auth, DB and API unit tests, API build, formatting of changed source,
and Graphify passed. The ACE-only daily export permission and approved
`attendance-exporter` tag are merged but not deployed. Step 1.3g14b may add
the bounded, audited export route after this evidence record merges. The
controlled permission and role seed remains a release task.

Step 1.3g14b merged in [PR #455](https://github.com/FSS-Ltd/pathway/pull/455)
at `96166d670705a8751dd9d2fb8008f78850525403`. All eight checks passed
on head `b1275b92d016b3ad6093d1a8b49dc95ac5ed095a` (CI run
37740570066; CodeQL run 37740565296). CI's disposable PostgreSQL passed 72
integration suites and 445 tests, including the scoped daily export journey.
Local 16-package lint and typecheck, 1,073 API unit tests, API build, changed
file formatting, diff check, and Graphify passed. The bounded, audited ACE
daily CSV route is merged but not deployed. Controlled permission seeding and
the phased production release remain open; no schema migration was added.

Step 1.3g14c merged in [PR #457](https://github.com/FSS-Ltd/pathway/pull/457)
at `cfe4b6b513e5bf83a8bc9e294e4690de62c7ca69`. All eight checks passed
on head `7e1029c3595cf46fe4b8bbdeb1635c9a9624df76` (CI run 37744291911;
CodeQL run 37744290181). Local 16-package lint and typecheck, the full
admin test script, admin build with nonproduction test configuration,
changed-file ESLint, formatting, diff check, and Graphify passed. The
permission-aware staff download uses a bounded date range, clear feedback,
and cancellation on site changes. It is merged but not deployed; controlled
permission seeding and phased production checks remain open.

Step 1.3e3c was merged in [PR #409](https://github.com/FSS-Ltd/pathway/pull/409)
after all eight checks passed on its final revision. Its staff unread-count
journey is merged but is not in the current manual production deployment.
Step 1.3e3d was merged in [PR #411](https://github.com/FSS-Ltd/pathway/pull/411)
after all eight checks passed, including 59 integration suites and 401 tests
against CI Postgres. Its direct-message read feedback is also awaiting the
next gated manual production deployment.

Step 1.3e3e was merged in [PR #461](https://github.com/FSS-Ltd/pathway/pull/461)
after all eight checks passed on head `33bb57ceaf91fd2eef75df289cafe43a9c42a7d2`.
It groups nearby staff messages, keeps the composer in view, and strengthens
contrast and selected-thread feedback. The UI is merged but not deployed;
the connected Vercel API, admin, and web production deployments still serve
`a41e09aac3fde40f646e0242b0b8e3f0191e0122`.

Step 1.3e2c merged in [PR #463](https://github.com/FSS-Ltd/pathway/pull/463)
at `fa1c28afbd25ce0d1bf733103cfe31e4f01e3a60`. All eight checks passed
on corrected head `6d0619e712905078775beec602353f04e2051685` after the
PostgreSQL integration test used the tenant fixture context for membership
changes. The site staffroom API is merged.

Step 1.3e2d merged in [PR #467](https://github.com/FSS-Ltd/pathway/pull/467)
at `e3d4f32fb1a393e43b7b3e010db0d874c8b7c72e`. All eight checks passed
on head `9971601a584a787bebfd89fd41bc0d87eff85321`. The web control
opens the room for permitted staff, handles failures, and discards responses
from a previous active site. It remains outside the manual production
deployment.

Step 1.3e4a merged in [PR #470](https://github.com/FSS-Ltd/pathway/pull/470)
at `5c5a47409ae10fae458fd7daa49982f7bc1af317`. All eight checks passed
on head `e2843e435f055c10df144a0986ad30da382a2694`, including the
PostgreSQL integration suite. The read-only parent list checks the explicit
site, current full guardian relationship, active participant, fixed Parent
read permission, and parent-portal switch. Parent creation, history, sending,
read cursor, and web access remain separate C12 work. This merged API is not
in the current manual production deployment. Estimated overall ACE update
completion after this merge: **89%**.

Step 1.3e4b merged in [PR #474](https://github.com/FSS-Ltd/pathway/pull/474)
at `7fcb36c7800cf73214ef787e54ecca007c9dafb8`. All eight checks passed
on head `7cc891144125f2a6eabd770c671d3f99087f3ff1`, including PostgreSQL
integration and RLS. The bounded parent history route reuses the current
guardian and participant access checks, rejects unrelated threads, and leaves
read cursors unchanged. Parent creation, sending, read-cursor writes, and web
access remain separate C12 slices. The manual production deployment still
serves older code. Estimated overall ACE update completion after this merge:
**89%**.

Step 1.3e4c merged in [PR #476](https://github.com/FSS-Ltd/pathway/pull/476)
at `0f17f8086480bb1c5b488ccebaf71df80a9b7d25`. All eight checks passed
on head `cbe28d24d9457b829df6412d403bcf064508d301`, including PostgreSQL
integration and RLS. The explicit parent read cursor advances only the current
guardian participant in their own school-team thread to an existing sequence;
it cannot regress. Parent conversation creation, sending, and web access remain
separate C12 slices. The manual production deployment still serves older code.
Estimated overall ACE update completion after this merge: **89%**.

Step 1.3e4d merged in [PR #478](https://github.com/FSS-Ltd/pathway/pull/478)
at `3f1ab2d6043fe59751e0c81e71820f2274b66e2e`. All eight checks passed
on head `f54b994d94f811c2f8bfb96cb822c9065b4ce21c`, including PostgreSQL
integration and RLS. A linked parent can select an approved site responder and
open or reuse their one school-team conversation; expired or revoked responder
tags are excluded. Parent sending and web access remain separate C12 slices.
The manual production deployment still serves older code. Estimated overall
ACE update completion after this merge: **89%**.

Step 1.3e4e merged in [PR #480](https://github.com/FSS-Ltd/pathway/pull/480)
at `b21c2baf1c5dfaba288843cce333960470d81779`. All eight checks passed
on head `554a073025f3ae4d5a17b6ee7220c7f571037e22`, including PostgreSQL
integration and RLS. The linked parent send API checks the current full
guardian relationship, active participant, portal switch, fixed Parent send
permission, and approved responder before new deliveries. It provides safe
client-request retries and audits message creation without the body. Parent
web messaging and staff school-team replies remain C12 work. The manual
production deployment still serves older code. Estimated overall ACE update
completion after this merge: **90%**.

Step 1.3e4f merged in [PR #482](https://github.com/FSS-Ltd/pathway/pull/482)
at `eb0dab891860a287144dbcd27bc6432658b3e0a7`. All eight checks passed
on head `90b22698b93186e99055dae6be59e78b5b53107b`, including integration
and RLS. A linked parent can enter a site-scoped school-team thread from the
family portal, discover an approved responder, read and explicitly mark
messages, and send with a stable retry ID. The web keeps failed drafts and
does not claim a read receipt the parent API cannot prove. Staff school-team
replies and notices remain C12 work. The three production apps still serve
older code. Estimated overall ACE update completion after this merge:
**91%**.

Step 1.3e4g merged in [PR #484](https://github.com/FSS-Ltd/pathway/pull/484)
at `b90d2594b0cbde4331bf987eb386802b34a800ff`. All eight checks passed
on head `096b9ad0b5b1a1471f0b18be5f9a2e30dff4f8cb`, including the
PostgreSQL integration and RLS suites. The staff inbox API lists only the
current approved responder's active parent threads within the selected site;
it is separate from the direct/room inbox and does not yet have a staff web
entry, history or reply route. The production apps still serve the older code
commit. Estimated overall ACE update completion after this merge: **91%**.

Step 1.3e4h merged in [PR #486](https://github.com/FSS-Ltd/pathway/pull/486)
at `535c088bbd53539feea19648d7dadef738be61dc`. All eight checks passed
on head `4dcb094ce32b0d561c351e053e013788338477c5`, including the
PostgreSQL messaging integration suite. The read-only staff history route
reuses the inbox's current site, responder, guardian-link and participant
scope, and returns bounded message pages without changing read state. Staff
read cursor, replies and web entry remain. The production apps still serve
older code.

Step 1.3e4i merged in [PR #488](https://github.com/FSS-Ltd/pathway/pull/488)
at `76f64f3bbffeec60c1be1568f50996a389790e15`. All eight checks passed
on head `d1dddb81d611af5ad1cd8997cf0b06cbc6a8c18b`, including the
PostgreSQL messaging integration suite. A current approved staff responder
can advance only their own school-team thread cursor to an existing sequence;
revoked access, ended guardian links, disabled parent portal and site switches
are denied. Staff replies and web entry remain. The production apps still
serve older code. Estimated overall ACE update completion after this merge:
**about 50%**.

Step 1.3e4j merged in [PR #490](https://github.com/FSS-Ltd/pathway/pull/490)
at `0a9f3f371badda8d895fb16f3c3aa17884208c16`. All eight checks passed
on head `89a37dbdf65a2caa4a267b6e0d2567b4a4a3db91`, including the
PostgreSQL messaging integration suite. A current approved staff responder
can send an idempotent, audited reply only to the thread's current linked
guardian participant. Revoked access, ended guardian links, disabled parent
portal and site switches deny new replies. The staff web entry and notices
remain, and production still serves older code. Estimated overall ACE update
completion after this merge: **about 50%**.

Step 1.3e4k merged in [PR #492](https://github.com/FSS-Ltd/pathway/pull/492)
at `f85fa11a4fb8904d9bf64c8db2137fb2e4a38ef0`. All eight checks passed
on head `9474ba71d21c88e7ecc62a93f32096db971c6bcc`, including the
PostgreSQL integration suite. The staff workspace now has a separate School
Team view with a current responder-scoped inbox, bounded history, read cursor,
and retry-safe replies. It clears site-specific state on a site switch and
never claims a parent read receipt. Notices and authenticated staging browser
verification remain; the production apps still serve `a41e09a`. Estimated
overall ACE update completion after this merge: **about 51%**.

Step 1.3e5a merged in [PR #494](https://github.com/FSS-Ltd/pathway/pull/494)
at `b65c4e64f32d1ccab608fe8be9fcf31ae5642a66`. All eight checks passed
on head `7b67a3555c218f325d6e74ae051f435738803d14`, including the
PostgreSQL integration suite. The ACE notice contract separates recipient
snapshots and receipts from the existing announcement route, and defines
current site, guardian, entitlement, expiry, and publication checks. This
design step added no live route; estimated overall completion remains
**about 51%**. A subsequent design review found the parent notice permission
must be relationship scoped, so the contract is being corrected before code.

Step 1.3e5a1 merged in [PR #499](https://github.com/FSS-Ltd/pathway/pull/499)
at `29a1780d4663840a6e19bce7aebfe1277e61e30e`. All eight checks passed
on head `9ee2322c1efd86a0ad974d060acad25224af7386`. The corrected
contract keeps the site-scoped `notices.read` key and generic announcements
separate from future relationship-scoped parent notices. The parallel AR-6
dashboard record was preserved and the missing PR #494 record restored. This
documentation step added no live route; estimated completion remains
**about 51%**.

Step 1.3e5b merged in [PR #500](https://github.com/FSS-Ltd/pathway/pull/500)
at `e4f5e46ea274150b364cb2d99f370d21bbdda071`. All eight checks passed
on head `c5858bf00bba252d508b01f37526755d3ae46f31`, including the
permission definition, role seed, and RLS database jobs. It registered the
ACE-only, relationship-scoped `ace.parent.notices.read` permission in the
protected Parent template without changing site-scoped `notices.read` or the
product-wide announcement route. No parent notice API is live yet; estimated
completion remains **about 51%**.

Step 1.3e5c1 merged in [PR #502](https://github.com/FSS-Ltd/pathway/pull/502)
at `1bf510c6fc01e3ddbfdcb4c90ce3963b26ca9e38`. All eight checks passed
on head `7d11c7a253984777f32a9aad738f30d7dfd6c5da`, including portable
`app` and `public` database probes. The forward migration requires a current
`FULL` guardian relationship to a non-guest child before including that user
in an ACE notice audience. It has not been applied to production; estimated
completion remains **about 51%**.

Step 1.3e5c2 merged in [PR #503](https://github.com/FSS-Ltd/pathway/pull/503)
at `70cc53502f37da07a0e449e5604ce51ee862c015`. All eight checks passed
on head `3a3b2c7a6b2d6b2b0ddeec3bf69488635231da78`. The additive notice
migration enforces expiry, final withdrawal, immutable publication and
write-once read receipts. Its API and web journey remain to be built. Overall
ACE update completion after this merge is **about 52%**.

**Revised overall ACE update estimate: about 52%.** The earlier 87% and 91%
estimates were too high for the full approved plan. The [journey matrix](02-oasis-web-journey-parity.md)
still marks 13 of 17 core journeys partial and all five paid add-ons missing;
the newer ACE code also has not passed the production release gate. This
estimate reflects remaining outcomes, rather than the number of merged PRs.

Step 1.3f1 was merged in [PR #413](https://github.com/FSS-Ltd/pathway/pull/413)
after all eight checks passed on its final revision, including PostgreSQL
integration coverage for the placement/projection reset. Its C02 work is merged
but remains outside the earlier manual production deployment.

Step 1.3f2 was merged in [PR #415](https://github.com/FSS-Ltd/pathway/pull/415)
after all eight checks passed on its final revision. Academic setup now exposes
the existing audited, site-scoped PACE policy, with permission-aware editing,
optimistic conflict recovery, and site-switch resets. ACE core subject setup
continues with its Academic setup web screen; authenticated staging and
production verification are still required before release.

Step 1.3f3a was merged in [PR #419](https://github.com/FSS-Ltd/pathway/pull/419)
after all eight checks passed on its final revision, including the PostgreSQL
integration suite. Step 1.3f3b was merged in
[PR #421](https://github.com/FSS-Ltd/pathway/pull/421) after all eight checks
passed on its final revision. The site-scoped subject API and Academic setup
screen are merged but not yet in the current manual production deployment.
Authenticated cross-site browser verification remains a release gate.

Release step REL-1 was merged in [PR #417](https://github.com/FSS-Ltd/pathway/pull/417)
after all eight checks passed on its final revision. The manual smoke workflow
can now authenticate to an exact protected admin deployment and verify the
expected Clerk sign-in redirect. It has not yet been dispatched against a
new production deployment; staging and authenticated user journeys remain open.

For step 1.3c5b, all eight checks passed on the checked revision in
[CI run 37532490552](https://github.com/FSS-Ltd/pathway/actions/runs/37532490552)
and [CodeQL run 37532483173](https://github.com/FSS-Ltd/pathway/actions/runs/37532483173).
For step 1.3d0, all eight checks passed on the checked revision in
[CI run 37534452075](https://github.com/FSS-Ltd/pathway/actions/runs/37534452075)
and [CodeQL run 37534447405](https://github.com/FSS-Ltd/pathway/actions/runs/37534447405).
For step 1.3d1, all eight checks passed on the checked revision in
[CI run 37538708174](https://github.com/FSS-Ltd/pathway/actions/runs/37538708174)
and [CodeQL run 37538703699](https://github.com/FSS-Ltd/pathway/actions/runs/37538703699).
For step 1.3d2, all eight checks passed on the checked revision in
[CI run 37544209044](https://github.com/FSS-Ltd/pathway/actions/runs/37544209044)
and [CodeQL run 37544202911](https://github.com/FSS-Ltd/pathway/actions/runs/37544202911).
For step 1.3d3, all eight checks passed on the checked revision in
[CI run 37547225142](https://github.com/FSS-Ltd/pathway/actions/runs/37547225142)
and [CodeQL run 37547222239](https://github.com/FSS-Ltd/pathway/actions/runs/37547222239).
For step 1.3d4, all eight checks passed on the checked revision in
[CI run 37550770462](https://github.com/FSS-Ltd/pathway/actions/runs/37550770462)
and [CodeQL run 37550765654](https://github.com/FSS-Ltd/pathway/actions/runs/37550765654).
For step 1.3d5, all eight checks passed on the checked revision in
[CI run 37553726682](https://github.com/FSS-Ltd/pathway/actions/runs/37553726682)
and [CodeQL run 37553723755](https://github.com/FSS-Ltd/pathway/actions/runs/37553723755).
For step DB-2a, all eight checks passed on the checked revision in
[CI run 37555887584](https://github.com/FSS-Ltd/pathway/actions/runs/37555887584)
and [CodeQL run 37555886228](https://github.com/FSS-Ltd/pathway/actions/runs/37555886228).

Step 1.1 makes production deployment explicit and accepts only the configured
Supabase project's direct database endpoint or shared session pooler on port
5432 for migrations. It rejects a transaction pooler URL, missing credentials
and a project mismatch before Prisma starts.
The old production project remains inaccessible. The new project has data and
migrations, with release blockers recorded below. Later steps start only after
the preceding PR has passing CI on its current revision and is merged into
`master`.

After DB-2h merged, its reviewed migration was applied to the off-traffic new
project. It has 107 finished migration records and 105 migration directories
in this repository. `prisma migrate deploy` succeeded, while `prisma migrate
status` still exits with the two missing historical files and one changed
historical checksum documented in the restore runbook. The direct execution grants on
`app.rls_auto_enable()` are gone for `PUBLIC`, `anon`, and `authenticated`;
its enabled RLS event trigger and owner execution remain. Four trigger
functions now use an empty search path, with all 11 learning membership
triggers attached. The strict public and app RLS gates pass. The 28 blog
posts, Victorious Kids organisation, 71 users, and 32 Storage objects remained
intact at that off-traffic checkpoint. Production was switched in DB-2i below.

The 1.3d1 attendance event migration and its following atomic-writer step must
reach production in the same gated release. Corrections made after the one-time
legacy backfill but before the writer is deployed would otherwise lack events.

## New Supabase project cutover conditions

The target is a **new project in the new organisation**, not a transfer of the
existing project. Creating that empty project is separate from migrating its
data and switching production traffic. The source project remains intact until
the restored target is verified and a rollback window has passed. No live copy
or cutover can be verified while the source is unavailable unless a complete,
restorable backup and its storage objects have already been independently
verified.

The owner chose the 7 September database and Storage archives as the final
source snapshot on 7 October, accepting that later writes cannot be checked
against the inactive source and may be absent. The target matches the archived
application row counts and Storage bytes. Production was switched to the new
project on 7 October; current-source parity remains unverified.

1. Record the source and target project refs, region, required extensions,
   database roles, migration history, storage buckets and object counts, Auth
   configuration if used, scheduled jobs, Edge Functions and external webhook
   destinations. Confirm the target region and data residency requirements
   before creating the project. Keep credentials and backup files in approved
   secret storage, outside the repository.
2. Restore a verified, point-in-time source backup into a **disposable target**
   first. For a target in another organisation, use Supabase's documented
   backup/restore procedure for a newly created project. The dashboard's
   physical "Restore to a new project" route has eligibility and region
   constraints; do not assume it can place a clone in another organisation.
   Reconcile the Prisma migration table before applying only genuinely pending
   migrations. Restore database roles and any encryption key material required
   by encrypted data through the documented secure process.
3. Copy Supabase Storage objects separately, then compare bucket inventories
   and representative object checksums. Recreate project-specific settings,
   keys, functions, Realtime configuration, and any Auth settings in use.
   Inspect scheduled jobs and webhook destinations before restore. A physical
   restore starts copied `pg_cron`, `pg_net` and other external operations
   immediately, with no pause option; use a logical restore if they must be
   inspected or removed before activation.
4. In staging, compare table counts and sampled records, verify tenant RLS,
   fixed-role and tag access, linked-child scope, uploads/downloads, workers,
   billing webhooks and critical API/admin/configurator journeys. Record the
   exact source snapshot and target migration status. Resolve differences
   before production cutover.
5. Keep the inactive source free of new writes. The owner accepted the verified
   7 September archive pair as the final snapshot, so there is no later delta
   to replay from current evidence. If source access returns before cutover,
   stop and compare later writes before switching traffic. Update
   `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, storage keys and relevant
   secrets in every deployment surface. In particular,
   `scripts/prepare-production-env.mjs` now derives the project URL from
   `DATABASE_URL` and requires a verified host before converting direct URLs;
   prepare and verify target credentials before synchronization. The migration
   workflow validates that `DIRECT_URL` and
   `SUPABASE_URL` select the same project and that migration uses port 5432.
6. Dispatch the manual production workflow only after the staging gate and
   cutover authorization. Smoke-test the deployed commit and monitor errors,
   queues and external callbacks. Keep the old project read-only and recoverable
   through the agreed rollback window; do not restore old traffic after new
   writes without reconciling them.

Supabase references: [backup and restore into a new
project](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore),
[physical restore limits](https://supabase.com/docs/guides/platform/clone-project),
and [project transfer](https://supabase.com/docs/guides/platform/project-transfer).

### Migration checkpoint — 2026-10-06

- Source `fkajodqkxysfcnfhizwn` (`nexsteps`, Ireland `eu-west-1`) matches the
  local production configuration. Supabase reports it `INACTIVE`; a read query
  timed out. Its restore endpoint rejected the request because the source
  organisation has unpaid invoices. No verified source snapshot was accessible
  for parity checks or export.
- Target `jzofykdzpuslpdyfovxp` (`NexSteps`, London `eu-west-2`) is healthy.
  Read-only inventory found zero `app` tables, Supabase Auth users, Storage
  buckets and Storage objects. Auth0 remains the application's identity provider.
- No data, migrations, Storage objects, deployment secrets, or traffic were
  moved. Resume only when the source organisation can restore the project or a
  complete, verified database backup **and** Storage export are available.
  Then follow the cutover conditions above, starting with a disposable restore.
- After PR #371 merged, source project status remained `INACTIVE` and the target
  remained `ACTIVE_HEALTHY`. The target-scoped Supabase MCP server is installed
  in Codex; its OAuth login attempt timed out, so authentication has not been
  verified. This does not change the source-data blocker above.
- A later manual OAuth attempt reached the Supabase sign-in choice, but Codex's
  automatic approval review blocked selecting the existing identity because
  that would share account profile details with Supabase. The user has been
  asked to approve that specific sign-in action. MCP authentication remains
  unverified; the connector's read-only project checks do not establish a
  complete source backup.
- On 7 October, a fresh read-only connector check still reported source
  `INACTIVE` and target `ACTIVE_HEALTHY`. No export, restore, Storage copy,
  migration, or cutover was attempted after step 1.3d2 merged.

### Backup preflight — 2026-10-07

The owner supplied a database backup and Storage archive. The
[new-project restore runbook](runbooks/new-project-backup-restore.md) records
their integrity, row and object inventory, target checks, restore procedure,
and acceptance evidence. The archives agree on all 32 Storage objects. The
database contains 28 published blog posts and a Victorious Kids master
organisation. The archive filename suggests 7 September; snapshot freshness
has not been established. The target Postgres URL is now in an ignored local
`.env`, and a read-only `psql` query verified the target connection and absence
of the application `Org` table. No database or Storage restore has been
attempted.

Step DB-2b has rehearsed the target-scoped SQL in disposable local Postgres 17:
all 1,820 archived rows matched across the 165 available table sections. The
empty Vault section was unavailable locally; Vault is installed on the target.
The owner confirmed this is the latest available database and Storage backup
pair, and supplied the new-project Storage credential in the ignored root
`.env`. The source remains unavailable for an independent post-snapshot delta.
The checked replay helper produces target-scoped SQL in a private temporary
file and rejects archive drift or unexpected `psql` commands. The Storage
restore command validated all 32 paths and its transfer tests passed.

The [DB-2b target restore evidence](runbooks/new-project-backup-restore.md#target-restore-evidence--7-october-2026)
records the live result: all 131 archived application table sections matched,
all 32 Storage files were uploaded and downloaded with matching hashes, and
four pending Prisma migrations applied. The application still uses the old
production project. The new target is not approved for traffic: migration
history differs from the repository, the strict RLS gate expects most tables
in `app` while the restored source stores them in `public`, and three older
trigger functions reference absent `app` relations. The fact, student portal,
and ACE actor triggers were corrected and verified on the target after PRs
#384–#386 merged.
Resolve and test these issues, review environment-specific settings and
secrets, then follow the separate staging and cutover gate. No production
deployment or configuration switch is claimed.

Local step 1.1 verification: migration URL tests 7/7; database deploy workflow
tests 6/6; lint and typecheck 16/16 packages each; Prettier and
`git diff --check` passed. `graphify update .` rebuilt the code graph. The
database connection, migration status and production smoke journeys remain
unverified while Supabase is unavailable. No app build was run because this
step changes the release workflow and CLI scripts, not app code.

Step 1.2a introduces the grant record, validity and revocation fields, and
organisation or site scoped RLS. It does not enable any tag or change effective
permissions. The catalogue, delegation checks, APIs and custom-role migration
remain for later delivery steps. Its migration is committed for later staging
and production application; no live Supabase migration is being attempted now.

Step 1.2b records the product-owner decision to retire customer-created roles
across all sectors. Its typed catalogue matches all 17 Oasis tag names. Five
currently map to delegable NexSteps permissions; twelve remain unavailable
until their missing permission, module, or record-scope rules are delivered.
The catalogue alone does not grant access. Grant/revoke and effective-access
APIs merged in step 1.2c but have not been deployed.

Step 1.2c local verification: API unit tests 994/994, API integration tests
357/357 against disposable Postgres, repository lint and typecheck 16/16 each,
API build, strict local RLS gate, new-file Prettier check, `git diff --check`,
and `graphify update .` passed. The RLS gate used the repository's documented
public-table exposure acceptance; the three pre-existing tables it reports
remain a separate production concern. Live Supabase migration and production
smoke tests remain deferred under the product owner's instruction.

Step 1.2d1 removes customer-facing role creation, editing, cloning,
permission replacement, and retirement from the shared admin application.
The corresponding API routes return a request-correlated `410` after the
existing authentication and permission guards. Historical role definitions
and assignments remain readable. Assigning only fixed roles, auditing parity
and retiring legacy assignments belong to steps 1.2d2 and 1.2d3. The
database's dedicated system-role seed identity remains mandatory in
production. Disposable integration fixtures may temporarily disable the
template trigger in a transaction and restore it before the fixture is used.
Local verification: repository lint and typecheck 16/16 each; API unit
tests, admin tests, API and admin builds, and 20 focused API integration
tests passed. The admin build used a non-secret mock API mode and test Clerk
publishable key. The full local integration suite had 43 passing and 11
failing suites because the disposable test database login has superuser/RLS
bypass privileges and retained conflicting fixtures; current-revision CI
must provide the clean full-suite result. `graphify update .`, targeted
Prettier checks, and `git diff --check` passed. CI then passed all five jobs
on the final PR revision and the host confirmed the merge.

Step 1.2d2 makes the assignment service select only active, platform-owned
fixed roles for new grants. The shared admin assignment picker shows only
those roles. Historical custom assignments remain visible and revocable so
step 1.2d3b can compare and retire them without widening user access.
Local lint and typecheck passed 16/16 packages, API unit tests passed
130/130 suites (998 tests), admin tests passed, and API/admin builds passed.
The two affected database integration suites passed 12/12 tests after a
disposable local database reset. The full local integration run passed 54/54
suites (359/359 tests) when configured with the dedicated RLS roles used by
CI. `graphify update .`, targeted Prettier checks, and `git diff --check`
passed. All five CI jobs then passed on the final PR revision, and GitHub
confirmed the merge.

Step 1.2d3a inventories currently valid custom-role assignments for one
organisation through read-only, organisation-scoped pages. It reports raw
permission keys and conservative fixed-role/tag candidates without issuing
or revoking grants. Live source data and audited retirement remain for step
1.2d3b2 when the database is available.
Local verification: repository lint and typecheck passed 16/16 packages;
API unit tests passed 131/131 suites (1001 tests); the API build and targeted
formatting passed. A populated disposable Postgres smoke run reported a
custom assignment and candidate tag, then the fixture was removed and its
absence verified. The script also rejects an invalid organisation ID before
opening a database connection. No production inventory was run.

Step 1.2d3b1 previews an explicit proposed mapping for every active custom
assignment. It rejects candidates from the wrong scope or site, reports
uncovered legacy keys, and compares current effective permission keys with a
projected result for each affected user at organisation scope and every site.
It performs no grants or revocations. A disposable PostgreSQL 17 instance with
all 93 migrations applied produced a matching three-context report for a site
tag replacement and a nonmatching report for an empty mapping; the synthetic
records were removed. A separate read-only-login smoke run confirmed that a
future-dated custom assignment blocks the preview. Production parity remains
unverified while the source Supabase project is unavailable.

Step 1.2d3b2a adds a transaction-aware effective-access read for the audited
retirement command. It must use the caller's write transaction and bypass the
shared assignment cache so before-and-after comparisons see uncommitted
changes.
Local verification: repository lint and typecheck passed 16/16 packages each;
API unit tests passed 133/133 suites (1007 tests); API integration tests
passed 54/54 suites (361 tests) against a disposable PostgreSQL 17 database
configured to UTC. The focused RLS suite passed 7/7 tests. API build,
targeted Prettier, `git diff --check`, and `graphify update .` passed. Live
Supabase migration and production smoke tests remain deferred.

Step 1.2d3b2b validates the mapping and actor, issues replacements, revokes each
custom assignment with audit and outbox records, and rejects any effective-access
difference before committing. The maintenance command requires a database
identity with RLS bypass because the current tenant and role-definition policies
hide other sites from an ordinary RLS identity. It rejects a partial inventory
rather than treating it as a successful cutover.
Local verification: repository lint and typecheck passed 16/16 packages each;
API unit tests passed 133/133 suites (1007 tests); API integration tests passed
55/55 suites (364 tests) against a disposable PostgreSQL 17 database with all
93 migrations and CI's RLS roles; API build, targeted formatting, and diff
checks passed. The focused suite also verifies that a restricted database
identity cannot run the inventory. Live Supabase migration, inventory, and
production smoke tests remain deferred.

Step 1.3a records the implemented Oasis web journeys, corresponding NexSteps
surfaces, unresolved outcomes, and acceptance checks in
`02-oasis-web-journey-parity.md`. It makes physical PACE ordering the first
core implementation slice and keeps its stock tracking outside paid add-ons.

Step 1.3b1 adds physical PACE order and supply tables, ACE-core inventory
permissions for fixed Organisation Head and Site Lead roles, and catalogue
PACE-number normalization. It does not expose an API or web journey. Local
verification applied all 94 migrations from scratch on disposable PostgreSQL
17 and passed tenant/actor/constraint smoke checks; Prisma reported no drift
for the new tables. The permission registry synchronized and checked with zero
drift. Repository lint and typecheck passed 16/16 packages each; ACE domain,
platform, and auth tests, API/auth builds, targeted formatting, diff review,
and Graphify refresh passed. Production migration remains deferred until the
source Supabase project is available or a verified new-project migration is
ready.

Step 1.3b2a adds read-only, site-scoped physical PACE order and stock pages.
Both routes use the typed ACE inventory read permission and bounded,
filter-scoped cursors. Stock uses active enrolments and supplied rows, with
explicit zero-stock state and pending-order suppression for one/two-PACE
attention. The order and stock command API and admin journey remain in later
steps. Local verification: all 94 migrations applied on disposable PostgreSQL
17; the affected request/RLS suite passed 8/8 with a no-bypass database role;
the API unit suite passed 134/134 (1,012 tests); repository lint and typecheck
passed 16/16 packages each; and the API build passed. Production migration and
live source-data checks remain deferred under the product owner's instruction.

Step 1.3b2c4 adds a manager-only, confirmed forward transition control to ACE
PACE order history. The existing API remains responsible for site, placement,
and status validation. Local verification passed the full admin test suite,
repository lint and typecheck (16/16 packages each), direct ESLint for changed
web files, the admin production build, targeted formatting, diff checks, and
Graphify code graph refresh. Live Supabase migration and production smoke tests
remain deferred under the product owner's instruction.

## Release gate

### DB-2i production cutover — 7 October 2026

The Vercel connection updated `nexsteps-api` production `DATABASE_URL` to the
new project's transaction pooler, `SUPABASE_URL` to
`jzofykdzpuslpdyfovxp`, and `SUPABASE_SECRET_KEY` to its service key. Vercel
read-back through the connected Vercel project environment API confirmed both
production URLs reference `jzofykdzpuslpdyfovxp`. The secret key is present;
its value is not reproduced here. The admin and web Vercel
projects have no database or Supabase environment variables. The GitHub
**production environment** secrets `DIRECT_URL` (session pooler),
`DATABASE_URL` (worker session pooler), `SUPABASE_URL`, and
`SUPABASE_SECRET_KEY` were also updated and their timestamps checked. The
repository-level older secrets were left untouched; production workflows use
the environment-scoped values.

The [manual deployment run](https://github.com/FSS-Ltd/pathway/actions/runs/37645052412)
used `master` commit `a41e09aac3fde40f646e0242b0b8e3f0191e0122`.
Migration job 112873548825, API job 112873938667, admin job 112873938894,
and web job 112873938543 all succeeded. Vercel reports all three production
deployments READY on that commit, with `app.nexsteps.dev` assigned to the
admin deployment. The live API `/health` returned 200 with a database time;
`/health/env` reported the database and Supabase settings present; and
`/public/blog/posts?limit=1` returned one restored post and a next cursor.
The marketing site and `/configure` returned 200. Vercel's authenticated
fetch of `app.nexsteps.dev` returned the expected 307 Clerk sign-in redirect.
Unauthenticated command-line access to that domain hits a Cloudflare challenge
instead. Vercel reported no runtime errors for the API, admin, or web project
in the cutover window checked from 15:33 UTC.

The authenticated admin journey, billing callbacks, background workers, and a
full staging journey suite have not been verified after cutover. The existing
GitHub post-deploy smoke workflow was not dispatched because its unauthenticated
admin `curl` would fail at Cloudflare. The old source remains inactive and
untouched; the accepted post-snapshot write gap and three migration-history
exceptions remain. Monitor production and reconcile any discovered missing
records through audited corrections; do not silently overwrite new writes by
restoring the old snapshot.
