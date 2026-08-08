-- NexSteps Home privacy & data (Plan 08e): synchronous household export
-- requests and support-routed account-deletion requests. No worker/queue -
-- DataExportRequest mirrors ReportBundle's own documented synchronous
-- generation shape (see 20260720100000_add_learning_models).

-- CreateEnum
CREATE TYPE "DataExportKind" AS ENUM ('FAMILY_DATA', 'REPORT_ARCHIVE');
CREATE TYPE "DataExportStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "DataExportRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "kind" "DataExportKind" NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountDeletionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataExportRequest_tenantId_kind_createdAt_idx" ON "DataExportRequest"("tenantId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AccountDeletionRequest_tenantId_createdAt_idx" ON "AccountDeletionRequest"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DataExportRequest" ADD CONSTRAINT "DataExportRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountDeletionRequest" ADD CONSTRAINT "AccountDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same actor-membership guard already enforced on LearningLog/Evidence/ReportBundle/
-- Activity/Task/CalendarItem (see 20260720100000_add_learning_models): the acting
-- user must belong to the row's tenant, checked against SiteMembership or
-- UserTenantRole.
CREATE TRIGGER "DataExportRequest_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "requestedById" ON "DataExportRequest"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('requestedById');

CREATE TRIGGER "AccountDeletionRequest_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "requestedById" ON "AccountDeletionRequest"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('requestedById');

-- Privacy tables expose tenantId directly, so apply the established tenant RLS policy.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['DataExportRequest', 'AccountDeletionRequest']
  LOOP
    policy_name := tbl || '_tenant_rls';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      policy_name,
      tbl
    );
  END LOOP;
END;
$$;
