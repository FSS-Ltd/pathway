BEGIN;

-- CreateEnum
CREATE TYPE "AceTimetableDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "AceTimetableSlotKind" AS ENUM ('LESSON', 'BREAK');

-- CreateTable
CREATE TABLE "AceTimetableSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "yearBandId" TEXT NOT NULL,
    "teachingDays" "AceTimetableDay"[] DEFAULT ARRAY[]::"AceTimetableDay"[],
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceTimetableSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceTimetableSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "AceTimetableSlotKind" NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceTimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceStudentTimetableDraft" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceStudentTimetableDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceStudentTimetableEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "day" "AceTimetableDay" NOT NULL,
    "slotId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceStudentTimetableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceStudentTimetablePublication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "academicPeriodId" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "periodStartsOn" DATE NOT NULL,
    "periodEndsOn" DATE NOT NULL,
    "yearBandName" TEXT NOT NULL,
    "publishedByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnByUserId" TEXT,
    "withdrawalReason" VARCHAR(240),

    CONSTRAINT "AceStudentTimetablePublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceStudentTimetablePublicationEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "day" "AceTimetableDay" NOT NULL,
    "slotPosition" INTEGER NOT NULL,
    "slotKind" "AceTimetableSlotKind" NOT NULL,
    "slotLabel" VARCHAR(50) NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "subjectId" TEXT,
    "subjectName" TEXT,
    "subjectColor" TEXT,

    CONSTRAINT "AceStudentTimetablePublicationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AceTimetableSchedule_tenantId_academicPeriodId_idx" ON "AceTimetableSchedule"("tenantId", "academicPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "AceTimetableSchedule_id_tenantId_key" ON "AceTimetableSchedule"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceTimetableSchedule_id_tenantId_academicPeriodId_key" ON "AceTimetableSchedule"("id", "tenantId", "academicPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "AceTimetableSchedule_tenantId_academicPeriodId_yearBandId_key" ON "AceTimetableSchedule"("tenantId", "academicPeriodId", "yearBandId");

-- CreateIndex
CREATE UNIQUE INDEX "AceTimetableSlot_id_tenantId_scheduleId_key" ON "AceTimetableSlot"("id", "tenantId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AceTimetableSlot_tenantId_scheduleId_position_key" ON "AceTimetableSlot"("tenantId", "scheduleId", "position");

-- CreateIndex
CREATE INDEX "AceStudentTimetableDraft_tenantId_scheduleId_idx" ON "AceStudentTimetableDraft"("tenantId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetableDraft_id_tenantId_scheduleId_key" ON "AceStudentTimetableDraft"("id", "tenantId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetableDraft_id_tenantId_childId_academicPeriod_key" ON "AceStudentTimetableDraft"("id", "tenantId", "childId", "academicPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetableDraft_tenantId_childId_academicPeriodId_key" ON "AceStudentTimetableDraft"("tenantId", "childId", "academicPeriodId");

-- CreateIndex
CREATE INDEX "AceStudentTimetableEntry_tenantId_subjectId_idx" ON "AceStudentTimetableEntry"("tenantId", "subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetableEntry_tenantId_draftId_day_slotId_key" ON "AceStudentTimetableEntry"("tenantId", "draftId", "day", "slotId");

-- CreateIndex
CREATE INDEX "AceStudentTimetablePublication_tenantId_childId_academicPer_idx" ON "AceStudentTimetablePublication"("tenantId", "childId", "academicPeriodId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetablePublication_id_tenantId_key" ON "AceStudentTimetablePublication"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceStudentTimetablePublicationEntry_tenantId_publicationId__key" ON "AceStudentTimetablePublicationEntry"("tenantId", "publicationId", "day", "slotPosition");

-- AddForeignKey
ALTER TABLE "AceTimetableSchedule" ADD CONSTRAINT "AceTimetableSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceTimetableSchedule" ADD CONSTRAINT "AceTimetableSchedule_academicPeriodId_tenantId_fkey" FOREIGN KEY ("academicPeriodId", "tenantId") REFERENCES "AcademicPeriod"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceTimetableSchedule" ADD CONSTRAINT "AceTimetableSchedule_yearBandId_tenantId_fkey" FOREIGN KEY ("yearBandId", "tenantId") REFERENCES "AceYearBand"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceTimetableSchedule" ADD CONSTRAINT "AceTimetableSchedule_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceTimetableSlot" ADD CONSTRAINT "AceTimetableSlot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceTimetableSlot" ADD CONSTRAINT "AceTimetableSlot_scheduleId_tenantId_fkey" FOREIGN KEY ("scheduleId", "tenantId") REFERENCES "AceTimetableSchedule"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableDraft" ADD CONSTRAINT "AceStudentTimetableDraft_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableDraft" ADD CONSTRAINT "AceStudentTimetableDraft_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableDraft" ADD CONSTRAINT "AceStudentTimetableDraft_academicPeriodId_tenantId_fkey" FOREIGN KEY ("academicPeriodId", "tenantId") REFERENCES "AcademicPeriod"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableDraft" ADD CONSTRAINT "AceStudentTimetableDraft_scheduleId_tenantId_academicPerio_fkey" FOREIGN KEY ("scheduleId", "tenantId", "academicPeriodId") REFERENCES "AceTimetableSchedule"("id", "tenantId", "academicPeriodId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableDraft" ADD CONSTRAINT "AceStudentTimetableDraft_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableEntry" ADD CONSTRAINT "AceStudentTimetableEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableEntry" ADD CONSTRAINT "AceStudentTimetableEntry_draftId_tenantId_scheduleId_fkey" FOREIGN KEY ("draftId", "tenantId", "scheduleId") REFERENCES "AceStudentTimetableDraft"("id", "tenantId", "scheduleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableEntry" ADD CONSTRAINT "AceStudentTimetableEntry_slotId_tenantId_scheduleId_fkey" FOREIGN KEY ("slotId", "tenantId", "scheduleId") REFERENCES "AceTimetableSlot"("id", "tenantId", "scheduleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetableEntry" ADD CONSTRAINT "AceStudentTimetableEntry_subjectId_tenantId_fkey" FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_draftId_tenantId_childId_ac_fkey" FOREIGN KEY ("draftId", "tenantId", "childId", "academicPeriodId") REFERENCES "AceStudentTimetableDraft"("id", "tenantId", "childId", "academicPeriodId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_academicPeriodId_tenantId_fkey" FOREIGN KEY ("academicPeriodId", "tenantId") REFERENCES "AcademicPeriod"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublication" ADD CONSTRAINT "AceStudentTimetablePublication_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublicationEntry" ADD CONSTRAINT "AceStudentTimetablePublicationEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceStudentTimetablePublicationEntry" ADD CONSTRAINT "AceStudentTimetablePublicationEntry_publicationId_tenantId_fkey" FOREIGN KEY ("publicationId", "tenantId") REFERENCES "AceStudentTimetablePublication"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep out-of-band writes inside the basic timetable domain. The API will
-- additionally validate weekday selection, slot overlap, enrolments, and
-- publication completeness before exposing these tables.
ALTER TABLE "AceTimetableSchedule"
  ADD CONSTRAINT "AceTimetableSchedule_teaching_days_check"
  CHECK ("teachingDays" IS NOT NULL AND cardinality("teachingDays") BETWEEN 1 AND 7);
ALTER TABLE "AceTimetableSlot"
  ADD CONSTRAINT "AceTimetableSlot_time_check"
  CHECK ("position" BETWEEN 0 AND 15 AND btrim("label") <> ''
    AND "startMinutes" BETWEEN 0 AND 1439
    AND "endMinutes" BETWEEN 1 AND 1440
    AND "endMinutes" > "startMinutes");
ALTER TABLE "AceStudentTimetableDraft"
  ADD CONSTRAINT "AceStudentTimetableDraft_version_check" CHECK ("version" > 0);
ALTER TABLE "AceStudentTimetablePublication"
  ADD CONSTRAINT "AceStudentTimetablePublication_snapshot_check"
  CHECK ("periodEndsOn" >= "periodStartsOn"
    AND btrim("periodName") <> '' AND btrim("yearBandName") <> ''
    AND (("withdrawnAt" IS NULL AND "withdrawnByUserId" IS NULL AND "withdrawalReason" IS NULL)
      OR ("publishedAt" IS NOT NULL AND "withdrawnAt" >= "publishedAt" AND "withdrawnByUserId" IS NOT NULL
        AND btrim(coalesce("withdrawalReason", '')) <> '')));
ALTER TABLE "AceStudentTimetablePublicationEntry"
  ADD CONSTRAINT "AceStudentTimetablePublicationEntry_snapshot_check"
  CHECK ("slotPosition" BETWEEN 0 AND 15 AND btrim("slotLabel") <> ''
    AND "startMinutes" BETWEEN 0 AND 1439
    AND "endMinutes" BETWEEN 1 AND 1440
    AND "endMinutes" > "startMinutes"
    AND (("subjectId" IS NULL AND "subjectName" IS NULL AND "subjectColor" IS NULL)
      OR ("slotKind" = 'LESSON' AND "subjectId" IS NOT NULL
        AND btrim(coalesce("subjectName", '')) <> '')));

-- A publication is invisible until its entries are complete and publishedAt
-- seals it. After sealing, only a one-time audited withdrawal is permitted.
CREATE FUNCTION app.guard_ace_timetable_publication_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A timetable publication cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."publishedAt" IS NULL THEN
    IF NEW."publishedAt" IS NULL OR NEW."withdrawnAt" IS NOT NULL
       OR (pg_catalog.to_jsonb(NEW) - 'publishedAt')
          IS DISTINCT FROM (pg_catalog.to_jsonb(OLD) - 'publishedAt') THEN
      RAISE EXCEPTION 'An unissued timetable may only be sealed'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL OR NEW."withdrawnAt" IS NULL
     OR NEW."withdrawnByUserId" IS NULL
     OR btrim(coalesce(NEW."withdrawalReason", '')) = ''
     OR (pg_catalog.to_jsonb(NEW) - 'withdrawnAt' - 'withdrawnByUserId' - 'withdrawalReason')
        IS DISTINCT FROM
        (pg_catalog.to_jsonb(OLD) - 'withdrawnAt' - 'withdrawnByUserId' - 'withdrawalReason') THEN
    RAISE EXCEPTION 'Only a recorded withdrawal may change an issued timetable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_ace_timetable_publication_change() FROM PUBLIC;
CREATE TRIGGER "AceStudentTimetablePublication_guard_change"
BEFORE UPDATE OR DELETE ON "AceStudentTimetablePublication"
FOR EACH ROW EXECUTE FUNCTION app.guard_ace_timetable_publication_change();

CREATE FUNCTION app.guard_ace_timetable_publication_entry_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  issued_at timestamp;
BEGIN
  IF TG_OP = 'INSERT' THEN
    EXECUTE pg_catalog.format(
      'SELECT "publishedAt" FROM %I."AceStudentTimetablePublication"
       WHERE "id" = $1 AND "tenantId" = $2 FOR UPDATE',
      TG_TABLE_SCHEMA
    ) INTO issued_at USING NEW."publicationId", NEW."tenantId";
    IF issued_at IS NOT NULL THEN
      RAISE EXCEPTION 'An issued timetable cannot gain entries'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'An issued timetable entry is immutable'
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE ALL ON FUNCTION app.guard_ace_timetable_publication_entry_change() FROM PUBLIC;
CREATE TRIGGER "AceStudentTimetablePublicationEntry_guard_change"
BEFORE INSERT OR UPDATE OR DELETE ON "AceStudentTimetablePublicationEntry"
FOR EACH ROW EXECUTE FUNCTION app.guard_ace_timetable_publication_entry_change();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'AceTimetableSchedule', 'AceTimetableSlot',
    'AceStudentTimetableDraft', 'AceStudentTimetableEntry',
    'AceStudentTimetablePublication', 'AceStudentTimetablePublicationEntry'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE pg_catalog.format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON %I FOR SELECT USING (
        app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
      )', table_name || '_tenant_select', table_name
    );
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (
        app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
      )', table_name || '_tenant_insert', table_name
    );
    EXECUTE pg_catalog.format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (
        app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
      ) WITH CHECK (
        app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
      )', table_name || '_tenant_update', table_name
    );
    IF table_name IN (
      'AceTimetableSchedule', 'AceTimetableSlot',
      'AceStudentTimetableDraft', 'AceStudentTimetableEntry'
    ) THEN
      EXECUTE pg_catalog.format(
        'CREATE POLICY %I ON %I FOR DELETE USING (
          app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()
        )', table_name || '_tenant_delete', table_name
      );
    END IF;
    EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC', table_name);
    IF pg_catalog.to_regrole('anon') IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon', table_name);
    END IF;
    IF pg_catalog.to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE pg_catalog.format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
