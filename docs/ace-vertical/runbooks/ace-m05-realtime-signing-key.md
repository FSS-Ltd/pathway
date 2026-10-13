# ACE-M05 Realtime signing key rollout

ACE-M05 signs two-minute Realtime claims with an imported ES256 private JWK.
`SUPABASE_JWT_SECRET` and `SUPABASE_LEGACY_JWT_SECRET` are not used by this flow.
The private JWK can mint tokens for the Supabase project, so keep it only in an
approved encrypted secret store and the `nexsteps-api` production environment.
Never put it in source, CI output, this document, or a browser environment.

1. Inventory any application or integration that verifies Supabase Auth tokens.
   Activating a new signing key changes the key used for newly issued project
   tokens. Supabase keeps the previous key trusted until it is revoked.
2. On a trusted machine, generate an ES256 JWK with
   `supabase gen signing-key --algorithm ES256`. Import that private JWK as a
   standby key in the restored project's **JWT signing keys** dashboard. Record
   its `kid`, but not the private fields, in the release evidence.
3. Set the same complete JWK JSON as the encrypted production
   `SUPABASE_JWT_SIGNING_JWK` variable for `nexsteps-api`. Keep
   `SUPABASE_PUBLISHABLE_KEY` pointed at the same Supabase project.
4. With production change authorization, activate the imported key. Confirm
   the dashboard shows it **In use** and that its `kid` appears in the public
   JWKS endpoint. A standby key also appears in JWKS, so discovery alone does
   not prove activation. Verify affected Supabase Auth clients can obtain and
   use new tokens.
5. Verify PR #616's `20261013140000_ace_private_message_realtime` migration
   and its private `realtime.messages` policies on the production project, then
   smoke-test an allowed conversation and a denied cross-conversation
   subscription. The web client must still refetch REST history after reconnect.
6. After successful verification, remove the unused legacy JWT variables from
   `nexsteps-api`. Do not revoke the previous project key until its valid tokens
   have expired and all consumers have been checked.

If Realtime verification fails, remove `SUPABASE_JWT_SIGNING_JWK` from the API
environment and redeploy to disable new token issuance; REST polling remains available. If
the project key rotation itself affects Auth clients, use Supabase's supported
rotation rollback after checking their current tokens and key state. Do not
delete or revoke keys as an improvised rollback.

Reference: [Supabase JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys).
