# ACE production release status

Checked on 5 October 2026. The latest `master` commit is
`92d492680baef463c4696ea0a98f2832f1cce805`. Its [production deployment](https://github.com/FSS-Ltd/pathway/actions/runs/34189600516)
failed during Prisma migration; the API, admin and web deploy jobs were skipped.
The last successful deployment was
[`ea7c44c6edd043889f90e62935bf851505ebb5df`](https://github.com/FSS-Ltd/pathway/actions/runs/31965820501).

The product owner has directed us to continue implementation while Supabase is
unavailable, then run migrations and resolve database issues at the end. No
production migration or deployment is claimed by this record.

## Delivery steps

| Step | Scope                                                     | State          | PR and base       | Checked revision and CI         | Merge evidence |
| ---- | --------------------------------------------------------- | -------------- | ----------------- | ------------------------------- | -------------- |
| 1.1  | Validate the Supabase migration target before Prisma runs | Local verified | Pending, `master` | Local checks passed; CI pending | Pending        |
| 1.2  | Fixed roles and scoped access tags                        | Planned        | Pending           | Pending                         | Pending        |
| 1.3  | ACE core web journeys                                     | Planned        | Pending           | Pending                         | Pending        |
| 1.4  | Paid add-ons and entitlement billing                      | Planned        | Pending           | Pending                         | Pending        |
| 1.5  | Shared web UI and messaging finish                        | Planned        | Pending           | Pending                         | Pending        |

Step 1.1 accepts only the configured Supabase project's direct database endpoint
or shared session pooler on port 5432 for migrations. It rejects a transaction
pooler URL, missing credentials and a project mismatch before Prisma starts.
The production credentials, connection and schema status still need verification
when Supabase is available. Later steps start only after the preceding PR has
passing CI on its current revision and is merged into `master`.

Local step 1.1 verification: migration URL tests 7/7; database deploy workflow
tests 5/5; lint and typecheck 16/16 packages each; Prettier and
`git diff --check` passed. `graphify update .` rebuilt the code graph. The
database connection, migration status and production smoke journeys remain
unverified while Supabase is unavailable. No app build was run because this
step changes the release workflow and CLI scripts, not app code.

## Release gate

After implementation, restore the Supabase connection; inspect migration status
and pending SQL; apply and test migrations in staging; then deploy the verified
`master` commit. Record the migration and app job IDs, smoke-test the API,
authenticated admin and public configurator, and check production errors before
marking the release complete.
