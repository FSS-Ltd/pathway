-- Resolve participant eligibility beside the triggering participant row.
CREATE OR REPLACE FUNCTION app.assert_message_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conversation_kind text;
  conversation_guardian_identity_id text;
  conversation_found boolean;
  guardian_matches boolean;
  relationship_current boolean;
  staff_is_member boolean;
  participant_is_student boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."conversationId" IS DISTINCT FROM OLD."conversationId"
    OR NEW."userId" IS DISTINCT FROM OLD."userId"
    OR NEW."kind" IS DISTINCT FROM OLD."kind"
    OR NEW."guardianIdentityId" IS DISTINCT FROM OLD."guardianIdentityId"
    OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt"
  ) THEN
    RAISE EXCEPTION 'Message participant identity is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT conversation."kind"::text,
            conversation."guardianIdentityId", true
       FROM %I."MessageConversation" conversation
      WHERE conversation."id" = $1
        AND conversation."tenantId" = $2',
    TG_TABLE_SCHEMA
  ) INTO conversation_kind, conversation_guardian_identity_id,
         conversation_found
  USING NEW."conversationId", NEW."tenantId";

  IF conversation_found IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Message conversation does not belong to tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."kind" = 'GUARDIAN' THEN
    IF conversation_kind <> 'PARENT_STAFF'
      OR NEW."guardianIdentityId" IS NULL
      OR NEW."guardianIdentityId" IS DISTINCT FROM conversation_guardian_identity_id
    THEN
      RAISE EXCEPTION 'Guardian participants require their parent/staff conversation identity'
        USING ERRCODE = 'check_violation';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."GuardianIdentity" guardian_identity
          WHERE guardian_identity."id" = $1
            AND guardian_identity."tenantId" = $2
            AND guardian_identity."userId" = $3
       )',
      TG_TABLE_SCHEMA
    ) INTO guardian_matches
    USING NEW."guardianIdentityId", NEW."tenantId", NEW."userId";

    IF NOT guardian_matches THEN
      RAISE EXCEPTION 'Guardian participant identity must match its user and tenant'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL THEN
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (
           SELECT 1 FROM %I."GuardianChildRelationship" relationship
            WHERE relationship."tenantId" = $1
              AND relationship."guardianIdentityId" = $2
              AND relationship."legalAccess" <> ''NONE''
              AND relationship."startsAt" <= CURRENT_TIMESTAMP
              AND relationship."endedAt" IS NULL
              AND relationship."revokedAt" IS NULL
         )',
        TG_TABLE_SCHEMA
      ) INTO relationship_current
      USING NEW."tenantId", NEW."guardianIdentityId";

      IF NOT relationship_current THEN
        RAISE EXCEPTION 'Guardian participants require a current guardian-child relationship'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    IF NEW."guardianIdentityId" IS NOT NULL THEN
      RAISE EXCEPTION 'Staff participants cannot carry a guardian identity'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."removedAt" IS NULL THEN
      EXECUTE pg_catalog.format(
        'SELECT EXISTS (
           SELECT 1 FROM %I."SiteMembership" site_membership
            WHERE site_membership."tenantId" = $1
              AND site_membership."userId" = $2
         )',
        TG_TABLE_SCHEMA
      ) INTO staff_is_member USING NEW."tenantId", NEW."userId";

      IF NOT staff_is_member THEN
        RAISE EXCEPTION 'Staff participants require a current site membership'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  IF NEW."removedAt" IS NULL THEN
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."StudentIdentity" student_identity
          WHERE student_identity."tenantId" = $1
            AND student_identity."userId" = $2
       )',
      TG_TABLE_SCHEMA
    ) INTO participant_is_student USING NEW."tenantId", NEW."userId";

    IF participant_is_student THEN
      RAISE EXCEPTION 'Students cannot participate in messaging'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_message_participant() FROM PUBLIC;
