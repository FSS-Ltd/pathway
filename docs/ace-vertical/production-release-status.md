# ACE production release status

Checked on 6 October 2026. Step 1.1 merged into `master` as
`d27b9df77e4416dc2cd472abf59dc2a6568b7b2a`. The earlier [production deployment](https://github.com/FSS-Ltd/pathway/actions/runs/34189600516)
failed during Prisma migration; the API, admin and web deploy jobs were skipped.
The last successful deployment was
[`ea7c44c6edd043889f90e62935bf851505ebb5df`](https://github.com/FSS-Ltd/pathway/actions/runs/31965820501).

The product owner has directed us to continue implementation while Supabase is
unavailable, then run migrations and resolve database issues at the end. The
production workflow therefore requires manual dispatch; merging to `master`
does not start migrations or app deployment. No production migration or
deployment is claimed by this record.

## Delivery steps

| Step     | Scope                                                  | State   | PR and base                                                     | Checked revision and CI                                                                                                                                        | Merge evidence                             |
| -------- | ------------------------------------------------------ | ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1      | Require manual release and validate migration target   | Merged  | [#346](https://github.com/FSS-Ltd/pathway/pull/346) to `master` | `07cd5eeb4432a7400297865166564acb9a8032ab`; all five jobs passed in [run 37317265932](https://github.com/FSS-Ltd/pathway/actions/runs/37317265932)             | `d27b9df77e4416dc2cd472abf59dc2a6568b7b2a` |
| 1.2a     | Scoped access-tag grant storage and RLS                | Merged  | [#347](https://github.com/FSS-Ltd/pathway/pull/347) to `master` | `143a7bd507127556c5322184a1c2000108fc0346`; all five jobs passed in [run 37322499197](https://github.com/FSS-Ltd/pathway/actions/runs/37322499197)             | `f1674f41a39e80abb0b1cc4282056a808f83b425` |
| 1.2b     | Typed access-tag catalogue and access decision docs    | Merged  | [#348](https://github.com/FSS-Ltd/pathway/pull/348) to `master` | `a975bc89e36a12f5a5e2e3526d222e310777b1bc`; all five jobs passed in [run 37369195079](https://github.com/FSS-Ltd/pathway/actions/runs/37369195079) (attempt 4) | `173420159825f2d029c685e4b2c19a7ba07e5970` |
| 1.2c     | Delegation, grant/revoke and effective-access APIs     | Merged  | [#349](https://github.com/FSS-Ltd/pathway/pull/349) to `master` | `ff0d294709cece7f19974697ad57b0fd28f632de`; all five jobs passed in [run 37413254333](https://github.com/FSS-Ltd/pathway/actions/runs/37413254333)             | `784f261ec9e2463a9a7b519328cb7d8b27560f8f` |
| 1.2d1    | Retire customer role write routes and editor           | Merged  | [#350](https://github.com/FSS-Ltd/pathway/pull/350) to `master` | `1de73eeb12a71882740f8d6dce1b8d8f7d731151`; all five jobs passed in [run 37415925535](https://github.com/FSS-Ltd/pathway/actions/runs/37415925535)             | `de2ce169476b5809c3f0b46b1567b619cac6b75d` |
| 1.2d2    | Fixed-role-only assignment cutover                     | Merged  | [#351](https://github.com/FSS-Ltd/pathway/pull/351) to `master` | `a9493ed9c5d05fa86a6a96afcd077ba6004cad71`; all five jobs passed in [run 37418692392](https://github.com/FSS-Ltd/pathway/actions/runs/37418692392)             | `a1f8bbbe19bc056e4e28138657f1acdd2de7bfd5` |
| 1.2d3a   | Read-only custom-assignment inventory                  | Merged  | [#352](https://github.com/FSS-Ltd/pathway/pull/352) to `master` | `9be47a8aed1bcbb808e392fb8db02df54737e6c2`; all five jobs passed in [run 37420486397](https://github.com/FSS-Ltd/pathway/actions/runs/37420486397)             | `053743614742c4acec9b2180604d294f3102d2e4` |
| 1.2d3b1  | Effective-access parity preview for proposed mappings  | Merged  | [#353](https://github.com/FSS-Ltd/pathway/pull/353) to `master` | `5ddb58ea9cbf49c369590b5efa852f4b8ab20dd1`; all five jobs passed in [run 37424373226](https://github.com/FSS-Ltd/pathway/actions/runs/37424373226)             | `8eaaa1c0d29a80b391855a0836931487296ed248` |
| 1.2d3b2a | Fresh effective-access reads in a write transaction    | Merged  | [#354](https://github.com/FSS-Ltd/pathway/pull/354) to `master` | `1fd7a972908141892215bbb937d00535e41f2c0e`; all five jobs passed in [run 37428121362](https://github.com/FSS-Ltd/pathway/actions/runs/37428121362)             | `62e3db49cd4372e3a5908e4674f7fb7fe2185fe2` |
| 1.2d3b2b | Audited assignment retirement                          | Merged  | [#355](https://github.com/FSS-Ltd/pathway/pull/355) to `master` | `6ec5a07b779e4e091a4d41002bf404f63fa79e4d`; all five jobs passed in [run 37433372134](https://github.com/FSS-Ltd/pathway/actions/runs/37433372134)             | `a7227df78a5bcc068ce2374ce88d5ba620a4b518` |
| 1.3a     | Oasis-to-NexSteps web journey parity contract          | Merged  | [#356](https://github.com/FSS-Ltd/pathway/pull/356) to `master` | `9fe3b714e5d9c131275a827db72ced62efe235a8`; all five jobs passed in [run 37435850091](https://github.com/FSS-Ltd/pathway/actions/runs/37435850091)             | `676cb7bc5f3a0e3eb895ddd3fcd145ba0ec6b2d5` |
| 1.3b1    | Physical PACE inventory data and permission foundation | Merged  | [#357](https://github.com/FSS-Ltd/pathway/pull/357) to `master` | `554302c0f97e18296c6c8d705b2aaa299f9b9b36`; all five jobs passed in [run 37444424579](https://github.com/FSS-Ltd/pathway/actions/runs/37444424579)             | `9aa51c88c7091974017169c0ac0a08f6dce50838` |
| 1.3b2a   | Guarded physical PACE inventory reads                  | PR open | [#358](https://github.com/FSS-Ltd/pathway/pull/358) to `master` | Initial revision `966f601dd7a831c6c42da7bf30ab24a74709e98e`; current-revision CI pending                                                                       | Pending                                    |
| 1.3b2+   | ACE core web journey slices                            | Planned | Pending                                                         | Pending                                                                                                                                                        | Pending                                    |
| 1.4      | Paid add-ons and entitlement billing                   | Planned | Pending                                                         | Pending                                                                                                                                                        | Pending                                    |
| 1.5      | Shared web UI and messaging finish                     | Planned | Pending                                                         | Pending                                                                                                                                                        | Pending                                    |

Step 1.1 makes production deployment explicit and accepts only the configured
Supabase project's direct database endpoint or shared session pooler on port
5432 for migrations. It rejects a transaction pooler URL, missing credentials
and a project mismatch before Prisma starts.
The production credentials, connection and schema status still need verification
when Supabase is available. Later steps start only after the preceding PR has
passing CI on its current revision and is merged into `master`.

The target for a future database move is a new Supabase project in the new
organisation. The source project will remain intact through a verified backup,
restore, configuration and storage copy, staging checks, and a controlled
application cutover. No live copy or cutover can be verified while the source
project is unavailable.

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

## Release gate

After implementation, restore the Supabase connection; inspect migration status
and pending SQL; apply and test migrations in staging; then deploy the verified
`master` commit. Record the migration and app job IDs, smoke-test the API,
authenticated admin and public configurator, and check production errors before
marking the release complete.
