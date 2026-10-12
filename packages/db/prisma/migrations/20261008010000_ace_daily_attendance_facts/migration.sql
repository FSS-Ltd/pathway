BEGIN;

CREATE TYPE "AceDailyAbsenceReason" AS ENUM (
  'SICK', 'HOLIDAY', 'NOT_SCHEDULED', 'EXCUSED', 'UNEXCUSED'
);

CREATE TABLE "AceDailyAttendance" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "absenceReason" "AceDailyAbsenceReason",
  "recordedByUserId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceDailyAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceDailyAttendance_status_reason_check" CHECK (
    ("status" = 'ABSENT' AND "absenceReason" IS NOT NULL)
    OR ("status" <> 'ABSENT' AND "absenceReason" IS NULL)
  ),
  CONSTRAINT "AceDailyAttendance_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceDailyAttendance_tenantId_childId_date_key"
    UNIQUE ("tenantId", "childId", "date"),
  CONSTRAINT "AceDailyAttendance_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceDailyAttendance_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceDailyAttendance_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceDailyAttendance_tenantId_date_status_idx"
  ON "AceDailyAttendance"("tenantId", "date", "status");

CREATE TABLE "AceDailyAttendanceCorrectionEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "dailyAttendanceId" TEXT NOT NULL,
  "previousStatus" "AttendanceStatus" NOT NULL,
  "newStatus" "AttendanceStatus" NOT NULL,
  "previousReason" "AceDailyAbsenceReason",
  "newReason" "AceDailyAbsenceReason",
  "correctionReason" TEXT NOT NULL,
  "correctedByUserId" TEXT NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AceDailyAttendanceCorrectionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceDailyCorrection_reason_check"
    CHECK (length(btrim("correctionReason")) > 0),
  CONSTRAINT "AceDailyCorrection_change_check"
    CHECK ("previousStatus" <> "newStatus" OR "previousReason" IS DISTINCT FROM "newReason"),
  CONSTRAINT "AceDailyCorrection_previous_status_reason_check" CHECK (
    ("previousStatus" = 'ABSENT' AND "previousReason" IS NOT NULL)
    OR ("previousStatus" <> 'ABSENT' AND "previousReason" IS NULL)
  ),
  CONSTRAINT "AceDailyCorrection_new_status_reason_check" CHECK (
    ("newStatus" = 'ABSENT' AND "newReason" IS NOT NULL)
    OR ("newStatus" <> 'ABSENT' AND "newReason" IS NULL)
  ),
  CONSTRAINT "AceDailyAttendanceCorrectionEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceDailyCorrection_fact_fkey"
    FOREIGN KEY ("dailyAttendanceId", "tenantId")
    REFERENCES "AceDailyAttendance"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceDailyAttendanceCorrectionEvent_correctedByUserId_fkey"
    FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceDailyCorrection_history_idx"
  ON "AceDailyAttendanceCorrectionEvent"("tenantId", "dailyAttendanceId", "correctedAt", "id");

-- Resolve the fact's supporting records beside the triggering table. The
-- restored production database uses public while CI uses app.
CREATE FUNCTION app.ace_daily_actor_is_member(
  tenant_id text, actor_id text, data_schema text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_is_member boolean;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %1$I."User" actor
       WHERE actor."id" = $2 AND actor."isActive" = true
         AND (
           EXISTS (
             SELECT 1 FROM %1$I."SiteMembership" membership
             WHERE membership."tenantId" = $1 AND membership."userId" = actor."id"
           )
           OR EXISTS (
             SELECT 1 FROM %1$I."UserTenantRole" legacy_role
             WHERE legacy_role."tenantId" = $1 AND legacy_role."userId" = actor."id"
           )
           OR EXISTS (
             SELECT 1 FROM %1$I."Tenant" tenant
             JOIN %1$I."OrgMembership" membership
               ON membership."orgId" = tenant."orgId"
              AND membership."userId" = actor."id"
             WHERE tenant."id" = $1
           )
         )
     )', data_schema
  ) INTO actor_is_member USING tenant_id, actor_id;
  RETURN actor_is_member;
END;
$$;

REVOKE ALL ON FUNCTION app.ace_daily_actor_is_member(text, text, text) FROM PUBLIC;

