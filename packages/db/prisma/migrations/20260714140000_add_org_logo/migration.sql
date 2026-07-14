-- Org-level white-label logo, stored in the public Supabase bucket.
ALTER TABLE "Org" ADD COLUMN "logoStorageKey" TEXT;
ALTER TABLE "Org" ADD COLUMN "logoContentType" TEXT;
