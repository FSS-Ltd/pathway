BEGIN;

CREATE TABLE "AceSchoolEnrollment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "yearBandId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceSchoolEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceSchoolEnrollment_date_range_check"
    CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  CONSTRAINT "AceSchoolEnrollment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceSchoolEnrollment_tenantId_childId_startsOn_key"
    UNIQUE ("tenantId", "childId", "startsOn"),
  CONSTRAINT "AceSchoolEnrollment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolEnrollment_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolEnrollment_academicYearId_tenantId_fkey"
    FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceSchoolEnrollment_yearBandId_tenantId_fkey"
    FOREIGN KEY ("yearBandId", "tenantId") REFERENCES "AceYearBand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceSchoolEnrollment_tenantId_yearBandId_startsOn_endsOn_idx"
  ON "AceSchoolEnrollment"("tenantId", "yearBandId", "startsOn", "endsOn");
CREATE INDEX "AceSchoolEnrollment_tenantId_childId_startsOn_endsOn_idx"
  ON "AceSchoolEnrollment"("tenantId", "childId", "startsOn", "endsOn");

-- The roster may contain a child only once on a site-local date. A tenant/child
-- advisory lock serializes competing writes before the overlap predicate runs.
CREATE FUNCTION app.enforce_ace_school_enrollment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  academic_start date;
  academic_end date;
  child_is_guest boolean;
  overlapping_enrollment boolean := false;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ACE_SCHOOL_ENROLLMENT:' || NEW."tenantId" || ':' || NEW."childId", 0
    )
  );

  EXECUTE pg_catalog.format(
    'SELECT "startsOn", "endsOn" FROM %I."AcademicYear"
      WHERE "id" = $1 AND "tenantId" = $2',
    TG_TABLE_SCHEMA
  ) INTO academic_start, academic_end
    USING NEW."academicYearId", NEW."tenantId";
  IF academic_start IS NULL THEN
    RAISE EXCEPTION 'School enrolment academic year is outside the site'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT "isGuest" FROM %I."Child"
      WHERE "id" = $1 AND "tenantId" = $2',
    TG_TABLE_SCHEMA
  ) INTO child_is_guest USING NEW."childId", NEW."tenantId";
  IF child_is_guest IS NULL THEN
    RAISE EXCEPTION 'School enrolment child is outside the site'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF child_is_guest THEN
    RAISE EXCEPTION 'A guest child cannot have a school enrolment'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."startsOn" < academic_start OR NEW."startsOn" > academic_end
     OR (NEW."endsOn" IS NOT NULL AND NEW."endsOn" > academic_end) THEN
    RAISE EXCEPTION 'School enrolment must fit its academic year'
      USING ERRCODE = 'check_violation';
  END IF;

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
       FROM %1$I."AceSchoolEnrollment" existing
       JOIN %1$I."AcademicYear" existing_year
         ON existing_year."id" = existing."academicYearId"
        AND existing_year."tenantId" = existing."tenantId"
       WHERE existing."tenantId" = $1
         AND existing."childId" = $2
         AND existing."id" <> $3
         AND existing."startsOn" <= $4
         AND $5 <= COALESCE(existing."endsOn", existing_year."endsOn")
     )',
    TG_TABLE_SCHEMA
  ) INTO overlapping_enrollment USING
    NEW."tenantId", NEW."childId", NEW."id",
    COALESCE(NEW."endsOn", academic_end), NEW."startsOn";
  IF overlapping_enrollment THEN
    RAISE EXCEPTION 'School enrolment overlaps an existing enrolment'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_ace_school_enrollment_scope() FROM PUBLIC;

CREATE TRIGGER "AceSchoolEnrollment_enforce_scope"
BEFORE INSERT OR UPDATE OF "tenantId", "childId", "academicYearId", "yearBandId", "startsOn", "endsOn"
ON "AceSchoolEnrollment"
FOR EACH ROW EXECUTE FUNCTION app.enforce_ace_school_enrollment_scope();

ALTER TABLE "AceSchoolEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceSchoolEnrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AceSchoolEnrollment_tenant_select" ON "AceSchoolEnrollment"
  FOR SELECT USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceSchoolEnrollment_tenant_insert" ON "AceSchoolEnrollment"
  FOR INSERT WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceSchoolEnrollment_tenant_update" ON "AceSchoolEnrollment"
  FOR UPDATE USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  ) WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
REVOKE ALL PRIVILEGES ON TABLE "AceSchoolEnrollment" FROM PUBLIC;
DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceSchoolEnrollment" FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceSchoolEnrollment" FROM authenticated';
  END IF;
END;
$$;

COMMIT;
