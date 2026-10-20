-- CreateEnum
CREATE TYPE "AceHomeworkAssignmentStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'NEEDS_REVIEW', 'PUBLISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AceHomeworkAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "yearBandId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "scheduledByUserId" TEXT,
    "title" VARCHAR(160) NOT NULL,
    "instructions" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" "AceHomeworkAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "scheduledAt" TIMESTAMP(3),
    "scheduleFailureReason" VARCHAR(80),
    "scheduledAudienceHash" VARCHAR(64),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceHomeworkAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceHomeworkRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AceHomeworkRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AceHomeworkAssignment_tenantId_status_scheduledAt_idx" ON "AceHomeworkAssignment"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "AceHomeworkAssignment_tenantId_yearBandId_dueAt_idx" ON "AceHomeworkAssignment"("tenantId", "yearBandId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkAssignment_id_tenantId_key" ON "AceHomeworkAssignment"("id", "tenantId");

-- CreateIndex
CREATE INDEX "AceHomeworkRecipient_tenantId_childId_publishedAt_idx" ON "AceHomeworkRecipient"("tenantId", "childId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkRecipient_id_tenantId_key" ON "AceHomeworkRecipient"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkRecipient_tenantId_assignmentId_childId_key" ON "AceHomeworkRecipient"("tenantId", "assignmentId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "AceSchoolEnrollment_id_tenantId_childId_key" ON "AceSchoolEnrollment"("id", "tenantId", "childId");

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_academicYearId_tenantId_fkey" FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_yearBandId_tenantId_fkey" FOREIGN KEY ("yearBandId", "tenantId") REFERENCES "AceYearBand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_subjectId_tenantId_fkey" FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkAssignment" ADD CONSTRAINT "AceHomeworkAssignment_scheduledByUserId_fkey" FOREIGN KEY ("scheduledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkRecipient" ADD CONSTRAINT "AceHomeworkRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkRecipient" ADD CONSTRAINT "AceHomeworkRecipient_assignmentId_tenantId_fkey" FOREIGN KEY ("assignmentId", "tenantId") REFERENCES "AceHomeworkAssignment"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkRecipient" ADD CONSTRAINT "AceHomeworkRecipient_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkRecipient" ADD CONSTRAINT "AceHomeworkRecipient_enrollmentId_tenantId_childId_fkey" FOREIGN KEY ("enrollmentId", "tenantId", "childId") REFERENCES "AceSchoolEnrollment"("id", "tenantId", "childId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AceHomeworkAssignment"
  ADD CONSTRAINT "AceHomeworkAssignment_content_check"
    CHECK (btrim("title") <> '' AND btrim("instructions") <> ''),
  ADD CONSTRAINT "AceHomeworkAssignment_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "AceHomeworkAssignment_state_check" CHECK (
    ("status" = 'DRAFT' AND "scheduledAt" IS NULL AND "scheduledAudienceHash" IS NULL AND "publishedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'SCHEDULED' AND "scheduledAt" IS NOT NULL AND "scheduledAudienceHash" IS NOT NULL AND "publishedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'NEEDS_REVIEW' AND "scheduleFailureReason" IS NOT NULL AND "publishedAt" IS NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'PUBLISHED' AND "publishedAt" IS NOT NULL AND "cancelledAt" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION app.assert_ace_homework_assignment_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    IF NEW."status" <> 'CANCELLED'
       OR ROW(NEW."tenantId", NEW."academicYearId", NEW."yearBandId", NEW."subjectId",
              NEW."createdByUserId", NEW."scheduledByUserId", NEW."title", NEW."instructions", NEW."dueAt",
              NEW."scheduledAt", NEW."scheduledAudienceHash", NEW."publishedAt")
          IS DISTINCT FROM
          ROW(OLD."tenantId", OLD."academicYearId", OLD."yearBandId", OLD."subjectId",
              OLD."createdByUserId", OLD."scheduledByUserId", OLD."title", OLD."instructions", OLD."dueAt",
              OLD."scheduledAt", OLD."scheduledAudienceHash", OLD."publishedAt")
    THEN
      RAISE EXCEPTION 'published homework content is immutable' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD."status" = 'CANCELLED' THEN
    RAISE EXCEPTION 'cancelled homework is immutable' USING ERRCODE = 'check_violation';
  ELSIF NEW."status" = 'PUBLISHED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "AceHomeworkRecipient"
      WHERE "assignmentId" = NEW."id" AND "tenantId" = NEW."tenantId"
    ) THEN
      RAISE EXCEPTION 'homework publication requires recipients' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_homework_assignment_transition() FROM PUBLIC;

CREATE TRIGGER "AceHomeworkAssignment_validate_transition"
BEFORE UPDATE ON "AceHomeworkAssignment"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_homework_assignment_transition();

CREATE OR REPLACE FUNCTION app.assert_ace_homework_recipient_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "AceHomeworkAssignment"
    WHERE "id" = NEW."assignmentId" AND "tenantId" = NEW."tenantId"
      AND "status" IN ('DRAFT', 'SCHEDULED')
  ) THEN
    RAISE EXCEPTION 'homework audience is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_homework_recipient_insert() FROM PUBLIC;

CREATE TRIGGER "AceHomeworkRecipient_validate_insert"
BEFORE INSERT ON "AceHomeworkRecipient"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_homework_recipient_insert();
CREATE OR REPLACE FUNCTION app.reject_ace_homework_recipient_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'homework audience is immutable' USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION app.reject_ace_homework_recipient_update() FROM PUBLIC;
CREATE TRIGGER "AceHomeworkRecipient_reject_update"
BEFORE UPDATE ON "AceHomeworkRecipient"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_homework_recipient_update();
CREATE TRIGGER "AceHomeworkRecipient_reject_delete"
BEFORE DELETE ON "AceHomeworkRecipient"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['AceHomeworkAssignment', 'AceHomeworkRecipient']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_rls', tbl
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
