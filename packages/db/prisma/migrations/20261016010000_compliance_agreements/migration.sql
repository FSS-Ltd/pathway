-- Keep new tables with the physical Prisma core tables in either supported layout.
DO $$
DECLARE
  core_schema text;
BEGIN
  SELECT n.nspname INTO STRICT core_schema
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE c.relname = 'Org'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('app', 'public');

  PERFORM pg_catalog.set_config(
    'search_path',
    pg_catalog.format(
      '%I, %I',
      core_schema,
      CASE core_schema WHEN 'app' THEN 'public' ELSE 'app' END
    ),
    false
  );
END;
$$;

-- CreateEnum
CREATE TYPE "ComplianceAgreementAcceptanceMethod" AS ENUM ('ACKNOWLEDGED', 'RECORDED_SIGNED_COPY');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'COMPLIANCE_AGREEMENT';

-- CreateTable
CREATE TABLE "ComplianceAgreementDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "latestVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ComplianceAgreementDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAgreementVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "originalStorageKey" TEXT,
    "originalFileName" TEXT,
    "originalSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ComplianceAgreementVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAgreementAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByUserId" TEXT NOT NULL,
    "adultConfirmedAt" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceAgreementAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAgreementAcceptance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "method" "ComplianceAgreementAcceptanceMethod" NOT NULL,
    "typedName" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,
    "signedOn" DATE,
    "signedStorageKey" TEXT,
    "signedFileName" TEXT,
    "signedSha256" TEXT,

    CONSTRAINT "ComplianceAgreementAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceAgreementDocument_tenantId_orgId_createdAt_id_idx" ON "ComplianceAgreementDocument"("tenantId", "orgId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementDocument_id_tenantId_orgId_key" ON "ComplianceAgreementDocument"("id", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "ComplianceAgreementVersion_tenantId_orgId_documentId_versio_idx" ON "ComplianceAgreementVersion"("tenantId", "orgId", "documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementVersion_id_tenantId_orgId_key" ON "ComplianceAgreementVersion"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementVersion_documentId_version_key" ON "ComplianceAgreementVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ComplianceAgreementAssignment_tenantId_orgId_recipientUserI_idx" ON "ComplianceAgreementAssignment"("tenantId", "orgId", "recipientUserId", "assignedAt", "id");

-- CreateIndex
CREATE INDEX "ComplianceAgreementAssignment_tenantId_orgId_assignedAt_id_idx" ON "ComplianceAgreementAssignment"("tenantId", "orgId", "assignedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementAssignment_id_tenantId_orgId_key" ON "ComplianceAgreementAssignment"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementAssignment_versionId_recipientUserId_key" ON "ComplianceAgreementAssignment"("versionId", "recipientUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementAcceptance_assignmentId_key" ON "ComplianceAgreementAcceptance"("assignmentId");

-- CreateIndex
CREATE INDEX "ComplianceAgreementAcceptance_tenantId_orgId_recordedAt_id_idx" ON "ComplianceAgreementAcceptance"("tenantId", "orgId", "recordedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementAcceptance_id_tenantId_orgId_key" ON "ComplianceAgreementAcceptance"("id", "tenantId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAgreementAcceptance_assignmentId_tenantId_orgId_key" ON "ComplianceAgreementAcceptance"("assignmentId", "tenantId", "orgId");

-- AddForeignKey
ALTER TABLE "ComplianceAgreementDocument" ADD CONSTRAINT "ComplianceAgreementDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementDocument" ADD CONSTRAINT "ComplianceAgreementDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementDocument" ADD CONSTRAINT "ComplianceAgreementDocument_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementVersion" ADD CONSTRAINT "ComplianceAgreementVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementVersion" ADD CONSTRAINT "ComplianceAgreementVersion_documentId_tenantId_orgId_fkey" FOREIGN KEY ("documentId", "tenantId", "orgId") REFERENCES "ComplianceAgreementDocument"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementVersion" ADD CONSTRAINT "ComplianceAgreementVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementVersion" ADD CONSTRAINT "ComplianceAgreementVersion_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAssignment" ADD CONSTRAINT "ComplianceAgreementAssignment_versionId_tenantId_orgId_fkey" FOREIGN KEY ("versionId", "tenantId", "orgId") REFERENCES "ComplianceAgreementVersion"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAssignment" ADD CONSTRAINT "ComplianceAgreementAssignment_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAssignment" ADD CONSTRAINT "ComplianceAgreementAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAssignment" ADD CONSTRAINT "ComplianceAgreementAssignment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAssignment" ADD CONSTRAINT "ComplianceAgreementAssignment_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAcceptance" ADD CONSTRAINT "ComplianceAgreementAcceptance_assignmentId_tenantId_orgId_fkey" FOREIGN KEY ("assignmentId", "tenantId", "orgId") REFERENCES "ComplianceAgreementAssignment"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAcceptance" ADD CONSTRAINT "ComplianceAgreementAcceptance_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAcceptance" ADD CONSTRAINT "ComplianceAgreementAcceptance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAgreementAcceptance" ADD CONSTRAINT "ComplianceAgreementAcceptance_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "ComplianceAgreementDocument" ADD CONSTRAINT "AgreementDocument_positive_version" CHECK ("latestVersion" > 0);
ALTER TABLE "ComplianceAgreementVersion"
  ADD CONSTRAINT "AgreementVersion_positive_version" CHECK ("version" > 0),
  ADD CONSTRAINT "AgreementVersion_original_file" CHECK (
    ("originalStorageKey" IS NULL AND "originalFileName" IS NULL AND "originalSha256" IS NULL)
    OR ("originalStorageKey" IS NOT NULL AND "originalFileName" IS NOT NULL AND "originalSha256" IS NOT NULL AND "originalSha256" ~ '^[a-f0-9]{64}$'));
ALTER TABLE "ComplianceAgreementAcceptance" ADD CONSTRAINT "AgreementAcceptance_method_fields" CHECK (
  ("method" = 'ACKNOWLEDGED' AND "signedOn" IS NULL AND "signedStorageKey" IS NULL AND "signedFileName" IS NULL AND "signedSha256" IS NULL)
  OR ("method" = 'RECORDED_SIGNED_COPY' AND "signedOn" IS NOT NULL AND "signedStorageKey" IS NOT NULL AND "signedFileName" IS NOT NULL AND "signedSha256" IS NOT NULL AND "signedSha256" ~ '^[a-f0-9]{64}$'));

CREATE FUNCTION app.validate_agreement_document_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (to_jsonb(NEW) - 'latestVersion') IS DISTINCT FROM (to_jsonb(OLD) - 'latestVersion')
     OR NEW."latestVersion" <> OLD."latestVersion" + 1 THEN
    RAISE EXCEPTION 'Agreement document only permits the next version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ComplianceAgreementDocument_identity"
  BEFORE UPDATE ON "ComplianceAgreementDocument" FOR EACH ROW EXECUTE FUNCTION app.validate_agreement_document_update();

CREATE FUNCTION app.validate_agreement_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE recipient_valid boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'supersededAt') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededAt')
       OR OLD."supersededAt" IS NOT NULL OR NEW."supersededAt" IS NULL THEN
      RAISE EXCEPTION 'Agreement assignment only permits one supersession' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  EXECUTE pg_catalog.format(
    'SELECT EXISTS (SELECT 1 FROM %1$I."User" u WHERE u.id = $1 AND u."isActive"
      AND (u."dateOfBirth" IS NULL OR u."dateOfBirth" <= CURRENT_DATE - INTERVAL ''18 years'') AND
      (u."tenantId" = $2 OR EXISTS (SELECT 1 FROM %1$I."SiteMembership" m WHERE m."userId" = u.id AND m."tenantId" = $2)
       OR EXISTS (SELECT 1 FROM %1$I."UserTenantRole" m WHERE m."userId" = u.id AND m."tenantId" = $2)))',
    TG_TABLE_SCHEMA
  ) INTO recipient_valid USING NEW."recipientUserId", NEW."tenantId";
  IF NOT recipient_valid THEN
    RAISE EXCEPTION 'Agreement recipient must be an active adult site member' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ComplianceAgreementAssignment_identity"
  BEFORE INSERT OR UPDATE ON "ComplianceAgreementAssignment" FOR EACH ROW EXECUTE FUNCTION app.validate_agreement_assignment();

CREATE FUNCTION app.reject_agreement_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Agreement history is immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "ComplianceAgreementAssignment_no_delete" BEFORE DELETE ON "ComplianceAgreementAssignment" FOR EACH ROW EXECUTE FUNCTION app.reject_agreement_history_mutation();
CREATE TRIGGER "ComplianceAgreementVersion_immutable" BEFORE UPDATE OR DELETE ON "ComplianceAgreementVersion" FOR EACH ROW EXECUTE FUNCTION app.reject_agreement_history_mutation();
CREATE TRIGGER "ComplianceAgreementAcceptance_immutable" BEFORE UPDATE OR DELETE ON "ComplianceAgreementAcceptance" FOR EACH ROW EXECUTE FUNCTION app.reject_agreement_history_mutation();

ALTER TABLE "ComplianceAgreementDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAgreementDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceAgreementDocument_select" ON "ComplianceAgreementDocument" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementDocument_insert" ON "ComplianceAgreementDocument" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementDocument_update" ON "ComplianceAgreementDocument" FOR UPDATE USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceAgreementDocument" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementDocument" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementDocument" FROM authenticated; END IF;
END $$;

ALTER TABLE "ComplianceAgreementVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAgreementVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceAgreementVersion_select" ON "ComplianceAgreementVersion" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementVersion_insert" ON "ComplianceAgreementVersion" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceAgreementVersion" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementVersion" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementVersion" FROM authenticated; END IF;
END $$;

ALTER TABLE "ComplianceAgreementAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAgreementAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceAgreementAssignment_select" ON "ComplianceAgreementAssignment" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementAssignment_insert" ON "ComplianceAgreementAssignment" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementAssignment_update" ON "ComplianceAgreementAssignment" FOR UPDATE USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceAgreementAssignment" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementAssignment" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementAssignment" FROM authenticated; END IF;
END $$;

ALTER TABLE "ComplianceAgreementAcceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAgreementAcceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceAgreementAcceptance_select" ON "ComplianceAgreementAcceptance" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAgreementAcceptance_insert" ON "ComplianceAgreementAcceptance" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceAgreementAcceptance" FROM PUBLIC;
DO $$ BEGIN
  IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementAcceptance" FROM anon; END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAgreementAcceptance" FROM authenticated; END IF;
END $$;
