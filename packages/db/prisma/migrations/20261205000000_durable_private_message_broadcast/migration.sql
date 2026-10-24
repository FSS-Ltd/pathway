-- Durable, commit-coupled private Broadcast. Existing domain/outbox records remain
-- authoritative. SQL enqueue failures abort the source mutation; network outages
-- do not. Run activation and consumer installation atomically.
BEGIN;

-- One predicate serves subscription authorization and batched publication.
-- Preserve the existing staff/guardian, legal-access and responder checks.
CREATE FUNCTION app.ace_realtime_recipients(
  conversation_id text, site_id text, organisation_id text, requested_user_id text DEFAULT NULL
) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  core_schema text;
  identity_schema text;
BEGIN
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
    RETURN;
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
    RETURN;
  END IF;

  RETURN QUERY EXECUTE pg_catalog.format($query$
    SELECT DISTINCT participant."userId"
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
        AND ($4 IS NULL OR participant."userId" = $4)
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
                  JOIN %1$I."User" guardian_account
                    ON guardian_account."id" = guardian."userId"
                   AND guardian_account."isActive" = true
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
                    AND NOT EXISTS (
                      SELECT 1 FROM %1$I."StudentIdentity" guardian_student
                      WHERE guardian_student."tenantId" = site."id"
                        AND guardian_student."userId" = guardian."userId"
                    )
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
  $query$, core_schema, identity_schema)
    USING conversation_id, site_id, organisation_id, requested_user_id;
END;
$$;
REVOKE ALL ON FUNCTION app.ace_realtime_recipients(text, text, text, text) FROM PUBLIC;
-- CREATE OR REPLACE preserves the existing authorization function owner. Grant
-- its definer access even when a restored database has a different migration role.
DO $$
DECLARE authorization_owner text;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(proowner) INTO authorization_owner
    FROM pg_catalog.pg_proc WHERE oid = 'app.authorize_ace_realtime_topic(text)'::regprocedure;
  EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION app.ace_realtime_recipients(text, text, text, text) TO %I', authorization_owner);
END;
$$;

