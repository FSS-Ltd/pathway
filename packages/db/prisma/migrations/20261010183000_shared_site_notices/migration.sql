-- Move all site notices into the receipt-capable store without assigning a
-- fictional author or delivery history to pre-existing announcements.
ALTER TABLE app."AceNotice"
  ALTER COLUMN "createdByUserId" DROP NOT NULL,
  ADD COLUMN "legacyImportedAt" TIMESTAMP(3),
  ADD CONSTRAINT "AceNotice_author_or_legacy_check"
    CHECK (("createdByUserId" IS NULL) = ("legacyImportedAt" IS NOT NULL));

-- Prisma accesses the protected app table through this invoker-rights bridge.
CREATE OR REPLACE VIEW public."AceNotice" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNotice";

-- The existing author trigger requires an active author and a draft on insert.
-- It remains mandatory for every new notice. Historical imports have neither
-- a known author nor a recipient snapshot and are validated against the source.
DROP TRIGGER "AceNotice_validate_author" ON app."AceNotice";
CREATE TRIGGER "AceNotice_validate_author_insert"
  BEFORE INSERT ON app."AceNotice"
  FOR EACH ROW WHEN (NEW."legacyImportedAt" IS NULL)
  EXECUTE FUNCTION app.assert_ace_notice_author();
CREATE TRIGGER "AceNotice_validate_author_update"
  BEFORE UPDATE ON app."AceNotice"
  FOR EACH ROW WHEN (OLD."legacyImportedAt" IS NULL)
  EXECUTE FUNCTION app.assert_ace_notice_author();

CREATE FUNCTION app.assert_legacy_notice_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  source_schema text;
  source_matches boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOREACH source_schema IN ARRAY ARRAY['app', 'public'] LOOP
      IF pg_catalog.to_regclass(pg_catalog.format('%I."Announcement"', source_schema))
        IS NOT NULL
      THEN
        EXECUTE pg_catalog.format(
          'SELECT EXISTS (
             SELECT 1 FROM %I."Announcement"
             WHERE "id" = $1 AND "tenantId" = $2
           )',
          source_schema
        ) INTO source_matches USING NEW."id", NEW."tenantId";
        IF source_matches THEN EXIT; END IF;
      END IF;
    END LOOP;
    IF NOT source_matches THEN
      RAISE EXCEPTION 'Historical notice requires a matching announcement'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (
    OLD."legacyImportedAt" IS NULL
    OR NEW."legacyImportedAt" IS DISTINCT FROM OLD."legacyImportedAt"
    OR NEW."createdByUserId" IS NOT NULL
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
  ) THEN
    RAISE EXCEPTION 'Historical notice provenance is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_legacy_notice_source() FROM PUBLIC;
CREATE TRIGGER "AceNotice_validate_legacy_source_insert"
  BEFORE INSERT ON app."AceNotice"
  FOR EACH ROW WHEN (NEW."legacyImportedAt" IS NOT NULL)
  EXECUTE FUNCTION app.assert_legacy_notice_source();
CREATE TRIGGER "AceNotice_validate_legacy_source_update"
  BEFORE UPDATE ON app."AceNotice"
  FOR EACH ROW WHEN (OLD."legacyImportedAt" IS NOT NULL OR NEW."legacyImportedAt" IS NOT NULL)
  EXECUTE FUNCTION app.assert_legacy_notice_source();

-- New publications remain immutable. The transitional archive can mirror
-- edits made by an older app release during the deployment window.
CREATE OR REPLACE FUNCTION app.assert_ace_notice_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."withdrawnAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Draft notices cannot be withdrawn'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."legacyImportedAt" IS NOT NULL THEN
    IF OLD."withdrawnAt" IS NOT NULL
      AND NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt"
    THEN
      RAISE EXCEPTION 'Notice withdrawal is final'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."publishedAt" IS NOT NULL AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."audience" IS DISTINCT FROM OLD."audience"
    OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  ) THEN
    RAISE EXCEPTION 'Published notice content is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."withdrawnAt" IS NOT NULL
    AND NEW."withdrawnAt" IS DISTINCT FROM OLD."withdrawnAt"
  THEN
    RAISE EXCEPTION 'Notice withdrawal is final'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."publishedAt" IS NULL AND NEW."publishedAt" IS NOT NULL
    AND NEW."expiresAt" IS NOT NULL
    AND NEW."expiresAt" <= pg_catalog.clock_timestamp()
  THEN
    RAISE EXCEPTION 'Notice expiry must be in the future at publication'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."withdrawnAt" IS NOT NULL AND NEW."publishedAt" IS NULL THEN
    RAISE EXCEPTION 'Draft notices cannot be withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Historical announcements span sites and can live in app on fresh installs
