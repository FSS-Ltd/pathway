ALTER TABLE "Session" ADD COLUMN "familyPublishedAt" TIMESTAMP(3);

CREATE INDEX "Session_tenantId_familyPublishedAt_startsAt_idx"
  ON "Session"("tenantId", "familyPublishedAt", "startsAt");