CREATE FUNCTION app.require_ace_daily_attendance_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  site_timezone text;
  teaching_year_id text;
  is_enrolled boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."childId" IS DISTINCT FROM OLD."childId"
    OR NEW."date" IS DISTINCT FROM OLD."date"
    OR NEW."recordedByUserId" IS DISTINCT FROM OLD."recordedByUserId"
    OR NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt"
  ) THEN
    RAISE EXCEPTION 'Daily attendance identity and original recorder cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT "timezone" FROM %I."Tenant" WHERE "id" = $1',
    TG_TABLE_SCHEMA
  ) INTO site_timezone USING NEW."tenantId";
  IF site_timezone IS NULL OR length(btrim(site_timezone)) = 0 THEN
    RAISE EXCEPTION 'Daily attendance requires a configured site timezone'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT "academicYearId" FROM %I."AceTeachingDate"
     WHERE "tenantId" = $1 AND "date" = $2
       AND "kind" IN (''TEACHING'', ''EXCEPTIONAL_OPEN'')',
    TG_TABLE_SCHEMA
  ) INTO teaching_year_id USING NEW."tenantId", NEW."date";
  IF teaching_year_id IS NULL THEN
    RAISE EXCEPTION 'Daily attendance date is not open for teaching'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
       FROM %1$I."AceSchoolEnrollment" enrollment
       JOIN %1$I."AcademicYear" academic_year
         ON academic_year."id" = enrollment."academicYearId"
        AND academic_year."tenantId" = enrollment."tenantId"
       JOIN %1$I."Child" child
         ON child."id" = enrollment."childId"
        AND child."tenantId" = enrollment."tenantId"
       WHERE enrollment."tenantId" = $1
         AND enrollment."childId" = $2
         AND enrollment."academicYearId" = $4
         AND enrollment."startsOn" <= $3
         AND $3 <= COALESCE(enrollment."endsOn", academic_year."endsOn")
         AND child."isGuest" = false
     )', TG_TABLE_SCHEMA
  ) INTO is_enrolled USING NEW."tenantId", NEW."childId", NEW."date", teaching_year_id;
  IF NOT is_enrolled THEN
    RAISE EXCEPTION 'Daily attendance child is not enrolled at this site on this date'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' AND NOT app.ace_daily_actor_is_member(
    NEW."tenantId", NEW."recordedByUserId", TG_TABLE_SCHEMA
  ) THEN
    RAISE EXCEPTION 'Daily attendance recorder is not an active site or organisation member'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW."recordedAt" := pg_catalog.statement_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_daily_attendance_scope() FROM PUBLIC;

CREATE TRIGGER "AceDailyAttendance_require_scope"
BEFORE INSERT OR UPDATE OF "tenantId", "childId", "date", "status", "absenceReason", "recordedByUserId", "recordedAt"
ON "AceDailyAttendance"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_daily_attendance_scope();

CREATE TRIGGER "AceDailyAttendance_immutable_delete"
BEFORE DELETE ON "AceDailyAttendance"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

CREATE FUNCTION app.require_ace_daily_correction_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  matches_fact boolean;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %I."AceDailyAttendance"
       WHERE "id" = $1 AND "tenantId" = $2
         AND "status" = $3 AND "absenceReason" IS NOT DISTINCT FROM $4
     )', TG_TABLE_SCHEMA
  ) INTO matches_fact USING NEW."dailyAttendanceId", NEW."tenantId",
    NEW."newStatus", NEW."newReason";
  IF NOT matches_fact THEN
    RAISE EXCEPTION 'Daily attendance correction does not match the current mark'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT app.ace_daily_actor_is_member(
    NEW."tenantId", NEW."correctedByUserId", TG_TABLE_SCHEMA
  ) THEN
    RAISE EXCEPTION 'Daily attendance correction actor is not an active site or organisation member'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW."correctedAt" := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_daily_correction_scope() FROM PUBLIC;

CREATE TRIGGER "AceDailyCorrection_require_scope"
BEFORE INSERT ON "AceDailyAttendanceCorrectionEvent"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_daily_correction_scope();

CREATE TRIGGER "AceDailyCorrection_immutable"
BEFORE UPDATE OR DELETE ON "AceDailyAttendanceCorrectionEvent"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

ALTER TABLE "AceDailyAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceDailyAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AceDailyAttendance_tenant_select" ON "AceDailyAttendance"
  FOR SELECT USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceDailyAttendance_tenant_insert" ON "AceDailyAttendance"
  FOR INSERT WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceDailyAttendance_tenant_update" ON "AceDailyAttendance"
  FOR UPDATE USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  ) WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );

ALTER TABLE "AceDailyAttendanceCorrectionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceDailyAttendanceCorrectionEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AceDailyCorrection_tenant_select" ON "AceDailyAttendanceCorrectionEvent"
  FOR SELECT USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceDailyCorrection_tenant_insert" ON "AceDailyAttendanceCorrectionEvent"
  FOR INSERT WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );

REVOKE ALL PRIVILEGES ON TABLE "AceDailyAttendance" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE "AceDailyAttendanceCorrectionEvent" FROM PUBLIC;
DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceDailyAttendance", "AceDailyAttendanceCorrectionEvent" FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceDailyAttendance", "AceDailyAttendanceCorrectionEvent" FROM authenticated';
  END IF;
END;
$$;

COMMIT;
