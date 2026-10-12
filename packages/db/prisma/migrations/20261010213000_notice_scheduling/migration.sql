ALTER TABLE app."AceNotice"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "scheduledByUserId" TEXT,
  ADD COLUMN "scheduledAudienceVersion" TEXT,
  ADD COLUMN "scheduleFailedAt" TIMESTAMP(3),
  ADD COLUMN "scheduleFailureReason" TEXT,
  ADD CONSTRAINT "AceNotice_schedule_metadata_check" CHECK (
    ("scheduledAt" IS NULL AND "scheduledByUserId" IS NULL
      AND "scheduledAudienceVersion" IS NULL)
    OR ("scheduledAt" IS NOT NULL AND "scheduledByUserId" IS NOT NULL
      AND "scheduledAudienceVersion" ~ '^[a-f0-9]{64}$'
      AND "legacyImportedAt" IS NULL)
  ),
  ADD CONSTRAINT "AceNotice_schedule_before_expiry_check" CHECK (
    "scheduledAt" IS NULL OR "expiresAt" IS NULL OR "scheduledAt" < "expiresAt"
  ),
  ADD CONSTRAINT "AceNotice_schedule_failure_check" CHECK (
    ("scheduleFailedAt" IS NULL) = ("scheduleFailureReason" IS NULL)
    AND ("scheduleFailedAt" IS NULL OR
      ("scheduledAt" IS NULL AND "publishedAt" IS NULL))
  );

-- The restored database can keep core identity tables in public while the
-- notice itself lives in app. Follow the notice's existing foreign keys.
DO $$
DECLARE
  user_schema text;
BEGIN
  SELECT namespace.nspname INTO user_schema
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class referenced
    ON referenced.oid = constraint_row.confrelid
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = referenced.relnamespace
  WHERE constraint_row.conrelid = 'app."AceNotice"'::pg_catalog.regclass
    AND constraint_row.conname = 'AceNotice_createdByUserId_fkey';

  IF user_schema NOT IN ('app', 'public') OR user_schema IS NULL THEN
    RAISE EXCEPTION 'Notice author foreign key has an unsupported schema';
  END IF;
  EXECUTE pg_catalog.format(
    'ALTER TABLE app."AceNotice" ADD CONSTRAINT "AceNotice_scheduledByUserId_fkey"
       FOREIGN KEY ("scheduledByUserId") REFERENCES %I."User"("id")
       ON DELETE RESTRICT ON UPDATE CASCADE',
    user_schema
  );
END;
$$;

CREATE INDEX "AceNotice_tenantId_scheduledAt_idx"
  ON app."AceNotice"("tenantId", "scheduledAt");
CREATE INDEX "AceNotice_due_schedule_idx"
  ON app."AceNotice"("scheduledAt", "id")
  WHERE "scheduledAt" IS NOT NULL AND "publishedAt" IS NULL;

CREATE OR REPLACE VIEW public."AceNotice" WITH (security_invoker = true)
  AS SELECT * FROM app."AceNotice";

CREATE FUNCTION app.assert_ace_notice_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD."scheduledAt" IS NOT NULL AND OLD."publishedAt" IS NULL AND (
    NEW."title" IS DISTINCT FROM OLD."title"
    OR NEW."body" IS DISTINCT FROM OLD."body"
    OR NEW."audience" IS DISTINCT FROM OLD."audience"
    OR NEW."requiresAcknowledgement" IS DISTINCT FROM OLD."requiresAcknowledgement"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
  ) THEN
    RAISE EXCEPTION 'Cancel the notice schedule before editing its content'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."scheduledAt" IS NOT NULL AND NEW."scheduledAt" IS NOT NULL AND (
    NEW."scheduledAt" IS DISTINCT FROM OLD."scheduledAt"
    OR NEW."scheduledByUserId" IS DISTINCT FROM OLD."scheduledByUserId"
    OR NEW."scheduledAudienceVersion" IS DISTINCT FROM OLD."scheduledAudienceVersion"
  ) THEN
    RAISE EXCEPTION 'Cancel the notice schedule before rescheduling'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD."publishedAt" IS NOT NULL AND (
    NEW."scheduledAt" IS DISTINCT FROM OLD."scheduledAt"
    OR NEW."scheduledByUserId" IS DISTINCT FROM OLD."scheduledByUserId"
    OR NEW."scheduledAudienceVersion" IS DISTINCT FROM OLD."scheduledAudienceVersion"
    OR NEW."scheduleFailedAt" IS DISTINCT FROM OLD."scheduleFailedAt"
    OR NEW."scheduleFailureReason" IS DISTINCT FROM OLD."scheduleFailureReason"
  ) THEN
    RAISE EXCEPTION 'Published notice schedule history is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_notice_schedule() FROM PUBLIC;
CREATE TRIGGER "AceNotice_schedule_guard"
  BEFORE UPDATE ON app."AceNotice"
  FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_schedule();

CREATE FUNCTION app.assert_ace_notice_attachment_unscheduled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  notice_scheduled_at timestamp(3);
BEGIN
  SELECT notice."scheduledAt" INTO notice_scheduled_at
  FROM app."AceNotice" notice
  WHERE notice."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."noticeId" ELSE NEW."noticeId" END
    AND notice."tenantId" = CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END
  FOR UPDATE;

  IF notice_scheduled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cancel the notice schedule before changing attachments'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_notice_attachment_unscheduled() FROM PUBLIC;
CREATE TRIGGER "AceNoticeAttachment_schedule_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON app."AceNoticeAttachment"
  FOR EACH ROW EXECUTE FUNCTION app.assert_ace_notice_attachment_unscheduled();

-- Only identifiers cross the global discovery boundary. The worker then
-- rechecks permission and publishes inside the notice's tenant RLS context.
DO $$
DECLARE
  tenant_schema text;
BEGIN
  SELECT namespace.nspname INTO tenant_schema
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class referenced
    ON referenced.oid = constraint_row.confrelid
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = referenced.relnamespace
  WHERE constraint_row.conrelid = 'app."AceNotice"'::pg_catalog.regclass
    AND constraint_row.conname = 'AceNotice_tenantId_fkey';

  IF tenant_schema NOT IN ('app', 'public') OR tenant_schema IS NULL THEN
    RAISE EXCEPTION 'Notice site foreign key has an unsupported schema';
  END IF;
  EXECUTE pg_catalog.format(
    $definition$
      CREATE FUNCTION app.list_due_notice_schedules()
      RETURNS TABLE (
        "id" TEXT,
        "tenantId" TEXT,
        "orgId" TEXT,
        "scheduledByUserId" TEXT,
        "scheduledAudienceVersion" TEXT,
        "updatedAt" TIMESTAMP(3)
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = ''
      SET row_security = off
      AS $function$
        SELECT notice."id", notice."tenantId", site."orgId",
          notice."scheduledByUserId", notice."scheduledAudienceVersion",
          notice."updatedAt"
        FROM app."AceNotice" notice
        JOIN %I."Tenant" site ON site."id" = notice."tenantId"
        WHERE notice."scheduledAt" <= pg_catalog.clock_timestamp()
          AND notice."publishedAt" IS NULL
        ORDER BY notice."scheduledAt", notice."id"
        LIMIT 5;
      $function$;
    $definition$,
    tenant_schema
  );
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_notice_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_notice_schedules() TO CURRENT_USER;
