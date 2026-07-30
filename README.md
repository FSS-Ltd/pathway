# PathWay Monorepo

## Project Overview

PathWay is a comprehensive monorepo project designed to streamline the development of a scalable and maintainable platform. This repository contains multiple applications and shared packages, enabling efficient code reuse and unified development workflows.

The approved NexSteps Home product and UX implementation reference starts at
[`docs/NexStepsV2/nexsteps-home/README.md`](docs/NexStepsV2/nexsteps-home/README.md).

## Monorepo Structure

The repository is organized into the following main directories:

- **apps/**  
  Contains the main applications:
  - `api` - Backend API server
  - `admin` - Admin dashboard web application
  - `mobile` - Mobile application

- **packages/**  
  Contains shared libraries and utilities:
  - `db` - Database schema and migrations
  - `types` - Shared TypeScript types
  - `config` - Configuration utilities and environment management
  - `ui` - Shared UI components
  - `util` - Utility functions and helpers

## Tech Stack

- **Node.js** & **TypeScript** for backend and shared code
- **React** for web applications (`admin`)
- **React Native** for the `mobile` app
- **pnpm** as the package manager
- **Turborepo** for build orchestration and caching
- **Docker** for containerization
- **Jest** for testing
- **ESLint** and **Prettier** for linting and formatting

## Getting Started

### Prerequisites

- Node.js (>=16.x)
- pnpm (>=7.x)
- Docker (optional, for containerized development)

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-org/pathway.git
cd pathway
pnpm install
```

## Development

To run all applications in development mode:

```bash
pnpm turbo run dev
```

Or run individual apps:

```bash
pnpm --filter=api dev
pnpm --filter=admin dev
pnpm --filter=mobile dev
```

## Testing

This monorepo uses a clear separation between **unit tests** and **integration tests**:

- **Unit tests** (`*.spec.ts`): Fast, isolated tests that don't require external dependencies like databases
- **Integration tests** (`*.e2e.spec.ts`, `*.e2e-spec.ts`): End-to-end tests that require a database and test the full application stack

### Running Tests

**Unit tests only (default, no database required):**

```bash
# Run all unit tests across the monorepo
pnpm test:unit

# Run unit tests for a specific package
pnpm --filter @pathway/api test:unit
pnpm --filter @pathway/workers test
pnpm --filter @pathway/auth test
```

**Integration tests (requires database):**

```bash
# Run all integration tests
pnpm test:integration

# Run integration tests for a specific package
pnpm --filter @pathway/api test:integration
```

**Note:** The default `pnpm test` command runs unit tests only, ensuring CI passes without external dependencies.

### Running Integration Tests Locally

Integration tests require a PostgreSQL database. You have two options:

#### Option 1: Using Docker Compose (Recommended)

1. Start the development database:

```bash
pnpm infra:up
```

2. Set up environment variables in `.env.test`:

```bash
DATABASE_URL=postgresql://pathway_user:pathway_password@localhost:5432/pathway_test?schema=app
E2E_DATABASE_URL=postgresql://pathway_user:pathway_password@localhost:5432/pathway_test_e2e?schema=app
E2E_ORG_ID=00000000-0000-0000-0000-000000000001
E2E_TENANT_ID=00000000-0000-0000-0000-000000000002
E2E_TENANT2_ID=00000000-0000-0000-0000-000000000003
E2E_TENANT_SLUG=e2e-tenant-a
```

3. Generate Prisma client and run migrations:

```bash
pnpm db:generate
pnpm --filter @pathway/db run prisma migrate deploy
```

4. Run integration tests:

```bash
pnpm test:integration
```

### Protected system-role seed identity

`pnpm db:seed`, the `@pathway/db` seed script, and Prisma's seed entrypoint all
delegate to the same root seed command. The command fails before synchronising
permission metadata unless `SYSTEM_ROLE_SEED_DATABASE_URL` is present and
authenticates as the PostgreSQL login `pathway_system_role_seed`. Use a direct
or session connection URL; transaction-pooler URLs cannot preserve that
identity guarantee.

Provision that login outside Prisma migrations with `LOGIN NOINHERIT
NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`. Grant it
`USAGE` on the application schema; `SELECT` on `Org`, `Tenant`, `OrgVertical`,
`OrgModule`, `PermissionDefinition`, `OrgRoleDefinition`, and
`OrgRolePermission`; write access only on `PermissionDefinition`,
`OrgRoleDefinition`, and `OrgRolePermission`; and database `CONNECT`. Never
grant the seed role to the runtime application login or place its URL in
runtime service secrets.

Run the following through the environment's reviewed DBA connection, replacing
the database name and password through the environment's secret-management
workflow:

```sql
CREATE ROLE pathway_system_role_seed
  LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
  NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD '<managed-secret>';
GRANT CONNECT ON DATABASE <database_name> TO pathway_system_role_seed;
GRANT USAGE ON SCHEMA app TO pathway_system_role_seed;
GRANT SELECT ON TABLE
  app."Org", app."Tenant", app."OrgVertical", app."OrgModule",
  app."PermissionDefinition", app."OrgRoleDefinition",
  app."OrgRolePermission"
TO pathway_system_role_seed;
GRANT INSERT, UPDATE, DELETE ON TABLE
  app."PermissionDefinition", app."OrgRoleDefinition",
  app."OrgRolePermission"
TO pathway_system_role_seed;
```

The database identity proofs never use or infer safety from `DATABASE_URL`.
Run them only against a disposable Postgres instance owned by the test run.
Set `SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL` to an admin connection for an
already migrated database named `pathway_system_role_seed_test` or
`pathway_system_role_seed_test_<suffix>`, with `?schema=app`, and set:

```text
SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN=provision-and-drop-system-role-seed-test-logins
```

The proof fails if the canonical `pathway_system_role_seed` login already
exists. On an accepted disposable instance it generates fresh passwords,
marks the roles it owns, and revokes privileges and drops both test logins
after each suite. A failed or interrupted cleanup deliberately causes the next
run to fail closed instead of altering the remaining login.

With the disposable database migrated, run the same proof used by CI:

```bash
PATHWAY_RUN_DB_INTEGRATION_TESTS=1 \
PATHWAY_RUN_DB_SEED_PROOF=1 \
pnpm --filter @pathway/db exec jest --runInBand --runTestsByPath \
  src/__tests__/system-role-seed-test-database.spec.ts \
  src/__tests__/seed-system-roles.spec.ts \
  src/__tests__/system-role-seed-command.spec.ts
```

#### Option 2: Using a Local Postgres Instance

1. Ensure PostgreSQL is running locally
2. Create test databases:

```sql
CREATE DATABASE pathway_test;
CREATE DATABASE pathway_test_e2e;
```

3. Configure `.env.test` with your local connection string
4. Run migrations and tests as above

### Test Naming Conventions

- **Unit tests**: `**/*.spec.ts` (e.g., `users.service.spec.ts`)
- **Integration tests**: `**/*.e2e.spec.ts` or `**/*.e2e-spec.ts` (e.g., `users.e2e.spec.ts`)

This convention allows Jest to automatically separate test types and run them independently.

## Linting & Formatting

To lint the entire repository:

```bash
pnpm turbo run lint
```

To format code:

```bash
pnpm turbo run format
```

## Environment Variables

Each app and package can have its own `.env` files. Make sure to create and configure the following environment files:

- `.env` - Base environment variables
- `.env.local` - Local overrides (should be gitignored)

Refer to the `.env.example` files in each directory for required variables.

### Local HTTPS for API (dev)

To run the Nest API over HTTPS on `https://api.localhost:3001` without browser certificate errors:

