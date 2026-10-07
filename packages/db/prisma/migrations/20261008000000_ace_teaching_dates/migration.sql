BEGIN;

CREATE TYPE "AceTeachingDateKind" AS ENUM (
  'TEACHING', 'EXCEPTIONAL_OPEN', 'HOLIDAY', 'CLOSED'
);

CREATE TABLE "AceTeachingDate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "kind" "AceTeachingDateKind" NOT NULL,
  "reason" VARCHAR(240),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceTeachingDate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceTeachingDate_reason_check" CHECK (
    ("kind" = 'TEACHING' AND "reason" IS NULL)
    OR ("kind" <> 'TEACHING' AND "reason" IS NOT NULL
        AND length(btrim("reason")) BETWEEN 1 AND 240)
  ),
  CONSTRAINT "AceTeachingDate_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceTeachingDate_tenantId_date_key" UNIQUE ("tenantId", "date"),
  CONSTRAINT "AceTeachingDate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceTeachingDate_academicYearId_tenantId_fkey"
    FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceTeachingDate_tenantId_academicYearId_date_idx"
  ON "AceTeachingDate"("tenantId", "academicYearId", "date");

CREATE FUNCTION app.require_ace_teaching_date_year_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  academic_start date;
  academic_end date;
BEGIN
  EXECUTE pg_catalog.format(
    'SELECT "startsOn", "endsOn" FROM %I."AcademicYear"
      WHERE "id" = $1 AND "tenantId" = $2',
    TG_TABLE_SCHEMA
  ) INTO academic_start, academic_end
    USING NEW."academicYearId", NEW."tenantId";
  IF academic_start IS NULL THEN
    RAISE EXCEPTION 'Teaching date academic year is outside the site'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW."date" < academic_start OR NEW."date" > academic_end THEN
    RAISE EXCEPTION 'Teaching date must fit its academic year'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_teaching_date_year_scope() FROM PUBLIC;

CREATE TRIGGER "AceTeachingDate_require_year_scope"
BEFORE INSERT OR UPDATE OF "tenantId", "academicYearId", "date"
ON "AceTeachingDate"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_teaching_date_year_scope();

ALTER TABLE "AceTeachingDate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AceTeachingDate" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AceTeachingDate_tenant_select" ON "AceTeachingDate"
  FOR SELECT USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceTeachingDate_tenant_insert" ON "AceTeachingDate"
  FOR INSERT WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AceTeachingDate_tenant_update" ON "AceTeachingDate"
  FOR UPDATE USING (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  ) WITH CHECK (
    app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
  );
REVOKE ALL PRIVILEGES ON TABLE "AceTeachingDate" FROM PUBLIC;
DO $$
BEGIN
  IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceTeachingDate" FROM anon';
  END IF;
  IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AceTeachingDate" FROM authenticated';
  END IF;
END;
$$;

COMMIT;
