-- Prisma tables may live in app or public. Resolve related rows from the
-- triggering table's schema while retaining empty function search paths.

CREATE OR REPLACE FUNCTION app.require_active_pace_diagnostic_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  active_enrollment boolean;
BEGIN
  NEW."recordedAt" := pg_catalog.statement_timestamp();

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %I."StudentSubjectEnrollment"
        WHERE "id" = $1 AND "tenantId" = $2
          AND "childId" = $3 AND "subjectId" = $4
          AND "status" = ''ACTIVE''
        FOR SHARE
     )',
    TG_TABLE_SCHEMA
  ) INTO active_enrollment
  USING NEW."enrollmentId", NEW."tenantId", NEW."childId", NEW."subjectId";

  IF NOT active_enrollment THEN
    RAISE EXCEPTION 'Diagnostic result requires an active subject enrollment'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_active_pace_diagnostic_enrollment() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.require_attendance_correction_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  valid_scope boolean;
  valid_actor boolean;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
         FROM %1$I."Attendance" attendance
         JOIN %1$I."Child" child ON child."id" = attendance."childId"
        WHERE attendance."id" = $1
          AND attendance."childId" = $2
          AND child."tenantId" = $3
          AND attendance."status" = $4
     )',
    TG_TABLE_SCHEMA
  ) INTO valid_scope
  USING NEW."attendanceId", NEW."childId", NEW."tenantId", NEW."newStatus";

  IF NOT valid_scope THEN
    RAISE EXCEPTION 'Attendance correction scope or status does not match the attendance row'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."origin" <> 'LIVE' THEN
    RAISE EXCEPTION 'Only the migration may recover legacy attendance corrections'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW."correctedAt" := pg_catalog.statement_timestamp();
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1 FROM %1$I."User" actor
        WHERE actor."id" = $1
          AND actor."isActive" = true
          AND (
            EXISTS (
              SELECT 1 FROM %1$I."SiteMembership" membership
               WHERE membership."tenantId" = $2
                 AND membership."userId" = actor."id"
            )
            OR EXISTS (
              SELECT 1 FROM %1$I."UserTenantRole" membership
               WHERE membership."tenantId" = $2
                 AND membership."userId" = actor."id"
            )
            OR EXISTS (
              SELECT 1 FROM %1$I."Tenant" tenant
                JOIN %1$I."OrgMembership" membership
                  ON membership."orgId" = tenant."orgId"
               WHERE tenant."id" = $2
                 AND membership."userId" = actor."id"
            )
          )
     )',
    TG_TABLE_SCHEMA
  ) INTO valid_actor
  USING NEW."correctedByUserId", NEW."tenantId";

  IF NOT valid_actor THEN
    RAISE EXCEPTION 'Attendance correction actor is not a member of the site or organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_attendance_correction_scope() FROM PUBLIC;
