-- Keep the shared site notice record and add an ACE-only roster filter.
-- A published recipient's child IDs preserve which relationship justified
-- delivery even if the child later moves class or group.
ALTER TABLE app."AceNotice"
  ADD COLUMN "audienceScope" TEXT NOT NULL DEFAULT 'SITE',
  ADD COLUMN "audienceTargetId" TEXT,
  ADD CONSTRAINT "AceNotice_audience_scope_check" CHECK (
    ("audienceScope" = 'SITE' AND "audienceTargetId" IS NULL)
    OR ("audienceScope" IN ('YEAR_BAND', 'GROUP', 'CHILD')
      AND "audienceTargetId" IS NOT NULL)
  );

ALTER TABLE app."AceNoticeAudienceMember"
  ADD COLUMN "targetedChildIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "AceNotice_tenantId_audienceScope_audienceTargetId_idx"
  ON app."AceNotice" ("tenantId", "audienceScope", "audienceTargetId");

-- Prisma reads protected notice tables through invoker-rights views on
-- restored public-schema installations.
CREATE OR REPLACE VIEW public."AceNotice" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNotice";
CREATE OR REPLACE VIEW public."AceNoticeAudienceMember" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNoticeAudienceMember";

CREATE OR REPLACE FUNCTION app.assert_ace_notice_school_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."scheduledAt" IS NOT NULL
    AND OLD."publishedAt" IS NULL AND (
      NEW."audienceScope" IS DISTINCT FROM OLD."audienceScope"
      OR NEW."audienceTargetId" IS DISTINCT FROM OLD."audienceTargetId"
    ) THEN
    RAISE EXCEPTION 'Cancel the notice schedule before changing its audience'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."publishedAt" IS NOT NULL AND (
    NEW."audienceScope" IS DISTINCT FROM OLD."audienceScope"
    OR NEW."audienceTargetId" IS DISTINCT FROM OLD."audienceTargetId"
  ) THEN
    RAISE EXCEPTION 'Published notice audience scope is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."legacyImportedAt" IS NOT NULL AND NEW."audienceScope" <> 'SITE' THEN
    RAISE EXCEPTION 'Historical notices are site-wide'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_school_scope() FROM PUBLIC;
CREATE TRIGGER "AceNotice_validate_school_scope"
  BEFORE INSERT OR UPDATE ON app."AceNotice"
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ace_notice_school_scope();

CREATE FUNCTION app.assert_ace_notice_targeted_children()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_scope text;
  child_schema text;
  relationship_schema text;
  valid_child_count integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."targetedChildIds" IS DISTINCT FROM OLD."targetedChildIds" THEN
      RAISE EXCEPTION 'Notice recipient child snapshot is immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  SELECT "audienceScope" INTO notice_scope
  FROM app."AceNotice"
  WHERE "id" = NEW."noticeId" AND "tenantId" = NEW."tenantId";

  IF (notice_scope = 'SITE' AND cardinality(NEW."targetedChildIds") <> 0)
    OR (notice_scope <> 'SITE'
      AND NEW."recipientKind" = 'GUARDIAN'
      AND cardinality(NEW."targetedChildIds") = 0)
    OR (NEW."recipientKind" = 'STAFF'
      AND cardinality(NEW."targetedChildIds") <> 0)
  THEN
    RAISE EXCEPTION 'Notice recipient child snapshot does not match audience'
      USING ERRCODE = 'check_violation';
  END IF;

  IF cardinality(NEW."targetedChildIds") > 0 THEN
    IF pg_catalog.to_regclass('app."Child"') IS NOT NULL THEN
      child_schema := 'app';
    ELSIF pg_catalog.to_regclass('public."Child"') IS NOT NULL THEN
      child_schema := 'public';
    ELSE
      RAISE EXCEPTION 'Notice child table is unavailable'
        USING ERRCODE = 'undefined_table';
    END IF;
    EXECUTE pg_catalog.format(
      'SELECT count(*) FROM %I."Child" child
       WHERE child."tenantId" = $1
         AND child."isGuest" = false
         AND child."id" = ANY($2)',
      child_schema
    ) INTO valid_child_count USING NEW."tenantId", NEW."targetedChildIds";
    IF valid_child_count <> cardinality(NEW."targetedChildIds") THEN
      RAISE EXCEPTION 'Notice recipient child snapshot crosses a site'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."recipientKind" = 'GUARDIAN' THEN
      IF pg_catalog.to_regclass('app."GuardianChildRelationship"') IS NOT NULL THEN
        relationship_schema := 'app';
      ELSIF pg_catalog.to_regclass('public."GuardianChildRelationship"') IS NOT NULL THEN
        relationship_schema := 'public';
      ELSE
        RAISE EXCEPTION 'Notice guardian relationship table is unavailable'
          USING ERRCODE = 'undefined_table';
      END IF;
      EXECUTE pg_catalog.format(
        'SELECT count(DISTINCT relationship."childId") FROM %I."GuardianChildRelationship" relationship
         WHERE relationship."tenantId" = $1
           AND relationship."guardianIdentityId" = $2
           AND relationship."childId" = ANY($3)
           AND relationship."legalAccess" = ''FULL''
           AND relationship."startsAt" <= pg_catalog.clock_timestamp()
           AND relationship."endedAt" IS NULL
           AND relationship."revokedAt" IS NULL',
        relationship_schema
      ) INTO valid_child_count
      USING NEW."tenantId", NEW."guardianIdentityId", NEW."targetedChildIds";
      IF valid_child_count <> cardinality(NEW."targetedChildIds") THEN
        RAISE EXCEPTION 'Notice recipient child snapshot lacks guardian access'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.assert_ace_notice_targeted_children() FROM PUBLIC;
CREATE TRIGGER "AceNoticeAudienceMember_validate_targeted_children"
  BEFORE INSERT OR UPDATE ON app."AceNoticeAudienceMember"
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ace_notice_targeted_children();
