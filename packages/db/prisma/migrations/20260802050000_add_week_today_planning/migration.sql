-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'IMPORTANT');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "subjectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "planNotes" TEXT,
    "resourcesNote" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "dueAt" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "completedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "who" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable: LearningLog gains an optional link back to the Activity it completes
ALTER TABLE "LearningLog" ADD COLUMN "activityId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_tenantId_scheduledAt_idx" ON "Activity"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Activity_tenantId_childId_scheduledAt_idx" ON "Activity"("tenantId", "childId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_id_tenantId_key" ON "Activity"("id", "tenantId");

-- CreateIndex
CREATE INDEX "Task_tenantId_dueAt_idx" ON "Task"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "Task_tenantId_completedAt_idx" ON "Task"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "CalendarItem_tenantId_scheduledAt_idx" ON "CalendarItem"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "LearningLog_activityId_idx" ON "LearningLog"("activityId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_childId_tenantId_fkey" FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Activity" ADD CONSTRAINT "Activity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarItem" ADD CONSTRAINT "CalendarItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningLog" ADD CONSTRAINT "LearningLog_activityId_tenantId_fkey" FOREIGN KEY ("activityId", "tenantId") REFERENCES "Activity"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same actor-membership guard already enforced on LearningLog/Evidence/ReportBundle
-- (see 20260720100000_add_learning_models): the acting user must belong to the
-- row's tenant, checked against SiteMembership or UserTenantRole.
CREATE TRIGGER "Activity_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "Activity"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('createdByUserId');

CREATE TRIGGER "Task_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "Task"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('createdByUserId');

CREATE TRIGGER "CalendarItem_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "CalendarItem"
FOR EACH ROW EXECUTE FUNCTION app.require_learning_actor_membership('createdByUserId');

-- Week/Today planning tables expose tenantId directly, so apply the established tenant RLS policy.
DO $$
DECLARE
  tbl text;
  policy_name text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['Activity', 'Task', 'CalendarItem']
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