1. Add to your `/etc/hosts`:
   ```
   127.0.0.1 api.localhost
   ```
2. Generate local certs (requires [mkcert](https://github.com/FiloSottile/mkcert)):
   ```
   pnpm cert:api
   ```
   This writes:
   - `.cert/api.localhost.pem`
   - `.cert/api.localhost-key.pem`
3. In your `.env.local` (or `.env.example` for sharing defaults), set:
   ```
   API_DEV_SSL_CERT=.cert/api.localhost.pem
   API_DEV_SSL_KEY=.cert/api.localhost-key.pem
   API_HOST=api.localhost
   ```
4. Start the API; browse at `https://api.localhost:3001`.

## Docker Setup

### Legacy Docker Images

The Dockerfiles are retained for local container smoke tests and as a fallback
reference. The active production deployment path is Vercel and Supabase; do not
use these Docker images for the current production launch unless the deployment
strategy changes again.

- `apps/web/Dockerfile` - Next.js SSR marketing site
- `apps/admin/Dockerfile` - Next.js SSR admin dashboard
- `apps/api/Dockerfile` - NestJS API server

All Dockerfiles use multi-stage builds with Node.js 20 Alpine images for minimal size.

**Note:** Next.js apps (web and admin) build from the repository root using `pnpm --filter` to ensure workspace binaries (like `next`) are properly resolved. This is necessary because pnpm workspace symlinks require the full workspace context. The API Dockerfile also uses workspace-aware build commands for consistency.

#### Building Individual Images

Build each app's Docker image from the repository root:

```bash
# Build web app
docker build -f apps/web/Dockerfile -t pathway-web:latest .

# Build admin app
docker build -f apps/admin/Dockerfile -t pathway-admin:latest .

# Build API
docker build -f apps/api/Dockerfile -t pathway-api:latest .
```

#### Running Containers Locally

Start a single container:

```bash
# Run web app (exposes port 3001)
docker run -p 3001:3000 pathway-web:latest

# Run admin app (exposes port 3002)
docker run -p 3002:3000 pathway-admin:latest

# Run API (exposes port 3003)
docker run -p 3003:3001 pathway-api:latest
```

#### Docker Compose (Local Smoke Test)

Use the production-shaped docker-compose file for local testing:

```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up --build

# Run in detached mode
docker-compose -f docker-compose.prod.yml up -d --build

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Stop services
docker-compose -f docker-compose.prod.yml down
```

Services will be available on:

- Web: http://localhost:3001
- Admin: http://localhost:3002
- API: http://localhost:3003

**Note:** The services run on an internal network but expose ports for local testing. Production deploys are handled by Vercel and GitHub Actions as described below.

## CI/CD

This monorepo uses GitHub Actions for continuous integration. The CI pipeline runs on every push and pull request to `master` and `develop` branches.

### CI Commands

The CI workflow (`.github/workflows/ci.yml`) runs the following checks:

```bash
# Typecheck all packages and apps
pnpm -r typecheck

# Lint all packages and apps
pnpm -r lint

# Run unit tests (no database required)
pnpm test:unit
```

All checks must pass before code can be merged. The workflow:

- Uses pnpm with frozen lockfile for reproducible installs
- Caches the pnpm store for faster builds
- Fails fast on the first error (typecheck → lint → test:unit)
- Runs on Ubuntu latest with Node.js 20
- **Does not require a database** - only unit tests run by default

### Integration Tests in CI

Integration tests run in a separate, optional job that:

- Runs on `master`/`main` branch pushes, PRs, or manual trigger
- Uses a Postgres service container (ephemeral, isolated per run)
- Sets up test databases and runs migrations automatically
- Runs all integration tests with proper database isolation

To manually trigger integration tests in CI, use the "Run workflow" button in GitHub Actions.

### Local CI Checks

You can run the same checks locally before pushing:

```bash
# Typecheck
pnpm typecheck

# Lint
pnpm lint

# Unit tests (default, no DB required)
pnpm test:unit

# Integration tests (requires database)
pnpm test:integration
```

## Deployment

The active non-AWS deployment path is:

- Marketing and purchase web: Vercel, configured by `apps/web/vercel.json`.
- Admin app: Vercel, configured by `apps/admin/vercel.json`.
- API: Vercel Node function, configured by `apps/api/vercel.json` and `apps/api/api/[...path].ts`.
- Database: Supabase Postgres, deployed with Prisma migrations.
- File storage: Supabase Storage, accessed only by the backend API.
- Scheduled jobs: GitHub Actions cron in `.github/workflows/workers-scheduled.yml`.

Production deploys run through `.github/workflows/deploy.yml` using cached Vercel prebuilt artifacts. Production values should live in ignored `env.production`; run `pnpm env:production:prepare` if the current values are still in `.env.production` or `.env.prod`. Use `pnpm vercel:projects:setup` to dry-run the Vercel project setup before creating projects with `--apply`, then use `pnpm github:secrets:setup` to dry-run GitHub Actions production secrets. See `docs/TEMPORARY_FREE_EU_DEPLOYMENT.md` for the full production runbook, required secrets, DNS, provider callbacks, and smoke tests.

The old AWS/ECS task definition files under `infra/ecs/` are retained for reference only. They are not part of the active deployment path.

## Next Steps

- Add more detailed documentation for each app and package
- Integrate Storybook for UI components in `ui` package
- Expand testing coverage and add end-to-end tests
- Optimize Docker images and deployment pipelines
- Explore adding GraphQL support to the `api` app

---

Thank you for contributing to PathWay! If you have questions, please open an issue or reach out to the maintainers.
