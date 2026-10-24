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
durable acceptance point before acknowledgement. Bacs follows the same mode: with
`FINANCE_STRIPE_CONNECT_MODE=live` and the live switch on, Bacs customers, mandates and debits
are created in live mode; every stored mandate, customer and account must be in the configured
mode, and a mismatch is refused. With collection disabled, Bacs is off.

T17 separates existing-record servicing from new collection. With collection
disabled, configure `FINANCE_STRIPE_SERVICING_MODE=test` or `live` and the
matching `FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST` or
`FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE` in that environment's secret store.
Prefer a restricted key with only the required account-read, payment-read,
settlement-read and approved-refund permissions. The application validates
the key's mode; Stripe enforces its actual permissions. It does not fall back
to another environment's key or the SaaS webhook secret.

Existing enabled collection configuration remains a backward-compatible
servicing source. An explicit servicing key takes precedence. Live servicing
requires the Production runtime but does not require the new-collection live
switch. Test servicing is rejected in Production; live servicing is rejected
in Preview and local development. Webhook verification, refund servicing,
account-status reads and provider reports use this servicing configuration.
The optional explicit `disabled` servicing mode stops those provider paths;
it is an incident stop, and queued evidence must be recovered afterwards.
No environment or credential is enabled by this source change.

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
- Finance live Connect remains disabled unless the production-only collection
  switch is deliberately configured. Existing live-record servicing requires
  its separate explicit Production configuration when collection is disabled.
- The database restore check runs only against fresh CI databases and is not
  wired to production deployment.
- Reverting this step removes the new environment gate and restore check; no
  schema migration or external resource needs rollback.

### Mandate servicing with collection disabled

T17 binds existing-mandate reads/cancellation to `FINANCE_STRIPE_SERVICING_CONFIG`, including the stored operation's account and test/live mode. New Bacs customer/setup/debit creation uses the collection binding and follows its test or live mode. The servicing key must permit the required historical GETs and the two cancellation endpoints (`payment_methods/:id/detach` and `checkout/sessions/:id/expire`). Restricted-key configuration is covered by unit contracts; the actual Sandbox read proof used the user's existing named test key. No environment or secret was changed by that proof. Failed cancellation retains local `providerCancellationPending`; it never reinstates a locally cancelled collection plan.
