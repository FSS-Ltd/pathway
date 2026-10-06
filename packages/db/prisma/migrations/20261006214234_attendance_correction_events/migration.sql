BEGIN;

-- Preserve attendance corrections as immutable facts. Release this migration
-- with the atomic attendance writers; the one-time backfill cannot recover
-- corrections made between separate production deployments.
CREATE TYPE "AttendanceCorrectionOrigin" AS ENUM ('LIVE', 'LEGACY_BACKFILL');

CREATE UNIQUE INDEX "Attendance_id_childId_key" ON "Attendance"("id", "childId");

CREATE TABLE "AttendanceCorrectionEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "previousStatus" "AttendanceStatus",
  "newStatus" "AttendanceStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedByUserId" TEXT NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "origin" "AttendanceCorrectionOrigin" NOT NULL,
  CONSTRAINT "AttendanceCorrectionEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceCorrectionEvent_reason_check"
    CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "AttendanceCorrectionEvent_origin_status_check"
    CHECK (
      ("origin" = 'LIVE' AND "previousStatus" IS NOT NULL AND "previousStatus" <> "newStatus")
      OR ("origin" = 'LEGACY_BACKFILL' AND "previousStatus" IS NULL)
    )
);

CREATE INDEX "AttendanceCorrectionEvent_tenantId_attendanceId_correctedAt_idx"
  ON "AttendanceCorrectionEvent"("tenantId", "attendanceId", "correctedAt", "id");

ALTER TABLE "AttendanceCorrectionEvent"
  ADD CONSTRAINT "AttendanceCorrectionEvent_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceCorrectionEvent_childId_tenantId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceCorrectionEvent_attendanceId_childId_fkey"
    FOREIGN KEY ("attendanceId", "childId") REFERENCES "Attendance"("id", "childId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceCorrectionEvent_correctedByUserId_fkey"
    FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Only the latest pre-existing correction is recoverable. Its prior status and
-- any earlier changes are unknown; the origin prevents it being shown as live.
INSERT INTO "AttendanceCorrectionEvent" (
  "id", "tenantId", "childId", "attendanceId", "previousStatus",
  "newStatus", "reason", "correctedByUserId", "correctedAt", "origin"
)
SELECT
  pg_catalog.gen_random_uuid()::text,
  child."tenantId",
  attendance."childId",
  attendance."id",
  NULL,
  attendance."status",
  attendance."correctionReason",
  attendance."correctedByUserId",
  attendance."correctedAt",
  'LEGACY_BACKFILL'::"AttendanceCorrectionOrigin"
FROM "Attendance" attendance
INNER JOIN "Child" child ON child."id" = attendance."childId"
WHERE attendance."correctedAt" IS NOT NULL;

-- The composite foreign keys enforce this scope too. The trigger checks it
-- before insertion and pins live timestamps to the database clock.
CREATE FUNCTION app.require_attendance_correction_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM app."Attendance" attendance
    INNER JOIN app."Child" child ON child."id" = attendance."childId"
    WHERE attendance."id" = NEW."attendanceId"
      AND attendance."childId" = NEW."childId"
      AND child."tenantId" = NEW."tenantId"
  ) THEN
    RAISE EXCEPTION 'Attendance correction scope does not match the attendance row'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."origin" <> 'LIVE' THEN
    RAISE EXCEPTION 'Only the migration may recover legacy attendance corrections'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW."correctedAt" := pg_catalog.statement_timestamp();
  IF NOT EXISTS (
    SELECT 1
    FROM app."User" actor
    WHERE actor."id" = NEW."correctedByUserId"
      AND actor."isActive" = true
      AND (
        EXISTS (
          SELECT 1 FROM app."SiteMembership" membership
          WHERE membership."tenantId" = NEW."tenantId"
            AND membership."userId" = actor."id"
        )
        OR EXISTS (
          SELECT 1 FROM app."UserTenantRole" membership
          WHERE membership."tenantId" = NEW."tenantId"
            AND membership."userId" = actor."id"
        )
        OR EXISTS (
          SELECT 1 FROM app."Tenant" tenant
          INNER JOIN app."OrgMembership" membership
            ON membership."orgId" = tenant."orgId"
          WHERE tenant."id" = NEW."tenantId"
            AND membership."userId" = actor."id"
        )
      )
  ) THEN
    RAISE EXCEPTION 'Attendance correction actor is not a member of the site or organisation'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_attendance_correction_scope() FROM PUBLIC;

CREATE TRIGGER "AttendanceCorrectionEvent_require_scope"
BEFORE INSERT ON "AttendanceCorrectionEvent"
FOR EACH ROW EXECUTE FUNCTION app.require_attendance_correction_scope();

CREATE TRIGGER "AttendanceCorrectionEvent_immutable"
BEFORE UPDATE OR DELETE ON "AttendanceCorrectionEvent"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

ALTER TABLE "AttendanceCorrectionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceCorrectionEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "AttendanceCorrectionEvent_tenant_select" ON "AttendanceCorrectionEvent"
  FOR SELECT USING (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  );
CREATE POLICY "AttendanceCorrectionEvent_tenant_insert" ON "AttendanceCorrectionEvent"
  FOR INSERT WITH CHECK (
    app.current_tenant_id() IS NOT NULL
    AND "tenantId" = app.current_tenant_id()
  );
REVOKE ALL PRIVILEGES ON TABLE "AttendanceCorrectionEvent" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "AttendanceCorrectionEvent" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "AttendanceCorrectionEvent" FROM authenticated;
  END IF;
END;
$$;

COMMIT;
