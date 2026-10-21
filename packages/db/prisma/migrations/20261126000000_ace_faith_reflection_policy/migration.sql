-- Keep existing published reflections readable while making their audience and
-- moderation decisions explicit. New submissions start private and pending.
BEGIN;
CREATE TYPE "FaithReflectionVisibility" AS ENUM (
  'AUTHOR_AND_STAFF', 'RELEASED_GUARDIANS'
);
CREATE TYPE "FaithReflectionModerationStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED'
);

ALTER TABLE "FaithSiteSettings"
  ADD COLUMN "reflectionsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "FaithReflection"
  ADD COLUMN "childId" TEXT,
  ADD COLUMN "visibility" "FaithReflectionVisibility" NOT NULL DEFAULT 'AUTHOR_AND_STAFF',
  ADD COLUMN "moderationStatus" "FaithReflectionModerationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "moderatedAt" TIMESTAMP(3),
  ADD COLUMN "moderatedByUserId" TEXT;

DROP TRIGGER "FaithReflection_guard_mutation" ON "FaithReflection";

-- The migration owner can backfill every tenant while this transaction holds
-- the table change lock. FORCE is restored before commit; app roles remain RLS-bound.
ALTER TABLE "FaithReflection" NO FORCE ROW LEVEL SECURITY;

UPDATE "FaithReflection"
SET "visibility" = 'RELEASED_GUARDIANS',
    "moderationStatus" = 'APPROVED',
    "moderatedAt" = "guardianReleasedAt",
    "moderatedByUserId" = "releasedByUserId"
WHERE "guardianReleasedAt" IS NOT NULL;

ALTER TABLE "FaithReflection" FORCE ROW LEVEL SECURITY;

ALTER TABLE "FaithReflection"
  ADD CONSTRAINT "FaithReflection_child_tenant_fk"
    FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FaithReflection_moderator_fk"
    FOREIGN KEY ("moderatedByUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "FaithReflection_moderation_metadata_check" CHECK (
    ("moderationStatus" = 'PENDING' AND "moderatedAt" IS NULL AND "moderatedByUserId" IS NULL)
    OR ("moderationStatus" <> 'PENDING' AND "moderatedAt" IS NOT NULL AND "moderatedByUserId" IS NOT NULL)
  ),
  ADD CONSTRAINT "FaithReflection_visibility_release_check" CHECK (
    ("visibility" = 'AUTHOR_AND_STAFF' AND "guardianReleasedAt" IS NULL)
    OR (
      "visibility" = 'RELEASED_GUARDIANS'
      AND "guardianReleasedAt" IS NOT NULL
      AND "moderationStatus" = 'APPROVED'
    )
  );

CREATE INDEX "FaithReflection_tenant_child_idx"
  ON "FaithReflection"("tenantId", "childId");

CREATE TRIGGER "FaithReflection_require_moderator_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "moderatedByUserId"
ON "FaithReflection"
FOR EACH ROW EXECUTE FUNCTION app.require_faith_actor_membership('moderatedByUserId');

CREATE OR REPLACE FUNCTION app.guard_faith_reflection_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."guardianReleasedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Released Faith reflections are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW."tenantId" IS DISTINCT FROM OLD."tenantId"
    OR NEW."faithContentVersionId" IS DISTINCT FROM OLD."faithContentVersionId"
    OR NEW."studentIdentityId" IS DISTINCT FROM OLD."studentIdentityId"
    OR NEW."childId" IS DISTINCT FROM OLD."childId"
    OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN
    RAISE EXCEPTION 'Faith reflection identity target is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."guardianReleasedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'Released Faith reflections are immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF OLD."moderationStatus" <> 'PENDING'
    AND (NEW."moderationStatus" IS DISTINCT FROM OLD."moderationStatus"
      OR NEW."moderatedAt" IS DISTINCT FROM OLD."moderatedAt"
      OR NEW."moderatedByUserId" IS DISTINCT FROM OLD."moderatedByUserId")
  THEN
    RAISE EXCEPTION 'Faith reflection moderation decision is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF NEW."guardianReleasedAt" IS NOT NULL
    AND NEW."reflectionEncrypted" IS DISTINCT FROM OLD."reflectionEncrypted"
  THEN
    RAISE EXCEPTION 'Faith reflection content and release must change separately'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "FaithReflection_guard_mutation"
BEFORE UPDATE OR DELETE ON "FaithReflection"
FOR EACH ROW EXECUTE FUNCTION app.guard_faith_reflection_mutation();

COMMIT;
