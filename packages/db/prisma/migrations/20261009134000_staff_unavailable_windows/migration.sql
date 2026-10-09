ALTER TABLE "StaffUnavailableDate"
  ADD COLUMN "startMinute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "endMinute" INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE "StaffUnavailableDate"
  ADD CONSTRAINT "StaffUnavailableDate_valid_window"
  CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440);

CREATE UNIQUE INDEX "StaffUnavailableDate_window_key"
  ON "StaffUnavailableDate"("userId", "tenantId", "date", "startMinute", "endMinute");
CREATE INDEX "StaffUnavailableDate_tenantId_date_idx"
  ON "StaffUnavailableDate"("tenantId", "date");

DROP INDEX "StaffUnavailableDate_userId_tenantId_date_key";
