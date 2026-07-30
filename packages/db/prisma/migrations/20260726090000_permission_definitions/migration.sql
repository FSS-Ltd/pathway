-- CreateEnum
CREATE TYPE "PermissionScope" AS ENUM (
  'organisation',
  'site',
  'relationship',
  'assignment'
);

-- CreateEnum
CREATE TYPE "PermissionSensitivity" AS ENUM (
  'standard',
  'sensitive',
  'protected'
);

-- CreateTable
CREATE TABLE "PermissionDefinition" (
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "scope" "PermissionScope" NOT NULL,
  "sensitivity" "PermissionSensitivity" NOT NULL,
  "delegable" BOOLEAN NOT NULL DEFAULT true,
  "requiredModule" "Module",
  "requiredVertical" "Vertical",
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "PermissionDefinition_isActive_idx"
  ON "PermissionDefinition"("isActive");

-- CreateIndex
CREATE INDEX "PermissionDefinition_scope_sensitivity_idx"
  ON "PermissionDefinition"("scope", "sensitivity");

-- This metadata is platform-global and readable under an explicit policy.
-- Writes are reserved for privileged operational synchronization.
ALTER TABLE "PermissionDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PermissionDefinition" FORCE ROW LEVEL SECURITY;

CREATE POLICY "PermissionDefinition_global_read"
  ON "PermissionDefinition"
  FOR SELECT
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE "PermissionDefinition" FROM PUBLIC;

DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "PermissionDefinition" FROM anon';
  END IF;

  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "PermissionDefinition" FROM authenticated';
  END IF;
END;
$$;
