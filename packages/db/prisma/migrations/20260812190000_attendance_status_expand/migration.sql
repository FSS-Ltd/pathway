-- Expand pupil attendance from a Boolean to an explicit status while keeping
-- the legacy Boolean writable for rollback and mixed-version deployments.
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

ALTER TABLE "Attendance"
  ADD COLUMN "status" "AttendanceStatus",
  ADD COLUMN "correctedAt" TIMESTAMP(3),
  ADD COLUMN "correctedByUserId" TEXT,
  ADD COLUMN "correctionReason" TEXT;

CREATE OR REPLACE FUNCTION app.sync_attendance_status_expand()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, app
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" IS NULL THEN
      NEW."status" := CASE
        WHEN NEW."present" THEN 'PRESENT'::"AttendanceStatus"
        ELSE 'ABSENT'::"AttendanceStatus"
      END;
    ELSE
      NEW."present" := NEW."status" <> 'ABSENT'::"AttendanceStatus";
    END IF;
  ELSIF NEW."status" IS DISTINCT FROM OLD."status" THEN
    IF NEW."status" IS NULL THEN
      NEW."status" := CASE
        WHEN NEW."present" THEN 'PRESENT'::"AttendanceStatus"
        ELSE 'ABSENT'::"AttendanceStatus"
      END;
    ELSE
      NEW."present" := NEW."status" <> 'ABSENT'::"AttendanceStatus";
    END IF;
  ELSIF NEW."present" IS DISTINCT FROM OLD."present" THEN
    NEW."status" := CASE
      WHEN NEW."present" THEN 'PRESENT'::"AttendanceStatus"
      ELSE 'ABSENT'::"AttendanceStatus"
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "Attendance_status_expand_sync"
BEFORE INSERT OR UPDATE OF "present", "status" ON "Attendance"
FOR EACH ROW
EXECUTE FUNCTION app.sync_attendance_status_expand();

UPDATE "Attendance"
SET "status" = CASE
  WHEN "present" THEN 'PRESENT'::"AttendanceStatus"
  ELSE 'ABSENT'::"AttendanceStatus"
END
WHERE "status" IS NULL;

ALTER TABLE "Attendance"
  ALTER COLUMN "status" SET NOT NULL,
  ADD CONSTRAINT "Attendance_correction_metadata_check" CHECK (
    (
      "correctedAt" IS NULL
      AND "correctedByUserId" IS NULL
      AND "correctionReason" IS NULL
    )
    OR
    (
      "correctedAt" IS NOT NULL
      AND "correctedByUserId" IS NOT NULL
      AND "correctionReason" IS NOT NULL
      AND btrim("correctionReason") <> ''
    )
  );

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_correctedByUserId_fkey"
  FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Attendance_sessionId_status_idx"
  ON "Attendance"("sessionId", "status");

CREATE INDEX "Attendance_correctedByUserId_correctedAt_idx"
  ON "Attendance"("correctedByUserId", "correctedAt");

-- Attendance remains tenant-scoped through Child. Reassert the existing
-- policy gate so the expand migration fails closed if RLS was weakened.
ALTER TABLE "Attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attendance" FORCE ROW LEVEL SECURITY;
