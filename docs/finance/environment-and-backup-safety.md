# Finance environment and backup safety

## Scope

T16 keeps school payment traffic separated by deployment environment and makes
live Finance collection opt-in. Production configuration remains disabled until
the release gates are met. No production secret, payment account or deployment
is changed by this work.

## Stripe environment rules

| Deployment                  | Finance Connect mode                                     | Stripe credentials                                                                                    | Live switch        |
| --------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| Local development and tests | `disabled` by default; `test` may be selected explicitly | Stripe test credentials only                                                                          | `false` or unset   |
| Vercel Preview              | `disabled` by default; `test` may be selected explicitly | Preview-scoped test credentials and Finance test webhook secret                                       | `false` or unset   |
| Vercel Production           | `disabled` by default; test mode is rejected             | Production billing credentials; Finance live webhook secret only when live mode is explicitly enabled | `false` by default |

`FINANCE_STRIPE_LIVE_ENABLED=true` is accepted only when
`FINANCE_STRIPE_CONNECT_MODE=live`, `NODE_ENV=production`, and
`VERCEL_ENV=production`. Live mode also requires the existing matching live
billing provider and HTTPS Connect return/refresh URLs. A Vercel production
deployment rejects Finance test mode. Finance webhooks continue to use their
own mode-specific signing secret and raw request body; they do not fall back to
the SaaS subscription webhook secret. The Finance webhook inbox remains the
durable acceptance point before acknowledgement. Bacs remains test-only in the
provider binding.

The production Vercel sync script targets only the Production environment. It
does not copy Stripe test API keys, test webhook secrets, or test price maps.
Its Finance defaults are `FINANCE_STRIPE_CONNECT_MODE=disabled` and
`FINANCE_STRIPE_LIVE_ENABLED=false`. A test billing provider or Finance test
Connect mode fails production preflight. Preview test secrets must be added to
the Preview environment separately; do not copy a local `.env` file into
Production.

Store credentials in the hosting provider's environment-scoped secret store.
Keep local `.env` files untracked, use separate signing secrets for Finance and
subscription webhooks, and never put secret values in logs, build output, or
the progress record. Rotations must update the provider and webhook listener
in the same environment before retiring the old value.

## Backup and restore proof

CI runs migrations against a fresh PostgreSQL source database, inserts a
synthetic organisation, tenant and Finance profile, creates a custom-format
`pg_dump`, and restores it into a separate empty PostgreSQL database. The
smoke check verifies the Finance profile and forced RLS state in the restored
database. It uses no customer data, provider credentials or external database.
The smoke script refuses non-local databases and requires the explicit
disposable-test token.

This test proves schema and representative Finance data can be restored from
the current migrations in the CI PostgreSQL version. It does not prove
production backup freshness, managed-provider point-in-time recovery, private
document object restore, or live cutover. Those remain release-assurance work;
the existing [platform restore record](../ace-vertical/runbooks/new-project-backup-restore.md)
documents the separate Supabase project restore rehearsal and its limits.

## Verification and rollback

- Test mode remains available in local and Preview environments for the
  authorized sandbox work.
- Finance live Connect and Finance live webhook processing remain disabled
  unless the production-only switch is deliberately configured.
- The database restore check runs only against fresh CI databases and is not
  wired to production deployment.
- Reverting this step removes the new environment gate and restore check; no
  schema migration or external resource needs rollback.
