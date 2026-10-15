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
CREATE TYPE "ComplianceAttestationStatus" AS ENUM ('COMPLETE', 'NOT_STARTED', 'NOT_APPLICABLE');

-- AlterEnum
ALTER TYPE "AuditEntityType" ADD VALUE 'COMPLIANCE_TRACKER';

-- CreateTable
CREATE TABLE "ComplianceSiteProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "jurisdictionId" TEXT,
    "version" INTEGER NOT NULL,
    "profileJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByUserId" TEXT NOT NULL,

    CONSTRAINT "ComplianceSiteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceProfileRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profileJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ComplianceProfileRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAttestation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "requirementId" TEXT NOT NULL,
    "requirementVersion" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "requirementJson" TEXT NOT NULL,
    "status" "ComplianceAttestationStatus" NOT NULL,
    "notes" TEXT NOT NULL,
    "notApplicableReason" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,

    CONSTRAINT "ComplianceAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceEvidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "requirementVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ComplianceEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSiteProfile_tenantId_key" ON "ComplianceSiteProfile"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceSiteProfile_orgId_tenantId_idx" ON "ComplianceSiteProfile"("orgId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceSiteProfile_id_tenantId_orgId_key" ON "ComplianceSiteProfile"("id", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "ComplianceProfileRevision_tenantId_orgId_version_idx" ON "ComplianceProfileRevision"("tenantId", "orgId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceProfileRevision_profileId_version_tenantId_orgId_key" ON "ComplianceProfileRevision"("profileId", "version", "tenantId", "orgId");

-- CreateIndex
CREATE INDEX "ComplianceAttestation_tenantId_orgId_requirementId_id_idx" ON "ComplianceAttestation"("tenantId", "orgId", "requirementId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceAttestation_tenantId_requirementId_revision_key" ON "ComplianceAttestation"("tenantId", "requirementId", "revision");

-- CreateIndex
CREATE INDEX "ComplianceEvidence_tenantId_orgId_requirementId_id_idx" ON "ComplianceEvidence"("tenantId", "orgId", "requirementId", "id");

-- AddForeignKey
ALTER TABLE "ComplianceSiteProfile" ADD CONSTRAINT "ComplianceSiteProfile_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSiteProfile" ADD CONSTRAINT "ComplianceSiteProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSiteProfile" ADD CONSTRAINT "ComplianceSiteProfile_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "Jurisdiction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceSiteProfile" ADD CONSTRAINT "ComplianceSiteProfile_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfileRevision" ADD CONSTRAINT "ComplianceProfileRevision_profileId_tenantId_orgId_fkey" FOREIGN KEY ("profileId", "tenantId", "orgId") REFERENCES "ComplianceSiteProfile"("id", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfileRevision" ADD CONSTRAINT "ComplianceProfileRevision_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfileRevision" ADD CONSTRAINT "ComplianceProfileRevision_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceProfileRevision" ADD CONSTRAINT "ComplianceProfileRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_profileId_profileVersion_tenantId_or_fkey" FOREIGN KEY ("profileId", "profileVersion", "tenantId", "orgId") REFERENCES "ComplianceProfileRevision"("profileId", "version", "tenantId", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE FUNCTION app.reject_tracker_history_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Compliance history is immutable' USING ERRCODE = '23514'; END $$;
CREATE FUNCTION app.validate_tracker_profile_update() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW."tenantId" IS DISTINCT FROM OLD."tenantId" OR NEW."orgId" IS DISTINCT FROM OLD."orgId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR NEW.version <> OLD.version + 1 THEN
  RAISE EXCEPTION 'Profile identity is immutable and version must increase' USING ERRCODE = '23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ComplianceSiteProfile_version" BEFORE UPDATE ON "ComplianceSiteProfile" FOR EACH ROW EXECUTE FUNCTION app.validate_tracker_profile_update();
CREATE FUNCTION app.validate_tracker_evidence_archive() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF (to_jsonb(NEW) - 'archivedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'archivedAt') OR OLD."archivedAt" IS NOT NULL OR NEW."archivedAt" IS NULL THEN
 RAISE EXCEPTION 'Evidence only permits one archive' USING ERRCODE = '23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "ComplianceEvidence_archive" BEFORE UPDATE ON "ComplianceEvidence" FOR EACH ROW EXECUTE FUNCTION app.validate_tracker_evidence_archive();
ALTER TABLE "ComplianceSiteProfile" ADD CONSTRAINT "ComplianceSiteProfile_positive_version" CHECK (version > 0);
ALTER TABLE "ComplianceProfileRevision" ADD CONSTRAINT "ComplianceProfileRevision_positive_version" CHECK (version > 0);
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_positive_revisions" CHECK (revision > 0 AND "requirementVersion" > 0 AND "profileVersion" > 0);
ALTER TABLE "ComplianceEvidence" ADD CONSTRAINT "ComplianceEvidence_file_hash" CHECK ("requirementVersion" > 0 AND sha256 ~ '^[a-f0-9]{64}$');
CREATE TRIGGER "ComplianceSiteProfile_immutable" BEFORE DELETE ON "ComplianceSiteProfile" FOR EACH ROW EXECUTE FUNCTION app.reject_tracker_history_mutation();
ALTER TABLE "ComplianceSiteProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceSiteProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceSiteProfile_select" ON "ComplianceSiteProfile" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceSiteProfile_insert" ON "ComplianceSiteProfile" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceSiteProfile_update" ON "ComplianceSiteProfile" FOR UPDATE USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceSiteProfile" FROM PUBLIC;
DO $$ BEGIN
 IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceSiteProfile" FROM anon; END IF;
 IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceSiteProfile" FROM authenticated; END IF;
END $$;
CREATE TRIGGER "ComplianceProfileRevision_immutable" BEFORE UPDATE OR DELETE ON "ComplianceProfileRevision" FOR EACH ROW EXECUTE FUNCTION app.reject_tracker_history_mutation();
ALTER TABLE "ComplianceProfileRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceProfileRevision" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceProfileRevision_select" ON "ComplianceProfileRevision" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceProfileRevision_insert" ON "ComplianceProfileRevision" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceProfileRevision" FROM PUBLIC;
DO $$ BEGIN
 IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceProfileRevision" FROM anon; END IF;
 IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceProfileRevision" FROM authenticated; END IF;
END $$;
CREATE TRIGGER "ComplianceAttestation_immutable" BEFORE UPDATE OR DELETE ON "ComplianceAttestation" FOR EACH ROW EXECUTE FUNCTION app.reject_tracker_history_mutation();
ALTER TABLE "ComplianceAttestation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceAttestation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceAttestation_select" ON "ComplianceAttestation" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceAttestation_insert" ON "ComplianceAttestation" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceAttestation" FROM PUBLIC;
DO $$ BEGIN
 IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAttestation" FROM anon; END IF;
 IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceAttestation" FROM authenticated; END IF;
END $$;
CREATE TRIGGER "ComplianceEvidence_immutable" BEFORE DELETE ON "ComplianceEvidence" FOR EACH ROW EXECUTE FUNCTION app.reject_tracker_history_mutation();
ALTER TABLE "ComplianceEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ComplianceEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY "ComplianceEvidence_select" ON "ComplianceEvidence" FOR SELECT USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceEvidence_insert" ON "ComplianceEvidence" FOR INSERT WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
CREATE POLICY "ComplianceEvidence_update" ON "ComplianceEvidence" FOR UPDATE USING ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id()) WITH CHECK ("tenantId" = app.current_tenant_id() AND "orgId" = app.current_org_id());
REVOKE ALL PRIVILEGES ON "ComplianceEvidence" FROM PUBLIC;
DO $$ BEGIN
 IF to_regrole('anon') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceEvidence" FROM anon; END IF;
 IF to_regrole('authenticated') IS NOT NULL THEN REVOKE ALL PRIVILEGES ON "ComplianceEvidence" FROM authenticated; END IF;
END $$;

-- Missing choices only: never replace household content status or existing hierarchy.
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '78524e46-eaab-51e6-9d77-323dd26e8073','AT','Austria','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='AT' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'bc3900db-8201-5fe5-878c-b9b083756edc','BE','Belgium','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='BE' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '779058b6-82dd-574a-98bb-ed13a9212cfa','BG','Bulgaria','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='BG' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'f41375cc-f345-5bc4-a481-f1675ba84049','HR','Croatia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='HR' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '81b1eef8-d7f4-5592-95c3-2f760948c838','CY','Cyprus','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='CY' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'f38f5361-75b0-5372-be71-13130d9a15df','CZ','Czechia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='CZ' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '7aed8278-6d69-5294-bf04-c9dd8acd39f8','DK','Denmark','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='DK' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'fe8da81a-5e69-524a-ae12-7ad5a4e5e573','EE','Estonia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='EE' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'd33b2436-c857-5789-8aad-2759730cceaa','FI','Finland','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='FI' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '66d04e48-ff51-5c95-9892-72682211cfe6','FR','France','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='FR' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '064b4e72-966f-52f5-b0f0-96d15a0e8658','DE','Germany','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='DE' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'f27d40e8-856c-5b73-8ba8-34ecb28bfb88','GR','Greece','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='GR' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '9695d2e4-d156-55a5-b200-1399372e6f34','HU','Hungary','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='HU' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '04664994-b3e8-5473-bf8a-70ae31655ed5','IE','Ireland','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='IE' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'f774ec8f-71e9-5ddd-a406-d40e3d0cb900','IT','Italy','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='IT' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '11f36675-121a-578b-a0f7-16df25b4c491','LV','Latvia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='LV' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '1448096d-bdb1-5db4-8983-273e6a4062e7','LT','Lithuania','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='LT' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '9e5a0f94-da58-536c-b503-897ec6484774','LU','Luxembourg','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='LU' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'b7bf5357-498d-5c69-ad28-f701ef833c40','MT','Malta','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='MT' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '2554ed5e-f703-5584-822e-74bc0d4de1f4','NL','Netherlands','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='NL' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '6799674e-d49f-513f-b0e3-c2c27ddab003','PL','Poland','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='PL' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '1864dc68-9479-5f29-886a-420ec078fd27','PT','Portugal','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='PT' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '80280498-8cd0-56ea-b9fb-f61fc24809db','RO','Romania','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='RO' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '366a4949-d95d-51ef-a769-0e4568a69a7e','SK','Slovakia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='SK' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT 'ad9c1734-aaca-552e-8095-5c0b69eb7c81','SI','Slovenia','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='SI' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '11c9ce41-e779-5f95-91fd-72dc8d3bfd7d','ES','Spain','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='ES' AND level='COUNTRY');
INSERT INTO "Jurisdiction" (id,"countryCode",name,level,"contentStatus") SELECT '3791ac40-a46c-57fb-94ad-bd6b491dd458','SE','Sweden','COUNTRY','NOT_CONFIGURED' WHERE NOT EXISTS (SELECT 1 FROM "Jurisdiction" WHERE "countryCode"='SE' AND level='COUNTRY');