CREATE OR REPLACE FUNCTION app.authorize_ace_realtime_topic(requested_topic text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claims jsonb;
  conversation_id text;
BEGIN
  claims := COALESCE(NULLIF(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  conversation_id := claims ->> 'ace_realtime_conversation_id';
  IF claims ->> 'role' IS DISTINCT FROM 'authenticated'
    OR COALESCE(claims ->> 'sub', '') = ''
    OR COALESCE(claims ->> 'ace_site_id', '') = ''
    OR COALESCE(claims ->> 'ace_org_id', '') = ''
    OR COALESCE(conversation_id, '') = ''
    OR requested_topic IS DISTINCT FROM 'ace:conversation:site:'
      || pg_catalog.encode(pg_catalog.convert_to(claims ->> 'ace_site_id', 'UTF8'), 'hex')
      || ':user:' || pg_catalog.encode(pg_catalog.convert_to(claims ->> 'sub', 'UTF8'), 'hex')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(
        CASE WHEN pg_catalog.jsonb_typeof(claims -> 'ace_realtime_topics') = 'array'
          THEN claims -> 'ace_realtime_topics' ELSE '[]'::jsonb END
      ) AS topic(value) WHERE topic.value = requested_topic
    )
  THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM app.ace_realtime_recipients(
    conversation_id, claims ->> 'ace_site_id', claims ->> 'ace_org_id', claims ->> 'sub'
  ));
END;
$$;
REVOKE ALL ON FUNCTION app.authorize_ace_realtime_topic(text) FROM PUBLIC;

-- Called only by the outbox trigger and bounded installation reconciliation.
-- Never accept a client topic or arbitrary Broadcast payload.
CREATE FUNCTION app.enqueue_message_realtime_notification(outbox_schema text, notification_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  intent record;
  site_id text;
  source_org_id text;
  core_schema text;
  event_name text;
  safe_payload jsonb;
BEGIN
  IF outbox_schema NOT IN ('app', 'public') THEN RAISE EXCEPTION 'Invalid notification schema'; END IF;
  EXECUTE pg_catalog.format('SELECT * FROM %I."OutboxEvent" WHERE "id" = $1 FOR UPDATE', outbox_schema)
    INTO intent USING notification_id;
  IF intent."id" IS NULL THEN RETURN; END IF;
  IF intent."status" <> 'PENDING' THEN RETURN; END IF;
  IF intent."orgId" IS DISTINCT FROM app.current_org_id()
    OR intent."aggregateType" <> 'REALTIME_CONVERSATION'
    OR intent."payload" ->> 'conversationId' IS DISTINCT FROM intent."aggregateId"
  THEN RAISE EXCEPTION 'Invalid notification scope' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT conversation."tenantId" INTO site_id
    FROM app."MessageConversation" conversation WHERE conversation."id" = intent."aggregateId";
  core_schema := CASE WHEN pg_catalog.to_regclass('app."Tenant"') IS NOT NULL THEN 'app' ELSE 'public' END;
  EXECUTE pg_catalog.format('SELECT "orgId" FROM %I."Tenant" WHERE "id" = $1', core_schema)
    INTO source_org_id USING site_id;
  IF source_org_id IS DISTINCT FROM intent."orgId" OR site_id IS NULL THEN
    RAISE EXCEPTION 'Invalid notification conversation' USING ERRCODE = 'insufficient_privilege';
  END IF;
  CASE intent."eventType"
    WHEN 'realtime.message.created' THEN
      event_name := 'message.created';
      IF NOT EXISTS (SELECT 1 FROM app."Message" message WHERE message."id" = intent."payload" ->> 'messageId'
        AND message."conversationId" = intent."aggregateId" AND message."tenantId" = site_id) THEN
        RAISE EXCEPTION 'Invalid notification message';
      END IF;
      safe_payload := pg_catalog.jsonb_build_object('type', event_name,
        'conversationId', intent."aggregateId", 'messageId', intent."payload" ->> 'messageId');
    WHEN 'realtime.conversation.read' THEN
      event_name := 'conversation.read';
      safe_payload := pg_catalog.jsonb_build_object('type', event_name,
        'conversationId', intent."aggregateId", 'readerScope', 'participant');
    ELSE RAISE EXCEPTION 'Unsupported notification event';
  END CASE;
  -- realtime.send swallows queue errors on supported provider versions. A strict
  -- insert preserves atomicity. Each recipient row has its own provider queue ID;
  -- notificationId is stable across recipients and reconciliation.
  INSERT INTO realtime.messages (topic, extension, event, payload, private)
    SELECT 'ace:conversation:site:' || pg_catalog.encode(pg_catalog.convert_to(site_id, 'UTF8'), 'hex')
      || ':user:' || pg_catalog.encode(pg_catalog.convert_to(recipient, 'UTF8'), 'hex'),
      'broadcast', event_name,
      safe_payload || pg_catalog.jsonb_build_object('id', intent."id", 'notificationId', intent."id"), true
    FROM app.ace_realtime_recipients(intent."aggregateId", site_id, source_org_id) AS recipient;
  EXECUTE pg_catalog.format($update$UPDATE %I."OutboxEvent" SET "status" = 'DISPATCHED',
    "attempts" = "attempts" + 1, "dispatchedAt" = CURRENT_TIMESTAMP WHERE "id" = $1$update$, outbox_schema)
    USING notification_id;
END;
$$;
REVOKE ALL ON FUNCTION app.enqueue_message_realtime_notification(text, text) FROM PUBLIC;

CREATE FUNCTION app.deliver_message_realtime_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW."eventType" IN ('realtime.message.created', 'realtime.conversation.read') THEN
    PERFORM app.enqueue_message_realtime_notification(TG_TABLE_SCHEMA, NEW."id");
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.deliver_message_realtime_notification() FROM PUBLIC;

-- The activation default is a function, not a database parameter: Supabase denies
-- ALTER FUNCTION ... SET for custom parameters to the migration role. The app roles
-- that fire the capture trigger call it, so it keeps its default PUBLIC execute.
CREATE FUNCTION app.realtime_capture_default()
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$ SELECT 'off'::text $$;

-- Capture notification intent in the source transaction. The installed consumer
-- enqueues private recipient invalidations within the same commit boundary.
-- No source rows are backfilled and no browser/Data API privileges are granted.
CREATE OR REPLACE FUNCTION app.capture_message_realtime_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  source_org_id text;
  notification_type text;
  notification_payload jsonb;
  notification_key text;
BEGIN
  -- A function-bound default applies to existing pools immediately. Explicit
  -- connection overrides remain available for controlled maintenance.
  IF COALESCE(NULLIF(pg_catalog.current_setting('app.realtime_capture_enabled', true), ''),
    app.realtime_capture_default(), 'off') <> 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'Message' AND TG_OP = 'INSERT' THEN
    notification_type := 'message.created';
    notification_payload := pg_catalog.jsonb_build_object(
      'type', notification_type,
      'conversationId', NEW."conversationId",
      'messageId', NEW."id"
    );
    notification_key := 'realtime:message.created:' || NEW."id";
  ELSIF TG_TABLE_NAME = 'MessageParticipantReadCursor' THEN
    IF NEW."lastReadSequence" <= 0 THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW."lastReadSequence" <= OLD."lastReadSequence" THEN
        RETURN NEW;
      END IF;
    END IF;
    notification_type := 'conversation.read';
    notification_payload := pg_catalog.jsonb_build_object(
      'type', notification_type,
      'conversationId', NEW."conversationId",
      'readerScope', 'participant'
    );
    notification_key := 'realtime:conversation.read:' || NEW."id" || ':' || NEW."lastReadSequence"::text;
  ELSE
    RAISE EXCEPTION 'Unsupported realtime notification source';
  END IF;

  -- The site owns the organisation boundary; never take it from notification input.
  EXECUTE pg_catalog.format(
    'SELECT "orgId" FROM %I."Tenant" WHERE "id" = $1', TG_ARGV[0]
  ) INTO source_org_id USING NEW."tenantId";
  IF source_org_id IS NULL OR source_org_id IS DISTINCT FROM app.current_org_id() THEN
    RAISE EXCEPTION 'Realtime notification organisation context mismatch'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Reuse the existing forced-RLS outbox and its organisation idempotency key.
  -- The realtime.* namespace belongs exclusively to the realtime dispatcher.
  EXECUTE pg_catalog.format($insert$
    INSERT INTO %I."OutboxEvent" (
      "id", "orgId", "aggregateType", "aggregateId", "eventType", "payload", "idempotencyKey"
    ) VALUES ($1, $2, 'REALTIME_CONVERSATION', $3, $4, $5, $6)
    ON CONFLICT ("orgId", "idempotencyKey") DO NOTHING
  $insert$, TG_ARGV[1])
  USING pg_catalog.gen_random_uuid()::text, source_org_id, NEW."conversationId",
    'realtime.' || notification_type, notification_payload, notification_key;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.capture_message_realtime_notification() FROM PUBLIC;

DO $$
DECLARE
  outbox_schema text;
  pending record;
  backlog integer;
  previous_org text := pg_catalog.current_setting('app.org_id', true);
BEGIN
  outbox_schema := CASE WHEN pg_catalog.to_regclass('app."OutboxEvent"') IS NOT NULL THEN 'app' ELSE 'public' END;
  IF pg_catalog.to_regclass('realtime.messages') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE pg_catalog.format('CREATE TRIGGER "OutboxEvent_deliver_realtime" AFTER INSERT ON %I."OutboxEvent"
    FOR EACH ROW EXECUTE FUNCTION app.deliver_message_realtime_notification()', outbox_schema);
  -- The 1.1 default was off. Unexpected larger backlog requires an explicit
  -- release investigation, not an unbounded migration scan/notification flood.
  EXECUTE pg_catalog.format($backlog$SELECT count(*) FROM (SELECT 1 FROM %I."OutboxEvent"
    WHERE "aggregateType" = 'REALTIME_CONVERSATION' AND "status" = 'PENDING' LIMIT 51) pending$backlog$, outbox_schema) INTO backlog;
  IF backlog > 50 THEN RAISE EXCEPTION 'Realtime activation backlog exceeds 50; reconcile before release'; END IF;
  FOR pending IN EXECUTE pg_catalog.format($pending$SELECT "id", "orgId" FROM %I."OutboxEvent"
    WHERE "aggregateType" = 'REALTIME_CONVERSATION' AND "status" = 'PENDING' LIMIT 50$pending$, outbox_schema) LOOP
    PERFORM pg_catalog.set_config('app.org_id', pending."orgId", true);
    PERFORM app.enqueue_message_realtime_notification(outbox_schema, pending."id");
  END LOOP;
  PERFORM pg_catalog.set_config('app.org_id', COALESCE(previous_org, ''), true);
  CREATE OR REPLACE FUNCTION app.realtime_capture_default()
  RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $fn$ SELECT 'on'::text $fn$;
END;
$$;
COMMIT;
