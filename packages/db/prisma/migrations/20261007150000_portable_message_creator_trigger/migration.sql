-- Resolve messaging identity and membership beside the conversation row.
CREATE OR REPLACE FUNCTION app.assert_message_conversation_creator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  guardian_user_id text;
  creator_is_student boolean;
  creator_is_staff boolean;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %I."StudentIdentity" student_identity
        WHERE student_identity."tenantId" = $1
          AND student_identity."userId" = $2
     )',
    TG_TABLE_SCHEMA
  ) INTO creator_is_student USING NEW."tenantId", NEW."createdByUserId";

  IF creator_is_student THEN
    RAISE EXCEPTION 'Students cannot create messaging conversations'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %I."SiteMembership" site_membership
        WHERE site_membership."tenantId" = $1
          AND site_membership."userId" = $2
     )',
    TG_TABLE_SCHEMA
  ) INTO creator_is_staff USING NEW."tenantId", NEW."createdByUserId";

  IF NEW."kind" = 'PARENT_STAFF' THEN
    EXECUTE pg_catalog.format(
      'SELECT guardian_identity."userId"
         FROM %I."GuardianIdentity" guardian_identity
        WHERE guardian_identity."id" = $1
          AND guardian_identity."tenantId" = $2',
      TG_TABLE_SCHEMA
    ) INTO guardian_user_id
    USING NEW."guardianIdentityId", NEW."tenantId";

    IF guardian_user_id = NEW."createdByUserId" OR creator_is_staff THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Parent/staff conversations require their guardian or current tenant staff creator'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT creator_is_staff THEN
    RAISE EXCEPTION 'Staff conversations require a current tenant staff creator'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_message_conversation_creator() FROM PUBLIC;
