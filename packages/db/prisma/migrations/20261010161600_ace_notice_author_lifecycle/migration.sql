-- The historical author must be eligible when the draft is created. Later
-- publication and withdrawal are authorised against the acting user by the API;
-- a departed author must not make an issued notice impossible to withdraw.
-- Identity tables may live in app or public beside the protected app notice.
CREATE OR REPLACE FUNCTION app.assert_ace_notice_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  audience_member record;
  audience_member_count integer;
  identity_schema text;
  author_is_member boolean;
  author_is_student boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
  ) THEN
    RAISE EXCEPTION 'ACE notice ownership is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."publishedAt" IS NOT NULL
    AND (
      NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
      OR NEW."audience" IS DISTINCT FROM OLD."audience"
    )
  THEN
    RAISE EXCEPTION 'Published notice publication metadata is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF pg_catalog.to_regclass('app."SiteMembership"') IS NOT NULL
      AND pg_catalog.to_regclass('app."StudentIdentity"') IS NOT NULL
    THEN
      identity_schema := 'app';
    ELSIF pg_catalog.to_regclass('public."SiteMembership"') IS NOT NULL
      AND pg_catalog.to_regclass('public."StudentIdentity"') IS NOT NULL
    THEN
      identity_schema := 'public';
    ELSE
      RAISE EXCEPTION 'Notice author identity tables are unavailable'
        USING ERRCODE = 'undefined_table';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."SiteMembership" site_membership
          WHERE site_membership."tenantId" = $1
            AND site_membership."userId" = $2
       )',
      identity_schema
    ) INTO author_is_member
    USING NEW."tenantId", NEW."createdByUserId";

    IF NOT author_is_member THEN
      RAISE EXCEPTION 'ACE notice authors require a current site membership'
        USING ERRCODE = 'check_violation';
    END IF;

    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."StudentIdentity" student_identity
          WHERE student_identity."tenantId" = $1
            AND student_identity."userId" = $2
       )',
      identity_schema
    ) INTO author_is_student
    USING NEW."tenantId", NEW."createdByUserId";

    IF author_is_student THEN
      RAISE EXCEPTION 'Students cannot author ACE notices'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'ACE notices must be published from a draft with an audience snapshot'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD."publishedAt" IS NULL
    AND NEW."publishedAt" IS NOT NULL
  THEN
    SELECT count(*)
    INTO audience_member_count
    FROM app."AceNoticeAudienceMember" audience
    WHERE audience."tenantId" = NEW."tenantId"
      AND audience."noticeId" = NEW."id";

    IF audience_member_count = 0 THEN
      RAISE EXCEPTION 'ACE notices require at least one recipient before publication'
        USING ERRCODE = 'check_violation';
    END IF;

    FOR audience_member IN
      SELECT
        audience."recipientUserId",
        audience."recipientKind",
        audience."guardianIdentityId"
      FROM app."AceNoticeAudienceMember" audience
      WHERE audience."tenantId" = NEW."tenantId"
        AND audience."noticeId" = NEW."id"
    LOOP
      PERFORM app.assert_ace_notice_audience_member_eligibility(
        NEW."tenantId",
        audience_member."recipientUserId",
        audience_member."recipientKind",
        audience_member."guardianIdentityId",
        NEW."audience"
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_author() FROM PUBLIC;
