-- Org-level access removal history for the admin People screen.
CREATE TABLE "OrgDeletedUser" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deletedByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "email" TEXT,
    "priorOrgRole" "OrgRole",
    "priorSiteCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgDeletedUser_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrgDeletedUser_orgId_deletedAt_idx" ON "OrgDeletedUser"("orgId", "deletedAt");
CREATE INDEX "OrgDeletedUser_userId_idx" ON "OrgDeletedUser"("userId");
CREATE INDEX "OrgDeletedUser_deletedByUserId_idx" ON "OrgDeletedUser"("deletedByUserId");

ALTER TABLE "OrgDeletedUser" ADD CONSTRAINT "OrgDeletedUser_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgDeletedUser" ADD CONSTRAINT "OrgDeletedUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgDeletedUser" ADD CONSTRAINT "OrgDeletedUser_deletedByUserId_fkey"
    FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
