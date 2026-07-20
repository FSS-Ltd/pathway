-- CreateEnum
CREATE TYPE "ReportBundleStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subjectId" TEXT,
    "loggedByUserId" TEXT NOT NULL,
    "activityDate" DATE NOT NULL,
    "minutes" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "learningLogId" TEXT,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportBundle" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "status" "ReportBundleStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ReportBundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subject_tenantId_idx" ON "Subject"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_tenantId_name_key" ON "Subject"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LearningLog_tenantId_activityDate_idx" ON "LearningLog"("tenantId", "activityDate");

-- CreateIndex
CREATE INDEX "LearningLog_tenantId_childId_activityDate_idx" ON "LearningLog"("tenantId", "childId", "activityDate");

-- CreateIndex
CREATE INDEX "LearningLog_subjectId_idx" ON "LearningLog"("subjectId");

-- CreateIndex
CREATE INDEX "Evidence_tenantId_childId_idx" ON "Evidence"("tenantId", "childId");

-- CreateIndex
CREATE INDEX "Evidence_learningLogId_idx" ON "Evidence"("learningLogId");

-- CreateIndex
CREATE INDEX "ReportBundle_tenantId_childId_idx" ON "ReportBundle"("tenantId", "childId");

-- CreateIndex
CREATE INDEX "ReportBundle_status_idx" ON "ReportBundle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Child_id_tenantId_key" ON "Child"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_id_tenantId_key" ON "Subject"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningLog_id_tenantId_key" ON "LearningLog"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportBundle" ADD CONSTRAINT "ReportBundle_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tenant-scoped links prevent a Learning row from referencing another tenant's data.
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_subjectId_tenantId_fkey" FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_loggedByUserId_fkey" FOREIGN KEY ("loggedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_learningLogId_tenantId_fkey" FOREIGN KEY ("learningLogId", "tenantId") REFERENCES "LearningLog"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportBundle" ADD CONSTRAINT "ReportBundle_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportBundle" ADD CONSTRAINT "ReportBundle_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- User.tenantId is a deprecated single-site convenience field. Learning actors
-- must instead belong to the row's tenant through the current membership model.
CREATE FUNCTION app.require_learning_actor_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  actor_user_id text := to_jsonb(NEW) ->> TG_ARGV[0];
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "SiteMembership"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = actor_user_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM "UserTenantRole"
    WHERE "tenantId" = NEW."tenantId"
      AND "userId" = actor_user_id
  ) THEN
    RAISE EXCEPTION 'Learning actor must belong to the tenant'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "LearningLog_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "loggedByUserId" ON "LearningLog"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('loggedByUserId');

CREATE TRIGGER "Evidence_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "uploadedByUserId" ON "Evidence"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('uploadedByUserId');

CREATE TRIGGER "ReportBundle_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "requestedByUserId" ON "ReportBundle"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('requestedByUserId');

-- Learning tables expose tenantId directly, so apply the established tenant RLS policy.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Subject', 'LearningLog', 'Evidence', 'ReportBundle']
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
