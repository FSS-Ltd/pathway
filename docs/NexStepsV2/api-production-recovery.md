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

- Step: standalone API startup and file-descriptor repair.
- Branch: `fix/api-startup-file-descriptors` from `master` at
  `7e4f1db9e2cb8aa1933f9b7ce17c771aba9847c6`.
- Pull request: [#724](https://github.com/FSS-Ltd/pathway/pull/724), open as a
  draft.
- Checked revision: `9db15079df22856c2ce9f308f8fe9c20b3a88f13` (the preview
  failure led to a source-layout fix now being verified locally).
- Required CI and review: artifact CI and both CodeQL analyses passed on the
  checked revision; workspace CI was still running. Approval and current-revision
  CI are pending.
- Merge commit: pending.
- Production deployment: pending.

## Verification

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
