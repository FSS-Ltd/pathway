-- Add the C06 scheduling, withdrawal and per-site terminology controls without
-- changing the immutable F18 publication and audience snapshots.
ALTER TABLE "FaithContent"
  ADD COLUMN "withdrawnAt" TIMESTAMP(3);

ALTER TABLE "FaithContentDraft"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "scheduledByUserId" TEXT,
  ADD COLUMN "scheduleExpectedVersionId" TEXT,
  ADD COLUMN "scheduleFailureReason" TEXT;

ALTER TABLE "FaithContentDraft"
  ADD CONSTRAINT "FaithContentDraft_scheduler_fk"
    FOREIGN KEY ("scheduledByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FaithContentDraft_schedule_version_scope_fk"
    FOREIGN KEY ("scheduleExpectedVersionId", "tenantId", "faithContentId")
    REFERENCES "FaithContentVersion"("id", "tenantId", "faithContentId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FaithContentDraft_schedule_metadata_check" CHECK (
    ("scheduledAt" IS NULL AND "scheduledByUserId" IS NULL AND "scheduleExpectedVersionId" IS NULL)
    OR ("scheduledAt" IS NOT NULL AND "scheduledByUserId" IS NOT NULL AND "status" = 'DRAFT')
  );

CREATE UNIQUE INDEX "FaithContentDraft_one_schedule_per_content"
  ON "FaithContentDraft"("tenantId", "faithContentId")
  WHERE "scheduledAt" IS NOT NULL;

CREATE INDEX "FaithContentDraft_due_schedule_idx"
  ON "FaithContentDraft"("scheduledAt", "id")
  WHERE "scheduledAt" IS NOT NULL;

CREATE INDEX "FaithContent_active_tenant_idx"
  ON "FaithContent"("tenantId", "withdrawnAt", "createdAt" DESC);

CREATE TABLE "FaithSiteSettings" (
  "tenantId" TEXT NOT NULL,
  "displayLabel" TEXT NOT NULL DEFAULT 'Faith Corner',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaithSiteSettings_pkey" PRIMARY KEY ("tenantId"),
  CONSTRAINT "FaithSiteSettings_tenant_fk"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FaithSiteSettings_label_check"
    CHECK (length(btrim("displayLabel")) BETWEEN 2 AND 60)
);

ALTER TABLE "FaithSiteSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FaithSiteSettings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "FaithSiteSettings_tenant_rls" ON "FaithSiteSettings"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());

CREATE FUNCTION app.guard_scheduled_faith_draft_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."scheduledAt" IS NOT NULL
    AND (NEW."title" IS DISTINCT FROM OLD."title"
      OR NEW."contentPayload" IS DISTINCT FROM OLD."contentPayload")
  THEN
    RAISE EXCEPTION 'Cancel the Faith schedule before editing its draft'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_scheduled_faith_draft_mutation() FROM PUBLIC;

CREATE TRIGGER "FaithContentDraft_guard_scheduled_mutation"
BEFORE UPDATE ON "FaithContentDraft"
FOR EACH ROW EXECUTE FUNCTION app.guard_scheduled_faith_draft_mutation();

CREATE TRIGGER "FaithContentDraft_require_scheduler_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "scheduledByUserId"
ON "FaithContentDraft"
FOR EACH ROW EXECUTE FUNCTION app.require_faith_actor_membership('scheduledByUserId');

-- Cron discovery returns identifiers only. Publication runs under fresh tenant
-- context and rechecks the scheduler's current permission and audience.
DO $$
DECLARE
  draft_schema TEXT;
  site_schema TEXT;
BEGIN
  SELECT draft_ns.nspname, site_ns.nspname
    INTO STRICT draft_schema, site_schema
  FROM pg_catalog.pg_class draft
  JOIN pg_catalog.pg_namespace draft_ns ON draft_ns.oid = draft.relnamespace
  JOIN pg_catalog.pg_constraint fk ON fk.conrelid = draft.oid
  JOIN pg_catalog.pg_class site ON site.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace site_ns ON site_ns.oid = site.relnamespace
  WHERE draft.relname = 'FaithContentDraft'
    AND draft.relkind IN ('r', 'p')
    AND draft_ns.nspname IN ('app', 'public')
    AND fk.conname = 'FaithContentDraft_tenant_fk';

  IF draft_schema NOT IN ('app', 'public') OR site_schema NOT IN ('app', 'public') THEN
    RAISE EXCEPTION 'Faith scheduling has an unsupported schema';
  END IF;
  EXECUTE pg_catalog.format(
    $definition$
      CREATE FUNCTION app.list_due_faith_schedules()
      RETURNS TABLE (
        "draftId" TEXT,
        "faithContentId" TEXT,
        "tenantId" TEXT,
        "orgId" TEXT,
        "scheduledByUserId" TEXT,
        "scheduleExpectedVersionId" TEXT
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = ''
      SET row_security = off
      AS $function$
        SELECT draft."id", draft."faithContentId", draft."tenantId",
          site."orgId", draft."scheduledByUserId",
          draft."scheduleExpectedVersionId"
        FROM %I."FaithContentDraft" draft
        JOIN %I."Tenant" site ON site."id" = draft."tenantId"
        WHERE draft."status" = 'DRAFT'
          AND draft."scheduledAt" <= pg_catalog.clock_timestamp()
          AND draft."scheduledByUserId" IS NOT NULL
        ORDER BY draft."scheduledAt", draft."id"
        LIMIT 25;
      $function$;
    $definition$,
    draft_schema, site_schema
  );
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_faith_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_faith_schedules() TO CURRENT_USER;
