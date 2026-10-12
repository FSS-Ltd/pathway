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

CREATE TABLE "ChildRegistrationSubmission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "formVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChildRegistrationSubmission_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChildRegistrationSubmission_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChildRegistrationSubmission_childId_fkey"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ChildRegistrationSubmission_tenantId_childId_submittedAt_idx"
  ON "ChildRegistrationSubmission"("tenantId", "childId", "submittedAt");

ALTER TABLE "ChildRegistrationSubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChildRegistrationSubmission" FORCE ROW LEVEL SECURITY;
-- Public signup may insert after its token has resolved a tenant. Reads require
-- an authenticated staff membership in that same site or its organisation.
CREATE POLICY "ChildRegistrationSubmission_insert"
  ON "ChildRegistrationSubmission" FOR INSERT
  WITH CHECK ("tenantId" = app.current_tenant_id());

-- The restricted database role must be able to see its own staff membership
-- so the registration policy can verify it without privileged functions.
CREATE POLICY "SiteMembership_registration_staff_self_read"
  ON "SiteMembership" FOR SELECT
  USING (
    "tenantId" = app.current_tenant_id()
    AND "userId" = NULLIF(current_setting('app.user_id', true), '')
    AND "role" IN ('STAFF', 'SITE_ADMIN')
  );

CREATE POLICY "ChildRegistrationSubmission_staff_select"
  ON "ChildRegistrationSubmission" FOR SELECT
  USING (
    "tenantId" = app.current_tenant_id()
    AND NULLIF(current_setting('app.user_id', true), '') IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM "SiteMembership" membership
        WHERE membership."tenantId" = "ChildRegistrationSubmission"."tenantId"
          AND membership."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND membership."role" IN ('STAFF', 'SITE_ADMIN')
      )
      OR EXISTS (
        SELECT 1 FROM "UserTenantRole" role
        WHERE role."tenantId" = "ChildRegistrationSubmission"."tenantId"
          AND role."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND role."role" IN ('ADMIN', 'COORDINATOR', 'TEACHER', 'LEAD', 'SUPPORT')
      )
      OR EXISTS (
        SELECT 1 FROM "OrgMembership" membership
        JOIN "Tenant" site ON site."orgId" = membership."orgId"
        WHERE site."id" = "ChildRegistrationSubmission"."tenantId"
          AND membership."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND membership."role" = 'ORG_ADMIN'
      )
      OR EXISTS (
        SELECT 1 FROM "UserOrgRole" role
        JOIN "Tenant" site ON site."orgId" = role."orgId"
        WHERE site."id" = "ChildRegistrationSubmission"."tenantId"
          AND role."userId" = NULLIF(current_setting('app.user_id', true), '')
          AND role."role" = 'ORG_ADMIN'
      )
    )
  );
