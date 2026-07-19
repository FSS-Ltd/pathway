-- AlterTable
ALTER TABLE "PendingOrder" ADD COLUMN "selectedModules" "Module"[] NOT NULL DEFAULT ARRAY[]::"Module"[];
