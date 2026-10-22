# NexSteps API production recovery

## Incident

On 2026-10-22, production `/health` and `/health/env` returned HTTP 500. The
investigation found repeated `EMFILE: too many open files` errors while Vercel
loaded the API function. The failures affected authentication, blog requests,
and scheduled jobs across multiple deployments. Vercel limits each function
instance to 1,024 shared file descriptors.

The repair compiles the API handler at build time, narrows production function
files to the generated bundle and required Prisma runtime assets, and checks
database-backed health after each API production deployment.

## Delivery evidence

- Startup bundle PR [#724](https://github.com/FSS-Ltd/pathway/pull/724)
  merged as `f76cd34c9aad82546496b67879a81f981d69ba63` with passing CI.
- Production workflow [39733639646](https://github.com/FSS-Ltd/pathway/actions/runs/39733639646)
  failed twice after the API build completed, at deployment output finalization.
- Local Vercel CLI 64.7.0 reproduced the failure in preview
  `dpl_DM7k2zY61VRstiNouT3J23D2GTjm`: `EEXIST` creating the Prisma package
  symlink after explicit included files had already created its destination.
- Removing only the directory mapping from generated output produced READY
  preview `dpl_CRs3YpJaVnS5YQxi94VCu5r6vFzu`. Its `/health/env` returned 500:
  the function wrapper used ESM syntax inside an explicitly CommonJS package.
- Follow-up repair: `fix/api-vercel-artifact-packaging`, based on master
  `e0c016e41a781c998b62c3965ff66935d1395eff`. PR, CI, working Linux preview,
  merge and production recovery remain pending.
- Source repair relies on Vercel tracing for Prisma runtime modules, retains
  explicit generated-client/engine/schema assets, and exports the wrapper using
  CommonJS. The staged artifact test now includes the wrapper's package.json.

## Follow-up local verification

- Node 24 Vercel preview build passed with the source repair.
- Generated filePathMap has no Prisma directory/child-file collision.
- CommonJS wrapper syntax and require smoke test passed.
- API lint, typecheck, formatting, focused configuration test and all 332 unit
  suites / 2,135 tests passed. Jest reported a force-exited worker after passing.
- Workspace lint passed. Local Docker is unavailable; the database-backed
  artifact and integration checks must pass in CI.

## Earlier verification

- Local TypeScript build and ncc bundle: passed with Node 24 and ncc 0.45.0.
- API lint, TypeScript typecheck, and Prettier checks: passed.
- API unit suite: 327 suites and 2,117 tests passed under Node 20. Jest reported
  one worker needed force-exit after the suite completed.
- Finance PDF generation with the real renderer: passed.
- Node 24 artifact test with a 1,024 descriptor limit: attempted, but the
  database-backed `/health` assertion returned 500 because the local Docker
  daemon was unavailable and the disposable Postgres service could not start.
  On the relocated artifact layout, staging, bundle import, both `/health/env`
  routes, allowed-origin preflight, and unauthenticated auth response passed
  before the same database-only failure. The full artifact test remains required
  in CI, where it uses a fresh Postgres service.
- `graphify update .`: passed after the code changes.
- Protected Vercel preview `dpl_7wSQpF6inGJWBJh6xoy2Z9hoZegA` failed during
  Vercel's independent route TypeScript check. Vercel treated bootstrap sources
  under `apps/api/api/` as function entrypoints and reported TS2835 extension
  errors in compliance catalogue imports. The sources have been moved outside
  the route directory; a corrected preview and its health checks are pending.
- Production `/health`, `/health/env`, auth preflight, and public blog reads:
  pending.
- Runtime logs and scheduled jobs observed for 15 minutes: pending.

Do not mark this recovery complete until the current PR revision has passing CI,
the PR is merged, production endpoints pass, and the 15-minute observation has
no startup or `EMFILE` recurrence.
