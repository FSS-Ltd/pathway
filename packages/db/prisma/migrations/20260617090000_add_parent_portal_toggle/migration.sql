-- Add org-level parent portal control.
ALTER TABLE "Org" ADD COLUMN "parentPortalEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Store registration contacts that are child-record data only, not portal users.
CREATE TYPE "ChildGuardianContactType" AS ENUM ('PRIMARY_GUARDIAN', 'EMERGENCY_CONTACT');

CREATE TABLE "ChildGuardianContact" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationshipToChild" TEXT,
    "contactType" "ChildGuardianContactType" NOT NULL DEFAULT 'PRIMARY_GUARDIAN',
    "dataProcessingConsentAt" TIMESTAMP(3),
    "firstAidConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildGuardianContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChildGuardianContact_childId_idx" ON "ChildGuardianContact"("childId");
CREATE INDEX "ChildGuardianContact_tenantId_idx" ON "ChildGuardianContact"("tenantId");
CREATE INDEX "ChildGuardianContact_tenantId_contactType_idx" ON "ChildGuardianContact"("tenantId", "contactType");

ALTER TABLE "ChildGuardianContact" ADD CONSTRAINT "ChildGuardianContact_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChildGuardianContact" ADD CONSTRAINT "ChildGuardianContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
