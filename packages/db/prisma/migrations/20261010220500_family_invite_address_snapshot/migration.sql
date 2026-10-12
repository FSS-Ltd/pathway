-- Keep the addressed email when a verified guardian accepts through a
-- different internal User row (for example, a first Clerk sign-in without
-- email claims). Existing invitations inherit the current user email where
-- available; null remains valid for historical invitations without one.
DO $$
DECLARE
  invite_schema text;
  user_schema text;
  found_invite boolean := false;
BEGIN
  FOR invite_schema IN
    SELECT namespace.nspname
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relname = 'FamilyIdentityInvite'
      AND relation.relkind IN ('r', 'p')
      AND namespace.nspname IN ('app', 'public')
  LOOP
    found_invite := true;
    EXECUTE format(
      'ALTER TABLE %I."FamilyIdentityInvite" ADD COLUMN IF NOT EXISTS "invitedEmail" TEXT',
      invite_schema
    );

    SELECT namespace.nspname INTO user_schema
    FROM pg_catalog.pg_class relation
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE relation.relname = 'User'
      AND relation.relkind IN ('r', 'p', 'v')
      AND namespace.nspname IN ('app', 'public')
    ORDER BY (namespace.nspname = invite_schema) DESC
    LIMIT 1;
    IF user_schema IS NULL THEN
      RAISE EXCEPTION 'User relation is unavailable for family invite email backfill';
    END IF;

    EXECUTE format(
      'UPDATE %1$I."FamilyIdentityInvite" AS invite
       SET "invitedEmail" = lower(btrim(source."email"))
       FROM %2$I."User" AS source
       WHERE invite."invitedUserId" = source."id"
         AND invite."invitedEmail" IS NULL
         AND source."email" IS NOT NULL',
      invite_schema,
      user_schema
    );
  END LOOP;

  IF NOT found_invite THEN
    RAISE EXCEPTION 'FamilyIdentityInvite relation is unavailable';
  END IF;
END $$;
