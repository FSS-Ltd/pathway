ALTER TYPE "BlogAssetStorage" ADD VALUE IF NOT EXISTS 'SUPABASE';

ALTER TABLE "BlogAsset"
  ADD COLUMN "storageBucket" TEXT,
  ADD COLUMN "storageKey" TEXT,
  ALTER COLUMN "bytes" DROP NOT NULL;

CREATE INDEX "BlogAsset_storageBucket_storageKey_idx" ON "BlogAsset"("storageBucket", "storageKey");

ALTER TABLE "User"
  ADD COLUMN "avatarKey" TEXT;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $storage$
      INSERT INTO storage.buckets (id, name, public)
      VALUES
        ('pathway-private', 'pathway-private', false),
        ('pathway-public', 'pathway-public', true)
      ON CONFLICT (id) DO UPDATE
      SET
        name = EXCLUDED.name,
        public = EXCLUDED.public,
        updated_at = now()
    $storage$;
  END IF;
END $$;
