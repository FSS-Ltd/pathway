-- Nullable fields preserve unknown information for all existing child records.
-- Medical content is encrypted by the existing Child PII extension on write.
ALTER TABLE "Child"
  ADD COLUMN "allergiesConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "medicalConditions" TEXT,
  ADD COLUMN "medicationAtSite" TEXT;
