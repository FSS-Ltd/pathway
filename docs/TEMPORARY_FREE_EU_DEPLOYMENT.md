# Vercel/Supabase Deployment

This is the active low-cost PathWay deployment path while revenue is early:

- Marketing and purchase web: Vercel, `nexsteps.dev`
- Admin app: Vercel, `app.nexsteps.dev`
- API: Vercel Node function, `api.nexsteps.dev`
- Database: Supabase Postgres free project, `nexsteps`
- File storage: Supabase Storage buckets
- Scheduled jobs: GitHub Actions cron

DNS is handled outside this repo.

## 1. Supabase

The current Supabase project is `nexsteps` in `eu-west-1`:

- Project ref: `fkajodqkxysfcnfhizwn`
- API URL: `https://fkajodqkxysfcnfhizwn.supabase.co`
- Current organization: `jntagengwa's Org`
- Current organization plan reported by the Supabase connector: `pro`

The original launch requirement says to use the free Supabase option. Supabase billing is organization-based, and Supabase docs state that free and paid projects cannot be mixed inside one organization. To make this project truly free-tier, transfer it to a Free Plan organization or create a Free Plan organization/project before production cutover. Keep using the same schema/storage setup after transfer.

Use Supabase for Postgres and Storage only. Auth remains Auth0, and the Nest API remains the application boundary for tenant/RBAC checks.

Storage buckets have been created in the current Supabase project through the
Supabase migration `create_pathway_storage_buckets`. The Prisma migration
`20260504000000_add_supabase_storage_keys` also includes an idempotent bucket
upsert that runs only when the target database has the Supabase `storage.buckets`
table, so a future free-tier Supabase project can be recreated through the repo
migration path.

- `pathway-private`: private tenant files, child photos, staff avatars, lesson resources
- `pathway-public`: blog/media assets served through the API

For Prisma on this Vercel setup, use the Supavisor transaction pooler connection string for the runtime `DATABASE_URL`. The string should use port `6543` and include `pgbouncer=true`.

Use `DIRECT_URL` only for the database migration workflow. It should point at the Supabase direct connection or the Supavisor session pooler on port `5432`.

Do not expose database credentials or Supabase secret keys to browser/mobile environments. The Supabase Prisma guide recommends transaction pooling for serverless or auto-scaling deployments; a direct `db.<project-ref>.supabase.co` runtime host can exhaust database connections on Vercel.

Required Supabase-backed production vars:

