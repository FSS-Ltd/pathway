-- Realtime authorisation reads the signed, short-lived JWT supplied by the
-- API. Message tables stay in app; older identity tables may be in public on
-- restored databases and in app on fresh databases.
CREATE OR REPLACE FUNCTION app.authorize_ace_realtime_topic(requested_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  core_schema text;
  identity_schema text;
  allowed boolean;
BEGIN
  IF requested_topic !~ '^ace:conversation:[0-9a-f-]{36}$' THEN
    RETURN false;
  END IF;

  claims := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  IF claims ->> 'role' <> 'authenticated'
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(
        CASE WHEN pg_catalog.jsonb_typeof(claims -> 'ace_realtime_topics') = 'array'
          THEN claims -> 'ace_realtime_topics' ELSE '[]'::jsonb END
      ) AS topic(value)
      WHERE topic.value = requested_topic
    )
    OR COALESCE(claims ->> 'sub', '') = ''
    OR COALESCE(claims ->> 'ace_site_id', '') = ''
    OR COALESCE(claims ->> 'ace_org_id', '') = ''
  THEN
    RETURN false;
  END IF;

  IF pg_catalog.to_regclass('app."Tenant"') IS NOT NULL
    AND pg_catalog.to_regclass('app."PermissionDefinition"') IS NOT NULL
    AND pg_catalog.to_regclass('app."SiteMembership"') IS NOT NULL
  THEN
    core_schema := 'app';
  ELSIF pg_catalog.to_regclass('public."Tenant"') IS NOT NULL
    AND pg_catalog.to_regclass('public."PermissionDefinition"') IS NOT NULL
    AND pg_catalog.to_regclass('public."SiteMembership"') IS NOT NULL
  THEN
    core_schema := 'public';
  ELSE
    RETURN false;
  END IF;

  IF pg_catalog.to_regclass('app."GuardianIdentity"') IS NOT NULL
    AND pg_catalog.to_regclass('app."GuardianChildRelationship"') IS NOT NULL
  THEN
    identity_schema := 'app';
  ELSIF pg_catalog.to_regclass('public."GuardianIdentity"') IS NOT NULL
    AND pg_catalog.to_regclass('public."GuardianChildRelationship"') IS NOT NULL
  THEN
    identity_schema := 'public';
  ELSE
    RETURN false;
  END IF;

  EXECUTE pg_catalog.format($query$
    SELECT EXISTS (
      SELECT 1
      FROM app."MessageConversation" conversation
      JOIN app."MessageParticipant" participant
        ON participant."conversationId" = conversation."id"
       AND participant."tenantId" = conversation."tenantId"
      JOIN %1$I."Tenant" site ON site."id" = conversation."tenantId"
      JOIN %1$I."Org" organisation ON organisation."id" = site."orgId"
      JOIN %1$I."User" account ON account."id" = participant."userId"
      JOIN %1$I."OrgVertical" vertical ON vertical."orgId" = site."orgId"
      JOIN %1$I."PermissionDefinition" permission
        ON permission."key" = 'messaging.messages.read'
      WHERE conversation."id" = $1
        AND conversation."tenantId" = $2
        AND site."orgId" = $3
        AND participant."userId" = $4
        AND participant."removedAt" IS NULL
        AND account."isActive" = true
        AND vertical."vertical" = 'ACE_SCHOOL'
        AND permission."isActive" = true
        AND (
          (
            participant."kind" = 'STAFF'
            AND EXISTS (
              SELECT 1 FROM %1$I."SiteMembership" membership
              WHERE membership."tenantId" = site."id"
                AND membership."userId" = account."id"
                AND membership."role" IN ('SITE_ADMIN', 'STAFF')
            )
            AND NOT EXISTS (
              SELECT 1 FROM %1$I."StudentIdentity" student
              WHERE student."tenantId" = site."id"
                AND student."userId" = account."id"
            )
            AND (
              account."superUser" = true
              OR EXISTS (
                SELECT 1 FROM %1$I."UserRoleAssignment" assignment
                JOIN %1$I."OrgRoleDefinition" role
                  ON role."id" = assignment."roleDefinitionId"
                JOIN %1$I."OrgRolePermission" role_permission
                  ON role_permission."roleDefinitionId" = role."id"
                WHERE assignment."userId" = account."id"
                  AND assignment."orgId" = site."orgId"
                  AND assignment."startsAt" <= CURRENT_TIMESTAMP
                  AND (assignment."expiresAt" IS NULL OR assignment."expiresAt" > CURRENT_TIMESTAMP)
                  AND assignment."revokedAt" IS NULL
                  AND role."isActive" = true
                  AND role_permission."permissionKey" = 'messaging.messages.read'
                  AND (
                    (role."scope" = 'organisation' AND role."tenantId" IS NULL AND assignment."tenantId" IS NULL)
                    OR (role."scope" = 'site' AND role."tenantId" = site."id" AND assignment."tenantId" = site."id")
                  )
              )
            )
            AND (
              conversation."kind" IN ('STAFF_DIRECT', 'STAFF_ROOM')
              OR (
                conversation."kind" = 'PARENT_STAFF'
                AND organisation."parentPortalEnabled" = true
                AND (
                  EXISTS (
                    SELECT 1 FROM %1$I."UserRoleAssignment" responder_assignment
                    JOIN %1$I."OrgRoleDefinition" responder_role
                      ON responder_role."id" = responder_assignment."roleDefinitionId"
                    JOIN %1$I."OrgRolePermission" responder_permission
                      ON responder_permission."roleDefinitionId" = responder_role."id"
                    WHERE responder_assignment."userId" = account."id"
                      AND responder_assignment."orgId" = site."orgId"
                      AND responder_assignment."startsAt" <= CURRENT_TIMESTAMP
                      AND (responder_assignment."expiresAt" IS NULL OR responder_assignment."expiresAt" > CURRENT_TIMESTAMP)
                      AND responder_assignment."revokedAt" IS NULL
                      AND responder_role."isSystem" = true
                      AND responder_role."isActive" = true
                      AND responder_permission."permissionKey" = 'messaging.messages.send'
                      AND (
                        (responder_role."name" = 'Organisation Head' AND responder_role."tenantId" IS NULL AND responder_assignment."tenantId" IS NULL)
                        OR (responder_role."name" = 'Site Lead' AND responder_role."tenantId" = site."id" AND responder_assignment."tenantId" = site."id")
                      )
                  )
                  OR EXISTS (
                    SELECT 1 FROM %1$I."AccessTagGrant" responder_tag
                    WHERE responder_tag."userId" = account."id"
                      AND responder_tag."orgId" = site."orgId"
                      AND responder_tag."tagKey" = 'parent-message-responder'
                      AND (responder_tag."tenantId" IS NULL OR responder_tag."tenantId" = site."id")
                      AND responder_tag."startsAt" <= CURRENT_TIMESTAMP
                      AND (responder_tag."expiresAt" IS NULL OR responder_tag."expiresAt" > CURRENT_TIMESTAMP)
                      AND responder_tag."revokedAt" IS NULL
                  )
                )
                AND EXISTS (
                  SELECT 1 FROM app."MessageParticipant" guardian_participant
                  JOIN %2$I."GuardianIdentity" guardian
                    ON guardian."id" = guardian_participant."guardianIdentityId"
                   AND guardian."tenantId" = site."id"
                   AND guardian."userId" = guardian_participant."userId"
                  JOIN %2$I."GuardianChildRelationship" relationship
                    ON relationship."guardianIdentityId" = guardian."id"
                   AND relationship."tenantId" = site."id"
                  JOIN %1$I."Child" child
                    ON child."id" = relationship."childId"
                   AND child."tenantId" = site."id"
                  WHERE guardian_participant."conversationId" = conversation."id"
                    AND guardian_participant."tenantId" = site."id"
                    AND guardian_participant."kind" = 'GUARDIAN'
                    AND guardian_participant."removedAt" IS NULL
                    AND guardian."id" = conversation."guardianIdentityId"
                    AND relationship."legalAccess" = 'FULL'
                    AND relationship."startsAt" <= CURRENT_TIMESTAMP
                    AND relationship."endedAt" IS NULL
                    AND relationship."revokedAt" IS NULL
                    AND child."isGuest" = false
                )
              )
            )
          )
          OR (
            participant."kind" = 'GUARDIAN'
            AND conversation."kind" = 'PARENT_STAFF'
            AND organisation."parentPortalEnabled" = true
            AND participant."guardianIdentityId" = conversation."guardianIdentityId"
            AND EXISTS (
              SELECT 1 FROM %2$I."GuardianIdentity" guardian
              JOIN %2$I."GuardianChildRelationship" relationship
                ON relationship."guardianIdentityId" = guardian."id"
               AND relationship."tenantId" = guardian."tenantId"
              JOIN %1$I."Child" child
                ON child."id" = relationship."childId"
               AND child."tenantId" = guardian."tenantId"
              WHERE guardian."id" = participant."guardianIdentityId"
                AND guardian."tenantId" = site."id"
                AND guardian."userId" = account."id"
                AND relationship."legalAccess" = 'FULL'
                AND relationship."startsAt" <= CURRENT_TIMESTAMP
                AND relationship."endedAt" IS NULL
                AND relationship."revokedAt" IS NULL
                AND child."isGuest" = false
            )
            AND NOT EXISTS (
              SELECT 1 FROM %1$I."StudentIdentity" student
              WHERE student."tenantId" = site."id"
                AND student."userId" = account."id"
            )
          )
        )
    )
  $query$, core_schema, identity_schema)
    INTO allowed
    USING substring(requested_topic FROM 18),
          claims ->> 'ace_site_id', claims ->> 'ace_org_id', claims ->> 'sub';

  RETURN COALESCE(allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION app.authorize_ace_realtime_topic(text) FROM PUBLIC;

-- Supabase owns the realtime schema. Local PostgreSQL may omit it entirely.
DO $$
BEGIN
  IF pg_catalog.to_regclass('realtime.messages') IS NOT NULL
    AND pg_catalog.to_regprocedure('realtime.topic()') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated')
  THEN
    DROP POLICY IF EXISTS "ace_message_topics_receive" ON realtime.messages;
    DROP POLICY IF EXISTS "ace_message_topics_scope" ON realtime.messages;
    DROP POLICY IF EXISTS "ace_message_topics_no_publish" ON realtime.messages;

    CREATE POLICY "ace_message_topics_receive"
      ON realtime.messages AS PERMISSIVE FOR SELECT TO authenticated
      USING (
        extension = 'broadcast' AND private = true
        AND realtime.topic() LIKE 'ace:conversation:%'
        AND app.authorize_ace_realtime_topic(realtime.topic())
      );

    CREATE POLICY "ace_message_topics_scope"
      ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated
      USING (
        realtime.topic() NOT LIKE 'ace:conversation:%'
        OR (
          extension = 'broadcast' AND private = true
          AND app.authorize_ace_realtime_topic(realtime.topic())
        )
      );

    CREATE POLICY "ace_message_topics_no_publish"
      ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (realtime.topic() NOT LIKE 'ace:conversation:%');

    GRANT USAGE ON SCHEMA app TO authenticated;
    GRANT EXECUTE ON FUNCTION app.authorize_ace_realtime_topic(text) TO authenticated;
  END IF;
END;
$$;
