-- CreateEnum
CREATE TYPE "PaceDiagnosticOutcome" AS ENUM ('PASS', 'FAIL');

-- CreateTable
CREATE TABLE "PaceDiagnosticResult" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "outcome" "PaceDiagnosticOutcome" NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaceDiagnosticResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaceDiagnosticRetraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "retractedByUserId" TEXT NOT NULL,
    "retractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaceDiagnosticRetraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaceDiagnosticResult_tenantId_childId_subjectId_recordedAt__idx" ON "PaceDiagnosticResult"("tenantId", "childId", "subjectId", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaceDiagnosticResult_id_tenantId_key" ON "PaceDiagnosticResult"("id", "tenantId");

-- CreateIndex
CREATE INDEX "PaceDiagnosticRetraction_tenantId_retractedAt_id_idx" ON "PaceDiagnosticRetraction"("tenantId", "retractedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PaceDiagnosticRetraction_id_tenantId_key" ON "PaceDiagnosticRetraction"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaceDiagnosticRetraction_resultId_tenantId_key" ON "PaceDiagnosticRetraction"("resultId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentSubjectEnrollment_id_tenantId_childId_subjectId_key" ON "StudentSubjectEnrollment"("id", "tenantId", "childId", "subjectId");

-- AddForeignKey
ALTER TABLE "PaceDiagnosticResult" ADD CONSTRAINT "PaceDiagnosticResult_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticResult" ADD CONSTRAINT "PaceDiagnosticResult_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticResult" ADD CONSTRAINT "PaceDiagnosticResult_subjectId_tenantId_fkey" FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticResult" ADD CONSTRAINT "PaceDiagnosticResult_enrollmentId_tenantId_childId_subject_fkey" FOREIGN KEY ("enrollmentId", "tenantId", "childId", "subjectId") REFERENCES "StudentSubjectEnrollment"("id", "tenantId", "childId", "subjectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticResult" ADD CONSTRAINT "PaceDiagnosticResult_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticRetraction" ADD CONSTRAINT "PaceDiagnosticRetraction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticRetraction" ADD CONSTRAINT "PaceDiagnosticRetraction_resultId_tenantId_fkey" FOREIGN KEY ("resultId", "tenantId") REFERENCES "PaceDiagnosticResult"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaceDiagnosticRetraction" ADD CONSTRAINT "PaceDiagnosticRetraction_retractedByUserId_fkey" FOREIGN KEY ("retractedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Diagnostic facts retain their original scope and can only be corrected by a
-- separate retraction fact. The enrollment reference proves child and subject
-- ownership at the database boundary, including after that enrollment ends.
ALTER TABLE "PaceDiagnosticResult"
  ADD CONSTRAINT "PaceDiagnosticResult_level_check" CHECK ("level" BETWEEN 1 AND 5);
ALTER TABLE "PaceDiagnosticRetraction"
  ADD CONSTRAINT "PaceDiagnosticRetraction_reason_check"
  CHECK (length(btrim("reason")) BETWEEN 1 AND 2000);

CREATE FUNCTION app.require_active_pace_diagnostic_enrollment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW."recordedAt" := pg_catalog.statement_timestamp();

  IF NOT EXISTS (
    SELECT 1
    FROM app."StudentSubjectEnrollment"
    WHERE "id" = NEW."enrollmentId"
      AND "tenantId" = NEW."tenantId"
      AND "childId" = NEW."childId"
      AND "subjectId" = NEW."subjectId"
      AND "status" = 'ACTIVE'
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'Diagnostic result requires an active subject enrollment'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.require_active_pace_diagnostic_enrollment() FROM PUBLIC;

CREATE FUNCTION app.set_pace_diagnostic_retraction_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."retractedAt" := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.set_pace_diagnostic_retraction_time() FROM PUBLIC;

CREATE TRIGGER "PaceDiagnosticResult_require_active_enrollment"
BEFORE INSERT ON "PaceDiagnosticResult"
FOR EACH ROW EXECUTE FUNCTION app.require_active_pace_diagnostic_enrollment();

CREATE TRIGGER "PaceDiagnosticResult_require_actor_membership"
BEFORE INSERT ON "PaceDiagnosticResult"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('recordedByUserId');

CREATE TRIGGER "PaceDiagnosticRetraction_set_time"
BEFORE INSERT ON "PaceDiagnosticRetraction"
FOR EACH ROW EXECUTE FUNCTION app.set_pace_diagnostic_retraction_time();

CREATE TRIGGER "PaceDiagnosticRetraction_require_actor_membership"
BEFORE INSERT ON "PaceDiagnosticRetraction"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('retractedByUserId');

CREATE TRIGGER "PaceDiagnosticResult_immutable"
BEFORE UPDATE OR DELETE ON "PaceDiagnosticResult"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

CREATE TRIGGER "PaceDiagnosticRetraction_immutable"
BEFORE UPDATE OR DELETE ON "PaceDiagnosticRetraction"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['PaceDiagnosticResult', 'PaceDiagnosticRetraction']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_rls',
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