- `DATABASE_URL` using Supavisor transaction mode for API/runtime queries
- `DIRECT_URL` using direct/session mode for GitHub migration deploys
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_STORAGE_PRIVATE_BUCKET=pathway-private`
- `SUPABASE_STORAGE_PUBLIC_BUCKET=pathway-public`

`SUPABASE_SECRET_KEY` must be copied from the Supabase dashboard. The Supabase
connector can confirm the project URL and publishable keys, but it does not
return `sb_secret_...` or service-role-equivalent keys.

Current database state:

- Prisma migrations were applied to Supabase through `pnpm db:deploy:production`.
- `pnpm db:status:production` reports `Database schema is up to date!`.
- `public."Tenant"` currently has 0 rows, so `AV30_TENANT_IDS` cannot be derived
  from production data yet. The scheduled AV30 worker is a no-op until tenant
  IDs are configured.

Security gate before launch: the Supabase connector reported a critical RLS
advisory after migrations. Several public tables still have RLS disabled. Because
the app uses the Nest API and Prisma as the tenant/RBAC boundary, the safest
launch choices are either:

- Disable/exclude the public schema from Supabase Data API exposure in the
  Supabase dashboard if this app will not use direct Supabase client access.
- Or enable RLS and add table-specific policies before exposing any direct
  Supabase client access.

Do not run the generic remediation blindly in production without policy review.
It can block legitimate API paths if a table is later accessed through Supabase
client libraries. The connector-provided baseline SQL for review is:

```sql
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._ParentChildren ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.OrgEntitlementSnapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.UsageCounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.BillingEvent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.OrgRetentionPolicy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.UserIdentity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.OrgMembership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.SiteMembership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.Lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.StaffUnavailableDate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.StaffPreferredGroup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._GroupToSession ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.PublicSignupLink ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.EmergencyContact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ParentSignupConsent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.DownloadToken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.SessionStaffAttendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.BlogAsset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.BlogPost ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.HandoverLog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.HandoverLogVersion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.AutomationApiToken ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.AutomationBlogPublishAudit ENABLE ROW LEVEL SECURITY;
```

The launch preflight runs `pnpm supabase:rls:check -- --strict`, which performs
a read-only catalog query against `DIRECT_URL` or `DATABASE_URL`. It fails while
any public table has RLS disabled unless `SUPABASE_RLS_GATE_ACCEPTED=true` is
set in the shell or `env.production`. Only set that override after confirming
the public schema is not exposed through the Supabase Data API, or after a
reviewed table-specific RLS policy rollout is approved.

## 2. Vercel Projects

Create or link three Vercel projects from this monorepo:

- `apps/web`, configured by `apps/web/vercel.json`
- `apps/admin`, configured by `apps/admin/vercel.json`
- `apps/api`, configured by `apps/api/vercel.json`

Current Vercel connector state for team `team_qvufVWPpOoZtQcAtRv8KQenE`:

- Existing project: `oasis-portal-web`
- Missing launch projects: `nexsteps-web`, `nexsteps-admin`, `nexsteps-api`
- `pnpm launch:preflight` currently fails because the Vercel token and the
  three Vercel project IDs are not yet available in `env.production` or the
  shell environment.

Use the Vercel dashboard or link from the monorepo root:

```bash
pnpm vercel:projects:setup
VERCEL_TOKEN=... VERCEL_ORG_ID=team_qvufVWPpOoZtQcAtRv8KQenE pnpm vercel:projects:setup -- --apply
pnpm dlx vercel@54.13.0 link --repo
```

The setup script patches existing projects as well as creating missing ones.
Because each Vercel project uses an app directory as its root, install and build
commands deliberately `cd ../..` back to the monorepo root before running pnpm.
That keeps workspace dependencies, Prisma generation, and Turbo cache behavior
consistent with local and GitHub Actions builds.
The install command uses `--prod=false` because Vercel builds with
`NODE_ENV=production`, while this monorepo still needs build-time dev
dependencies such as Prisma CLI and TypeScript.
The projects also enable Vercel's source-files-outside-root setting so workspace
packages, the root lockfile, and shared configuration are available to each app
build.

Each project must use its app directory as the Vercel root directory. After the
projects exist, store their IDs in GitHub Actions secrets. The setup script uses
these default project names unless overridden with `VERCEL_WEB_PROJECT_NAME`,
`VERCEL_ADMIN_PROJECT_NAME`, or `VERCEL_API_PROJECT_NAME`:

- `nexsteps-web`
- `nexsteps-admin`
- `nexsteps-api`

The API uses `apps/api/api/[...path].ts` to run the existing Nest app as a Vercel Node function. All API paths are rewritten into that function by `apps/api/vercel.json`.

The GitHub deploy action invokes the Vercel CLI from the monorepo root and
passes the app directory (`apps/web`, `apps/admin`, or `apps/api`) as the project
path. This keeps CLI execution aligned with Vercel's monorepo guidance while
still producing each app's prebuilt `.vercel/output` artifact.

Required GitHub Actions production secrets:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_WEB_PROJECT_ID`
- `VERCEL_ADMIN_PROJECT_ID`
- `VERCEL_API_PROJECT_ID`

The GitHub connector reports `jntagengwa/pathway` as a private repository with
default branch `master`. The CI workflow is configured for `master` and
`develop`.

Current local GitHub CLI state: `gh auth status` reports the default
`jntagengwa` token as invalid. Re-authenticate before running
`pnpm github:secrets:setup -- --apply`.

Use the helper script to dry-run and then apply the GitHub `production`
environment secrets:

```bash
pnpm github:secrets:setup
pnpm github:secrets:setup -- --apply
```

The script reads `env.production`, `.env.production`, or `.env.prod`, plus the
current shell. It sets only the secrets referenced by the workflows and does not
print secret values. For the default `production` environment scope, it also
ensures the GitHub environment exists before writing secrets.

## 3. Production Env Sync

Sync Vercel production environment variables from `env.production`. The helpers
still support `.env.production` and `.env.prod` as fallbacks, but
`env.production` is the canonical launch file for this migration.

```bash
pnpm env:production:prepare
pnpm vercel:env:sync
pnpm vercel:env:sync -- --apply
```

