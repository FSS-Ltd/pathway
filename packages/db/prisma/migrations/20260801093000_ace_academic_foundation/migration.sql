-- ACE academic foundation: tenant-scoped calendars and child subject placements.
-- Period-overlap and active-enrolment uniqueness are migration-owned because
-- Prisma cannot express partial indexes or concurrency-safe range validation.

CREATE TYPE "AcademicYearStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AcademicPeriodStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "StudentSubjectEnrollmentStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE TABLE "AcademicYear" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "status" "AcademicYearStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicYear_date_range_check" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "AcademicYear_tenantId_name_key" UNIQUE ("tenantId", "name"),
  CONSTRAINT "AcademicYear_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AcademicYear_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AcademicPeriod" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "status" "AcademicPeriodStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AcademicPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicPeriod_date_range_check" CHECK ("endsOn" >= "startsOn"),
  CONSTRAINT "AcademicPeriod_tenantId_academicYearId_name_key"
    UNIQUE ("tenantId", "academicYearId", "name"),
  CONSTRAINT "AcademicPeriod_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AcademicPeriod_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AcademicPeriod_academicYearId_tenantId_fkey"
    FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "StudentSubjectEnrollment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE,
  "status" "StudentSubjectEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startingPace" INTEGER NOT NULL,
  "currentPace" INTEGER NOT NULL,
  "targetPace" INTEGER NOT NULL,
  "recordedByUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudentSubjectEnrollment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentSubjectEnrollment_date_range_check"
    CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  CONSTRAINT "StudentSubjectEnrollment_startingPace_check" CHECK ("startingPace" >= 0),
  CONSTRAINT "StudentSubjectEnrollment_currentPace_check" CHECK ("currentPace" >= 0),
  CONSTRAINT "StudentSubjectEnrollment_targetPace_check" CHECK ("targetPace" >= 0),
  CONSTRAINT "StudentSubjectEnrollment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "StudentSubjectEnrollment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentSubjectEnrollment_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentSubjectEnrollment_subjectId_tenantId_fkey"
    FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentSubjectEnrollment_recordedByUserId_fkey"
    FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AcademicYear_tenantId_status_startsOn_idx"
  ON "AcademicYear"("tenantId", "status", "startsOn");

CREATE INDEX "AcademicPeriod_tenantId_status_startsOn_idx"
  ON "AcademicPeriod"("tenantId", "status", "startsOn");

CREATE INDEX "AcademicPeriod_active_tenant_range_idx"
  ON "AcademicPeriod"("tenantId", "startsOn", "endsOn")
  WHERE "status" = 'ACTIVE';

CREATE INDEX "StudentSubjectEnrollment_tenantId_status_subjectId_childId_idx"
  ON "StudentSubjectEnrollment"("tenantId", "status", "subjectId", "childId");

CREATE UNIQUE INDEX "AcademicYear_one_active_per_tenant_key"
  ON "AcademicYear"("tenantId")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "StudentSubjectEnrollment_one_active_per_child_subject_key"
  ON "StudentSubjectEnrollment"("tenantId", "childId", "subjectId")
  WHERE "status" = 'ACTIVE';

-- PostgreSQL's built-in advisory locks serialize competing active-period writes
-- for a tenant. The predicate remains the source of truth and needs no extension.
CREATE FUNCTION app.lock_academic_period_tenant(academic_tenant_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(academic_tenant_id, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION app.lock_academic_period_tenant(text) FROM PUBLIC;

CREATE FUNCTION app.enforce_academic_period_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  overlapping_period_exists boolean := false;
BEGIN
  IF NEW."status" <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  PERFORM app.lock_academic_period_tenant(NEW."tenantId");

  EXECUTE pg_catalog.format(
    'SELECT EXISTS (
       SELECT 1
       FROM %I."AcademicPeriod" AS existing
       WHERE existing."tenantId" = $1
         AND existing."status" = ''ACTIVE''
         AND existing."id" <> $2
         AND existing."startsOn" <= $3
         AND $4 <= existing."endsOn"
     )',
    TG_TABLE_SCHEMA
  )
  INTO overlapping_period_exists
  USING NEW."tenantId", NEW."id", NEW."endsOn", NEW."startsOn";

  IF overlapping_period_exists THEN
    RAISE EXCEPTION 'Academic period overlaps an existing active period'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_academic_period_no_overlap() FROM PUBLIC;

CREATE TRIGGER "AcademicPeriod_prevent_active_overlap"
BEFORE INSERT OR UPDATE OF "tenantId", "status", "startsOn", "endsOn"
ON "AcademicPeriod"
FOR EACH ROW EXECUTE FUNCTION app.enforce_academic_period_no_overlap();

-- Placement auditing must name an actor who belongs to the placement's tenant.
-- This security-definer guard reads membership data independently of the caller's
-- row visibility, while still enforcing the membership predicate exactly.
CREATE FUNCTION app.require_subject_enrollment_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."SiteMembership"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = NEW."recordedByUserId"
  ) AND NOT EXISTS (
    SELECT 1
    FROM app."UserTenantRole"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = NEW."recordedByUserId"
  ) THEN
    RAISE EXCEPTION 'Subject-enrolment actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_subject_enrollment_actor_membership() FROM PUBLIC;

CREATE TRIGGER "StudentSubjectEnrollment_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "recordedByUserId" ON "StudentSubjectEnrollment"
FOR EACH ROW EXECUTE FUNCTION app.require_subject_enrollment_actor_membership();

-- These tables expose tenantId directly, so use the established tenant RLS policy.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['AcademicYear', 'AcademicPeriod', 'StudentSubjectEnrollment']
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
      tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);

    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
