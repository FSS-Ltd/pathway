BEGIN;

CREATE TABLE "AceYearBand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceYearBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceYearBand_name_check"
    CHECK (length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "AceYearBand_sortOrder_check" CHECK ("sortOrder" >= 0),
  CONSTRAINT "AceYearBand_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceYearBand_tenantId_name_key" UNIQUE ("tenantId", "name"),
  CONSTRAINT "AceYearBand_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "AceStaffYearBandAssignment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "yearBandId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AceStaffYearBandAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AceStaffYearBandAssignment_date_range_check"
    CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn"),
  CONSTRAINT "AceStaffYearBandAssignment_id_tenantId_key" UNIQUE ("id", "tenantId"),
  CONSTRAINT "AceStaffYearBandAssignment_tenantId_userId_yearBandId_start_key"
    UNIQUE ("tenantId", "userId", "yearBandId", "startsOn"),
  CONSTRAINT "AceStaffYearBandAssignment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceStaffYearBandAssignment_yearBandId_tenantId_fkey"
    FOREIGN KEY ("yearBandId", "tenantId") REFERENCES "AceYearBand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AceStaffYearBandAssignment_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "AceYearBand_tenantId_isActive_sortOrder_idx"
  ON "AceYearBand"("tenantId", "isActive", "sortOrder");
CREATE INDEX "AceStaffYearBandAssignment_tenantId_userId_startsOn_endsOn_idx"
  ON "AceStaffYearBandAssignment"("tenantId", "userId", "startsOn", "endsOn");
CREATE INDEX "AceStaffYearBandAssignment_tenantId_yearBandId_startsOn_end_idx"
  ON "AceStaffYearBandAssignment"("tenantId", "yearBandId", "startsOn", "endsOn");

-- A dated assignment is a roster boundary, not a permission. Only a current,
-- active site member may be assigned; reads must recheck membership and role.
CREATE FUNCTION app.require_ace_staff_year_band_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."SiteMembership" AS membership
    JOIN app."User" AS staff ON staff."id" = membership."userId"
    WHERE membership."tenantId" = NEW."tenantId"
      AND membership."userId" = NEW."userId"
      AND membership."role" IN ('STAFF', 'SITE_ADMIN')
      AND staff."isActive" = true
  ) THEN
    RAISE EXCEPTION 'Year-band assignee must be an active site member'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_ace_staff_year_band_membership() FROM PUBLIC;

CREATE TRIGGER "AceStaffYearBandAssignment_require_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "userId"
ON "AceStaffYearBandAssignment"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_staff_year_band_membership();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['AceYearBand', 'AceStaffYearBandAssignment']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_select', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_insert', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_update', tbl
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

COMMIT;
