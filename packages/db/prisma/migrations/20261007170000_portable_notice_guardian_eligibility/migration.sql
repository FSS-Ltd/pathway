-- Guardian identities may be in app on a fresh install or public on a restore.
CREATE OR REPLACE FUNCTION app.assert_ace_notice_audience_member_eligibility(
  checked_tenant_id text,
  checked_recipient_user_id text,
  checked_recipient_kind app."AceNoticeAudienceMemberKind",
  checked_guardian_identity_id text,
  selected_audience app."AceNoticeAudience"
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  identity_schema text;
  person_schema text;
  guardian_matches boolean;
  relationship_current boolean;
  staff_is_member boolean;
  recipient_is_student boolean;
BEGIN
  IF (selected_audience = 'PARENTS' AND checked_recipient_kind <> 'GUARDIAN')
    OR (selected_audience = 'STAFF' AND checked_recipient_kind <> 'STAFF')
  THEN
    RAISE EXCEPTION 'ACE notice recipient kind is outside the selected audience'
      USING ERRCODE = 'check_violation';
  END IF;

  IF pg_catalog.to_regclass('app."SiteMembership"') IS NOT NULL
    AND pg_catalog.to_regclass('app."StudentIdentity"') IS NOT NULL
  THEN
    person_schema := 'app';
  ELSIF pg_catalog.to_regclass('public."SiteMembership"') IS NOT NULL
    AND pg_catalog.to_regclass('public."StudentIdentity"') IS NOT NULL
  THEN
    person_schema := 'public';
  ELSE
    RAISE EXCEPTION 'Notice recipient identity tables are unavailable'
      USING ERRCODE = 'undefined_table';
  END IF;

  IF checked_recipient_kind = 'GUARDIAN' THEN
    IF pg_catalog.to_regclass('app."GuardianIdentity"') IS NOT NULL
      AND pg_catalog.to_regclass('app."GuardianChildRelationship"') IS NOT NULL
    THEN
      identity_schema := 'app';
    ELSIF pg_catalog.to_regclass('public."GuardianIdentity"') IS NOT NULL
      AND pg_catalog.to_regclass('public."GuardianChildRelationship"') IS NOT NULL
    THEN
      identity_schema := 'public';
    ELSE
      RAISE EXCEPTION 'Guardian identity tables are unavailable'
        USING ERRCODE = 'undefined_table';
    END IF;

    IF checked_guardian_identity_id IS NULL THEN
      RAISE EXCEPTION 'Guardian notice recipients require their tenant identity'
        USING ERRCODE = 'check_violation';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."GuardianIdentity" guardian_identity
          WHERE guardian_identity."id" = $1
            AND guardian_identity."tenantId" = $2
            AND guardian_identity."userId" = $3
       )',
      identity_schema
    ) INTO guardian_matches
    USING checked_guardian_identity_id, checked_tenant_id,
          checked_recipient_user_id;

    IF NOT guardian_matches THEN
      RAISE EXCEPTION 'Guardian notice recipients require their tenant identity'
        USING ERRCODE = 'check_violation';
    END IF;

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
      identity_schema
    ) INTO relationship_current
    USING checked_tenant_id, checked_guardian_identity_id;

    IF NOT relationship_current THEN
      RAISE EXCEPTION 'Guardian notice recipients require a current guardian-child relationship'
        USING ERRCODE = 'check_violation';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."StudentIdentity" student_identity
          WHERE student_identity."tenantId" = $1
            AND student_identity."userId" = $2
       )',
      person_schema
    ) INTO recipient_is_student
    USING checked_tenant_id, checked_recipient_user_id;

    IF recipient_is_student THEN
      RAISE EXCEPTION 'Students cannot receive ACE notice audiences'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF checked_guardian_identity_id IS NOT NULL THEN
      RAISE EXCEPTION 'Staff notice recipients require a current site membership'
        USING ERRCODE = 'check_violation';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."SiteMembership" site_membership
          WHERE site_membership."tenantId" = $1
            AND site_membership."userId" = $2
       )',
      person_schema
    ) INTO staff_is_member
    USING checked_tenant_id, checked_recipient_user_id;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."StudentIdentity" student_identity
          WHERE student_identity."tenantId" = $1
            AND student_identity."userId" = $2
       )',
      person_schema
    ) INTO recipient_is_student
    USING checked_tenant_id, checked_recipient_user_id;

    IF NOT staff_is_member OR recipient_is_student THEN
      RAISE EXCEPTION 'Staff notice recipients require a current site membership'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_audience_member_eligibility(
  text, text, app."AceNoticeAudienceMemberKind", text,
  app."AceNoticeAudience"
) FROM PUBLIC;
