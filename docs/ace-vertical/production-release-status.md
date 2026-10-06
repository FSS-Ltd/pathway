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

| Step | Scope                                                | State   | PR and base                                                     | Checked revision and CI                                                                                                                            | Merge evidence                             |
| ---- | ---------------------------------------------------- | ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1.1  | Require manual release and validate migration target | Merged  | [#346](https://github.com/FSS-Ltd/pathway/pull/346) to `master` | `07cd5eeb4432a7400297865166564acb9a8032ab`; all five jobs passed in [run 37317265932](https://github.com/FSS-Ltd/pathway/actions/runs/37317265932) | `d27b9df77e4416dc2cd472abf59dc2a6568b7b2a` |
| 1.2a | Scoped access-tag grant storage and RLS              | Merged  | [#347](https://github.com/FSS-Ltd/pathway/pull/347) to `master` | `143a7bd507127556c5322184a1c2000108fc0346`; all five jobs passed in [run 37322499197](https://github.com/FSS-Ltd/pathway/actions/runs/37322499197) | `f1674f41a39e80abb0b1cc4282056a808f83b425` |
| 1.2b | Typed access-tag catalogue and access decision docs  | Merged  | [#348](https://github.com/FSS-Ltd/pathway/pull/348) to `master` | `a975bc89e36a12f5a5e2e3526d222e310777b1bc`; all five jobs passed in [run 37369195079](https://github.com/FSS-Ltd/pathway/actions/runs/37369195079) (attempt 4) | `173420159825f2d029c685e4b2c19a7ba07e5970` |
| 1.2c | Delegation, grant/revoke and effective-access APIs   | PR open | [#349](https://github.com/FSS-Ltd/pathway/pull/349) to `master` | CI pending on current PR revision | Pending |
| 1.2d | Legacy custom-role retirement and parity migration   | Planned | Pending                                                         | Pending                                                                                                                                            | Pending                                    |
| 1.3  | ACE core web journeys                                | Planned | Pending                                                         | Pending                                                                                                                                            | Pending                                    |
| 1.4  | Paid add-ons and entitlement billing                 | Planned | Pending                                                         | Pending                                                                                                                                            | Pending                                    |
| 1.5  | Shared web UI and messaging finish                   | Planned | Pending                                                         | Pending                                                                                                                                            | Pending                                    |

Step 1.1 makes production deployment explicit and accepts only the configured
Supabase project's direct database endpoint or shared session pooler on port
5432 for migrations. It rejects a transaction pooler URL, missing credentials
and a project mismatch before Prisma starts.
The production credentials, connection and schema status still need verification
when Supabase is available. Later steps start only after the preceding PR has
passing CI on its current revision and is merged into `master`.

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
work is step 1.2c; it has not been merged or deployed.

Step 1.2c local verification: API unit tests 994/994, API integration tests
357/357 against disposable Postgres, repository lint and typecheck 16/16 each,
API build, strict local RLS gate, new-file Prettier check, `git diff --check`,
and `graphify update .` passed. The RLS gate used the repository's documented
public-table exposure acceptance; the three pre-existing tables it reports
remain a separate production concern. Live Supabase migration and production
smoke tests remain deferred under the product owner's instruction.

## Release gate

After implementation, restore the Supabase connection; inspect migration status
and pending SQL; apply and test migrations in staging; then deploy the verified
`master` commit. Record the migration and app job IDs, smoke-test the API,
authenticated admin and public configurator, and check production errors before
marking the release complete.