Dry-run is the default. `--apply` requires:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` or `VERCEL_TEAM_ID`
- `VERCEL_WEB_PROJECT_ID`
- `VERCEL_ADMIN_PROJECT_ID`
- `VERCEL_API_PROJECT_ID`

The sync is idempotent and uses Vercel env upsert for the `production` target.
`--apply` refuses to write anything unless the selected targets have project IDs,
`VERCEL_TOKEN`, and `0 required missing`.

The helper reads `env.production`, then lets explicit shell variables override
file values. This allows one-off values such as `VERCEL_TOKEN` to stay out of
the file if preferred. `pnpm env:production:prepare` copies an existing ignored
`.env.production` or `.env.prod` fallback to ignored `env.production` without
printing secret values. It also appends known non-secret deployment defaults
such as the Vercel team ID, Supabase URL, and bucket names when they are missing.
For internal app-only secrets that do not come from a provider, it generates
`REVALIDATE_SECRET` when missing. If `DATABASE_URL` is still the direct Supabase
connection string and `DIRECT_URL` is missing, it copies that value into
`DIRECT_URL` for migration workflows, then rewrites both values to use the
verified Supavisor hosts for this project: transaction mode for `DATABASE_URL`
and session mode for `DIRECT_URL`.

Minimum launch sequence:

1. Complete `env.production`.
   Required values still missing from the current local file are
   `VERCEL_TOKEN`, `VERCEL_WEB_PROJECT_ID`, `VERCEL_ADMIN_PROJECT_ID`,
   `VERCEL_API_PROJECT_ID`, and `SUPABASE_SECRET_KEY`.
   `RESEND_WEBHOOK_SECRET` is optional until Resend webhooks are enabled.
2. If values currently live in `.env.production` or `.env.prod`, run
   `pnpm env:production:prepare`.
3. Run `pnpm launch:preflight`.
4. Create/link the three Vercel projects and record their project IDs if the
   preflight reports missing Vercel project IDs.
5. Run `pnpm launch:preflight` again until it passes.
6. Run `pnpm vercel:env:sync -- --apply`.
7. Run `pnpm github:secrets:setup -- --apply`.
8. Check migrations with `pnpm db:status:production`, then either run
   `pnpm db:deploy:production` locally or dispatch `Deploy database migrations`.
9. Dispatch `Deploy to Vercel` with target `all`.
10. Dispatch `Post-deploy smoke tests` using the deployed API, web, and admin
    URLs. Use Vercel URLs before DNS cutover, then rerun with custom domains
    after DNS is pointed.

`pnpm launch:preflight` is read-only. It runs the Supabase RLS check, Vercel
project setup, Vercel environment sync, and GitHub secret helpers in strict mode
so missing values are reported before any remote writes happen.

## 4. GitHub Actions

Active workflows:

- `CI`: typecheck, lint, unit tests, optional integration tests
- `Deploy to Vercel`: manual production deploys for web, admin, and API
- `Deploy database migrations`: manual Prisma migration deploy against Supabase
- `Scheduled workers`: nightly AV30 and retention jobs
- `Secret scan`: manual git-history secret scan
- `Post-deploy smoke tests`: manual URL checks for API health, marketing, and admin

The Vercel deploy workflow uses:

- pnpm store cache
- Turbo cache
- Next/Vercel build cache paths
- pinned Vercel CLI `54.13.0`
- `vercel build` plus `vercel deploy --prebuilt`

The production Vercel workflow is intentionally manual-only. Run `Deploy database
migrations` first, then dispatch `Deploy to Vercel` with target `all`. This keeps
API/runtime changes from reaching production before the Supabase schema is ready.
The local `db:*:production` helpers load ignored `env.production` and pass
`DIRECT_URL` to Prisma as `DATABASE_URL`, because Prisma migrations should use a
direct/session connection while runtime API traffic uses the transaction pooler.

Required GitHub Actions secrets for database/workers:

- `DATABASE_URL`
- `DIRECT_URL`
- `RETENTION_ENABLED=true`

Optional GitHub Actions secrets for workers:

- `AV30_TENANT_IDS`: comma-separated tenant IDs. If missing or empty, the AV30
  compute step logs a no-op and exits successfully.

Latest local verification of the launch tooling:

- `pnpm launch:preflight` is correctly read-only and reports only the missing
  external credentials/project IDs and invalid local `gh` auth as launch
  blockers.
- `AV30_TENANT_IDS` is optional while production has no tenants.
- `pnpm db:status:production` reports the Supabase Prisma schema is up to date.

## 5. Provider Callbacks

Auth0:

- Callback URL: `https://app.nexsteps.dev/api/auth/callback/auth0`
- Logout URL: `https://app.nexsteps.dev`
- Web origin: `https://app.nexsteps.dev`

Stripe:

- Billing webhook: `https://api.nexsteps.dev/billing/webhook`
- Success URL: `https://app.nexsteps.dev/admin/billing/success`
- Cancel URL: `https://app.nexsteps.dev/admin/billing`

Resend:

- Webhook endpoint: `https://api.nexsteps.dev/webhooks/resend`

## 6. Smoke Tests

Before DNS cutover:

```bash
pnpm --filter @pathway/api typecheck
pnpm --filter @pathway/api test:unit
pnpm --filter @pathway/workers typecheck
pnpm --filter @pathway/workers test
pnpm --filter @pathway/web build
pnpm --filter @pathway/admin build
```

After DNS cutover:

- `https://api.nexsteps.dev/health` returns `status: ok`
- `https://nexsteps.dev` loads public marketing, blog, signup, and purchase flows
- `https://app.nexsteps.dev` completes Auth0 login and role fetch
- Admin production is not in mock API mode
- Child photo, staff avatar, lesson resource, and blog media routes load through the API
- Stripe and Resend webhooks are configured with rotated production secrets
- `Scheduled workers` can be manually dispatched successfully