-- or public on restored installations. Fail if RLS would hide source rows.
SET row_security = off;

CREATE FUNCTION app.mirror_legacy_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  mirrored_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publishedAt" IS NULL THEN
      DELETE FROM app."AceNotice"
      WHERE "id" = OLD."id" AND "tenantId" = OLD."tenantId"
        AND "legacyImportedAt" IS NOT NULL;
    ELSE
      UPDATE app."AceNotice"
      SET "withdrawnAt" = GREATEST(OLD."publishedAt", pg_catalog.clock_timestamp())
      WHERE "id" = OLD."id" AND "tenantId" = OLD."tenantId"
        AND "legacyImportedAt" IS NOT NULL AND "withdrawnAt" IS NULL;
    END IF;
    RETURN OLD;
  END IF;

  INSERT INTO app."AceNotice" (
    "id", "tenantId", "createdByUserId", "title", "body", "audience",
    "publishedAt", "createdAt", "updatedAt", "legacyImportedAt"
  ) VALUES (
    NEW."id", NEW."tenantId", NULL, NEW."title", NEW."body",
    CASE NEW."audience"::text
      WHEN 'ALL' THEN 'PARENTS_AND_STAFF'::app."AceNoticeAudience"
      WHEN 'PARENTS' THEN 'PARENTS'::app."AceNoticeAudience"
      ELSE 'STAFF'::app."AceNoticeAudience"
    END,
    NEW."publishedAt", NEW."createdAt", NEW."updatedAt", pg_catalog.clock_timestamp()
  )
  ON CONFLICT ("id") DO UPDATE SET
    "title" = EXCLUDED."title",
    "body" = EXCLUDED."body",
    "audience" = EXCLUDED."audience",
    "publishedAt" = EXCLUDED."publishedAt",
    "updatedAt" = EXCLUDED."updatedAt"
  WHERE app."AceNotice"."legacyImportedAt" IS NOT NULL
    AND app."AceNotice"."tenantId" = EXCLUDED."tenantId"
  RETURNING "id" INTO mirrored_id;

  IF mirrored_id IS NULL THEN
    RAISE EXCEPTION 'Historical announcement collides with an authored notice'
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.mirror_legacy_announcement() FROM PUBLIC;

DO $$
DECLARE
  source_schema text;
  source_kind "char";
  found_source boolean := false;
  has_collision boolean;
BEGIN
  FOREACH source_schema IN ARRAY ARRAY['app', 'public'] LOOP
    SELECT relation.relkind INTO source_kind
    FROM pg_catalog.pg_class relation
    WHERE relation.oid =
      pg_catalog.to_regclass(pg_catalog.format('%I."Announcement"', source_schema));
    IF source_kind IS NULL OR source_kind NOT IN ('r', 'p') THEN CONTINUE; END IF;
    found_source := true;

    -- Lock each source before checking IDs and copying rows. Older releases
    -- cannot write between the collision check, backfill, and mirror trigger.
    EXECUTE pg_catalog.format(
      'CREATE TRIGGER "Announcement_mirror_to_site_notice"
       AFTER INSERT OR UPDATE OR DELETE ON %I."Announcement"
       FOR EACH ROW EXECUTE FUNCTION app.mirror_legacy_announcement()',
      source_schema
    );
    EXECUTE pg_catalog.format(
      'SELECT EXISTS (
         SELECT 1 FROM %I."Announcement" source
         JOIN app."AceNotice" notice ON notice."id" = source."id"
       )',
      source_schema
    ) INTO has_collision;
    IF has_collision THEN
      RAISE EXCEPTION 'Notice ID collision blocks historical import';
    END IF;

    EXECUTE pg_catalog.format(
      'INSERT INTO app."AceNotice" (
         "id", "tenantId", "createdByUserId", "title", "body", "audience",
         "publishedAt", "createdAt", "updatedAt", "legacyImportedAt"
       )
       SELECT
         source."id", source."tenantId", NULL, source."title", source."body",
         CASE source."audience"::text
           WHEN ''ALL'' THEN ''PARENTS_AND_STAFF''::app."AceNoticeAudience"
           WHEN ''PARENTS'' THEN ''PARENTS''::app."AceNoticeAudience"
           ELSE ''STAFF''::app."AceNoticeAudience"
         END,
         source."publishedAt", source."createdAt", source."updatedAt",
         pg_catalog.clock_timestamp()
       FROM %I."Announcement" source',
      source_schema
    );
  END LOOP;
  IF NOT found_source THEN
    RAISE EXCEPTION 'No legacy announcement table available for import'
      USING ERRCODE = 'undefined_table';
  END IF;
END;
$$;

RESET row_security;
