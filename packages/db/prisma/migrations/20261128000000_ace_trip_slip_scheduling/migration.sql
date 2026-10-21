-- Keep scheduled versions editable only after an explicit cancellation. The
-- existing published-version trigger continues to freeze every published fact.
-- Organisation heads may act for a site through their org membership even
-- when they have no separate SiteMembership row.
CREATE OR REPLACE FUNCTION app.require_trip_slip_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_user_id text;
BEGIN
  actor_user_id := pg_catalog.to_jsonb(NEW) ->> TG_ARGV[0];

  IF actor_user_id IS NULL OR NOT (
    EXISTS (
      SELECT 1 FROM app."SiteMembership"
      WHERE "tenantId" = NEW."tenantId" AND "userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1 FROM app."UserTenantRole"
      WHERE "tenantId" = NEW."tenantId" AND "userId" = actor_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM app."Tenant" site
      JOIN app."OrgMembership" membership ON membership."orgId" = site."orgId"
      WHERE site."id" = NEW."tenantId"
        AND membership."userId" = actor_user_id
        AND membership."role" = 'ORG_ADMIN'
    )
  ) THEN
    RAISE EXCEPTION 'Trip and permission-slip actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE "PermissionSlipVersion"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "scheduledByUserId" TEXT,
  ADD COLUMN "scheduleFailureReason" TEXT;

ALTER TABLE "PermissionSlipVersion"
  ADD CONSTRAINT "PermissionSlipVersion_scheduler_fk"
    FOREIGN KEY ("scheduledByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PermissionSlipVersion_schedule_metadata_check" CHECK (
    ("scheduledAt" IS NULL AND "scheduledByUserId" IS NULL)
    OR (
      "scheduledAt" IS NOT NULL
      AND "scheduledByUserId" IS NOT NULL
      AND "publishedAt" IS NULL
    )
  );

CREATE UNIQUE INDEX "PermissionSlipVersion_one_schedule_per_slip"
  ON "PermissionSlipVersion"("tenantId", "permissionSlipId")
  WHERE "scheduledAt" IS NOT NULL;

CREATE INDEX "PermissionSlipVersion_due_schedule_idx"
  ON "PermissionSlipVersion"("scheduledAt", "id")
  WHERE "scheduledAt" IS NOT NULL;

CREATE FUNCTION app.guard_scheduled_permission_slip_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD."scheduledAt" IS NOT NULL
    AND (NEW."contentSnapshot" IS DISTINCT FROM OLD."contentSnapshot"
      OR NEW."changeClassification" IS DISTINCT FROM OLD."changeClassification"
      OR NEW."requiresReconsent" IS DISTINCT FROM OLD."requiresReconsent"
      OR NEW."supersedesVersionId" IS DISTINCT FROM OLD."supersedesVersionId"
      OR NEW."permissionSlipId" IS DISTINCT FROM OLD."permissionSlipId"
      OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId")
  THEN
    RAISE EXCEPTION 'Cancel the permission-slip schedule before editing its draft'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_scheduled_permission_slip_version_mutation() FROM PUBLIC;

CREATE TRIGGER "PermissionSlipVersion_guard_scheduled_mutation"
BEFORE UPDATE ON "PermissionSlipVersion"
FOR EACH ROW EXECUTE FUNCTION app.guard_scheduled_permission_slip_version_mutation();

CREATE TRIGGER "PermissionSlipVersion_require_scheduler_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "scheduledByUserId"
ON "PermissionSlipVersion"
FOR EACH ROW WHEN (NEW."scheduledByUserId" IS NOT NULL)
EXECUTE FUNCTION app.require_trip_slip_actor_membership('scheduledByUserId');

-- The cron process discovers identifiers only. The application rechecks the
-- scheduler's current permission and recipient eligibility in tenant context.
DO $$
DECLARE
  version_schema TEXT;
  site_schema TEXT;
BEGIN
  SELECT version_ns.nspname, site_ns.nspname
    INTO STRICT version_schema, site_schema
  FROM pg_catalog.pg_class version
  JOIN pg_catalog.pg_namespace version_ns ON version_ns.oid = version.relnamespace
  JOIN pg_catalog.pg_constraint fk ON fk.conrelid = version.oid
  JOIN pg_catalog.pg_class site ON site.oid = fk.confrelid
  JOIN pg_catalog.pg_namespace site_ns ON site_ns.oid = site.relnamespace
  WHERE version.relname = 'PermissionSlipVersion'
    AND version.relkind IN ('r', 'p')
    AND version_ns.nspname IN ('app', 'public')
    AND fk.conname = 'PermissionSlipVersion_tenantId_fkey';

  IF version_schema NOT IN ('app', 'public') OR site_schema NOT IN ('app', 'public') THEN
    RAISE EXCEPTION 'Permission-slip scheduling has an unsupported schema';
  END IF;
  EXECUTE pg_catalog.format(
    $definition$
      CREATE FUNCTION app.list_due_permission_slip_schedules()
      RETURNS TABLE (
        "versionId" TEXT,
        "permissionSlipId" TEXT,
        "tenantId" TEXT,
        "orgId" TEXT,
        "scheduledByUserId" TEXT
      )
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = ''
      SET row_security = off
      AS $function$
        SELECT version."id", version."permissionSlipId", version."tenantId",
          site."orgId", version."scheduledByUserId"
        FROM %I."PermissionSlipVersion" version
        JOIN %I."Tenant" site ON site."id" = version."tenantId"
        WHERE version."publishedAt" IS NULL
          AND version."scheduledAt" <= pg_catalog.clock_timestamp()
          AND version."scheduledByUserId" IS NOT NULL
        ORDER BY version."scheduledAt", version."id"
        LIMIT 25;
      $function$;
    $definition$,
    version_schema, site_schema
  );
END;
$$;
REVOKE ALL ON FUNCTION app.list_due_permission_slip_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.list_due_permission_slip_schedules() TO CURRENT_USER;
