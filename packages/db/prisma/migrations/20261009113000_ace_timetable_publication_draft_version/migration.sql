ALTER TABLE "AceStudentTimetablePublication"
  ADD COLUMN "draftVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "AceStudentTimetablePublication"
  ADD CONSTRAINT "AceStudentTimetablePublication_draft_version_check"
  CHECK ("draftVersion" > 0);
