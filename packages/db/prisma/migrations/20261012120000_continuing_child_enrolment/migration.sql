-- Keep Prisma models in the schema containing the physical core tables. Production
-- uses public; fresh installations may use app. Views cannot be FK targets.
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

ALTER TYPE "AuditEntityType" ADD VALUE 'ENROLMENT';
ALTER TYPE "AuditEntityType" ADD VALUE 'ENROLMENT_ROLL';

CREATE TABLE "OrgChildIdentity" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "localReference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgChildIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgChildIdentity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrgChildIdentity_local_reference_nonempty" CHECK (length(trim("localReference")) > 0)
);
CREATE UNIQUE INDEX "OrgChildIdentity_id_orgId_key" ON "OrgChildIdentity"("id", "orgId");
CREATE UNIQUE INDEX "OrgChildIdentity_orgId_localReference_key" ON "OrgChildIdentity"("orgId", "localReference");
CREATE INDEX "OrgChildIdentity_orgId_idx" ON "OrgChildIdentity"("orgId");

CREATE TABLE "OrgChildSiteLink" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgChildSiteLink_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgChildSiteLink_identityId_orgId_fkey" FOREIGN KEY ("identityId", "orgId") REFERENCES "OrgChildIdentity"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrgChildSiteLink_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "OrgChildSiteLink_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OrgChildSiteLink_childId_tenantId_key" ON "OrgChildSiteLink"("childId", "tenantId");
CREATE INDEX "OrgChildSiteLink_orgId_identityId_idx" ON "OrgChildSiteLink"("orgId", "identityId");
CREATE INDEX "OrgChildSiteLink_tenantId_idx" ON "OrgChildSiteLink"("tenantId");

CREATE TABLE "EnrolmentRevision" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "periods" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrolmentRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrolmentRevision_identityId_orgId_fkey" FOREIGN KEY ("identityId", "orgId") REFERENCES "OrgChildIdentity"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrolmentRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrolmentRevision_version_positive" CHECK ("version" > 0),
  CONSTRAINT "EnrolmentRevision_periods_array" CHECK (jsonb_typeof("periods") = 'array'),
  CONSTRAINT "EnrolmentRevision_reason_nonempty" CHECK (length(trim("reason")) > 0)
);
CREATE UNIQUE INDEX "EnrolmentRevision_identityId_version_key" ON "EnrolmentRevision"("identityId", "version");
CREATE INDEX "EnrolmentRevision_orgId_recordedAt_idx" ON "EnrolmentRevision"("orgId", "recordedAt");
CREATE INDEX "EnrolmentRevision_identityId_recordedAt_idx" ON "EnrolmentRevision"("identityId", "recordedAt");

CREATE TABLE "EnrolmentRollConfirmation" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "effectiveOn" DATE NOT NULL,
  "revisionCutoff" TIMESTAMP(3) NOT NULL,
  "identityIds" JSONB NOT NULL,
  "enrolledCount" INTEGER NOT NULL,
  "confirmerUserId" TEXT NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrolmentRollConfirmation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrolmentRollConfirmation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrolmentRollConfirmation_confirmerUserId_fkey" FOREIGN KEY ("confirmerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EnrolmentRollConfirmation_nonnegative_count" CHECK ("enrolledCount" >= 0),
  CONSTRAINT "EnrolmentRollConfirmation_ids_array" CHECK (jsonb_typeof("identityIds") = 'array')
);
CREATE INDEX "EnrolmentRollConfirmation_orgId_confirmedAt_idx" ON "EnrolmentRollConfirmation"("orgId", "confirmedAt");
CREATE INDEX "EnrolmentRollConfirmation_orgId_effectiveOn_idx" ON "EnrolmentRollConfirmation"("orgId", "effectiveOn");

CREATE FUNCTION app.reject_enrolment_history_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Enrolment history is immutable' USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER "EnrolmentRevision_immutable" BEFORE UPDATE OR DELETE ON "EnrolmentRevision"
FOR EACH ROW EXECUTE FUNCTION app.reject_enrolment_history_mutation();
CREATE TRIGGER "EnrolmentRollConfirmation_immutable" BEFORE UPDATE OR DELETE ON "EnrolmentRollConfirmation"
FOR EACH ROW EXECUTE FUNCTION app.reject_enrolment_history_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['OrgChildIdentity', 'OrgChildSiteLink', 'EnrolmentRevision', 'EnrolmentRollConfirmation'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ("orgId" = app.current_org_id())', table_name || '_org_select', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK ("orgId" = app.current_org_id())', table_name || '_org_insert', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM PUBLIC', table_name);
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM anon', table_name);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END;
$$;
