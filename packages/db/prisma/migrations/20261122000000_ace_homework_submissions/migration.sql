-- CreateEnum
CREATE TYPE "AceHomeworkSubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "AceHomeworkEvidenceStatus" AS ENUM ('PENDING', 'CLEAN', 'REJECTED');

-- CreateTable
CREATE TABLE "AceHomeworkSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "AceHomeworkSubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "draftText" VARCHAR(5000) NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AceHomeworkSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceHomeworkSubmissionVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "text" VARCHAR(5000) NOT NULL,
    "evidenceId" TEXT,
    "late" BOOLEAN NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AceHomeworkSubmissionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AceHomeworkEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "objectKey" VARCHAR(260) NOT NULL,
    "fileName" VARCHAR(160) NOT NULL,
    "mimeType" VARCHAR(80) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "status" "AceHomeworkEvidenceStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inspectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AceHomeworkEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AceHomeworkSubmission_tenantId_updatedAt_idx" ON "AceHomeworkSubmission"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmission_id_tenantId_key" ON "AceHomeworkSubmission"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmission_recipientId_tenantId_key" ON "AceHomeworkSubmission"("recipientId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmissionVersion_id_tenantId_key" ON "AceHomeworkSubmissionVersion"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmissionVersion_tenantId_submissionId_number_key" ON "AceHomeworkSubmissionVersion"("tenantId", "submissionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmissionVersion_tenantId_submissionId_idempote_key" ON "AceHomeworkSubmissionVersion"("tenantId", "submissionId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkSubmissionVersion_evidenceId_tenantId_key" ON "AceHomeworkSubmissionVersion"("evidenceId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkEvidence_objectKey_key" ON "AceHomeworkEvidence"("objectKey");

-- CreateIndex
CREATE INDEX "AceHomeworkEvidence_tenantId_recipientId_status_idx" ON "AceHomeworkEvidence"("tenantId", "recipientId", "status");

-- CreateIndex
CREATE INDEX "AceHomeworkEvidence_status_expiresAt_idx" ON "AceHomeworkEvidence"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AceHomeworkEvidence_id_tenantId_key" ON "AceHomeworkEvidence"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "AceHomeworkSubmission" ADD CONSTRAINT "AceHomeworkSubmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkSubmission" ADD CONSTRAINT "AceHomeworkSubmission_recipientId_tenantId_fkey" FOREIGN KEY ("recipientId", "tenantId") REFERENCES "AceHomeworkRecipient"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkSubmissionVersion" ADD CONSTRAINT "AceHomeworkSubmissionVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkSubmissionVersion" ADD CONSTRAINT "AceHomeworkSubmissionVersion_submissionId_tenantId_fkey" FOREIGN KEY ("submissionId", "tenantId") REFERENCES "AceHomeworkSubmission"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkSubmissionVersion" ADD CONSTRAINT "AceHomeworkSubmissionVersion_evidenceId_tenantId_fkey" FOREIGN KEY ("evidenceId", "tenantId") REFERENCES "AceHomeworkEvidence"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkEvidence" ADD CONSTRAINT "AceHomeworkEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkEvidence" ADD CONSTRAINT "AceHomeworkEvidence_recipientId_tenantId_fkey" FOREIGN KEY ("recipientId", "tenantId") REFERENCES "AceHomeworkRecipient"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AceHomeworkEvidence" ADD CONSTRAINT "AceHomeworkEvidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AceHomeworkSubmission"
  ADD CONSTRAINT "AceHomeworkSubmission_version_check" CHECK ("version" >= 0);
ALTER TABLE "AceHomeworkSubmissionVersion"
  ADD CONSTRAINT "AceHomeworkSubmissionVersion_number_check" CHECK ("number" > 0);
ALTER TABLE "AceHomeworkEvidence"
  ADD CONSTRAINT "AceHomeworkEvidence_size_check" CHECK ("byteLength" > 0 AND "byteLength" <= 2097152),
  ADD CONSTRAINT "AceHomeworkEvidence_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "AceHomeworkEvidence_inspection_check" CHECK (
    ("status" = 'PENDING' AND "inspectedAt" IS NULL)
    OR ("status" IN ('CLEAN', 'REJECTED') AND "inspectedAt" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION app.assert_ace_homework_submission_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  submission_recipient text;
BEGIN
  SELECT "recipientId" INTO submission_recipient FROM "AceHomeworkSubmission"
    WHERE "id" = NEW."submissionId" AND "tenantId" = NEW."tenantId";
  IF submission_recipient IS NULL THEN
    RAISE EXCEPTION 'homework submission not found' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."evidenceId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "AceHomeworkEvidence"
      WHERE "id" = NEW."evidenceId" AND "tenantId" = NEW."tenantId"
        AND "recipientId" = submission_recipient AND "status" = 'CLEAN'
  ) THEN
    RAISE EXCEPTION 'homework evidence is not clean for this recipient'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_homework_submission_version() FROM PUBLIC;
CREATE TRIGGER "AceHomeworkSubmissionVersion_validate_insert"
BEFORE INSERT ON "AceHomeworkSubmissionVersion"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_homework_submission_version();
CREATE TRIGGER "AceHomeworkSubmissionVersion_reject_update"
BEFORE UPDATE ON "AceHomeworkSubmissionVersion"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_homework_recipient_update();
CREATE TRIGGER "AceHomeworkSubmissionVersion_reject_delete"
BEFORE DELETE ON "AceHomeworkSubmissionVersion"
FOR EACH ROW EXECUTE FUNCTION app.reject_forward_state_delete();

CREATE OR REPLACE FUNCTION app.assert_ace_homework_evidence_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PENDING'
     OR NEW."status" NOT IN ('CLEAN', 'REJECTED')
     OR ROW(NEW."id", NEW."tenantId", NEW."recipientId", NEW."uploadedByUserId",
            NEW."fileName", NEW."mimeType",
            NEW."byteLength", NEW."sha256", NEW."expiresAt", NEW."createdAt")
        IS DISTINCT FROM
        ROW(OLD."id", OLD."tenantId", OLD."recipientId", OLD."uploadedByUserId",
            OLD."fileName", OLD."mimeType",
            OLD."byteLength", OLD."sha256", OLD."expiresAt", OLD."createdAt")
     OR (NEW."status" = 'REJECTED' AND NEW."objectKey" <> OLD."objectKey")
     OR (NEW."status" = 'CLEAN' AND NEW."objectKey" = OLD."objectKey")
  THEN
    RAISE EXCEPTION 'homework evidence is immutable after inspection'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.assert_ace_homework_evidence_transition() FROM PUBLIC;
CREATE TRIGGER "AceHomeworkEvidence_validate_update"
BEFORE UPDATE ON "AceHomeworkEvidence"
FOR EACH ROW EXECUTE FUNCTION app.assert_ace_homework_evidence_transition();

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'AceHomeworkSubmission', 'AceHomeworkSubmissionVersion', 'AceHomeworkEvidence'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id()) WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
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
