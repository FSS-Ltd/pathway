CREATE TABLE "AccessTagExclusion" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "tenantId" TEXT,
  "userId" TEXT NOT NULL,
  "tagKey" "AccessTagKey" NOT NULL,
  "excludedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessTagExclusion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessTagExclusion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagExclusion_tenantId_orgId_fkey" FOREIGN KEY ("tenantId", "orgId") REFERENCES "Tenant"("id", "orgId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagExclusion_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagExclusion_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessTagExclusion_revocation_actor_check" CHECK (("revokedAt" IS NULL) = ("revokedById" IS NULL))
);

CREATE INDEX "AccessTagExclusion_orgId_userId_revokedAt_idx"
  ON "AccessTagExclusion"("orgId", "userId", "revokedAt");
CREATE INDEX "AccessTagExclusion_tenantId_userId_revokedAt_idx"
  ON "AccessTagExclusion"("tenantId", "userId", "revokedAt");
CREATE UNIQUE INDEX "AccessTagExclusion_org_active_unique"
  ON "AccessTagExclusion"("orgId", "userId", "tagKey")
  WHERE "tenantId" IS NULL AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "AccessTagExclusion_site_active_unique"
  ON "AccessTagExclusion"("orgId", "tenantId", "userId", "tagKey")
  WHERE "tenantId" IS NOT NULL AND "revokedAt" IS NULL;

CREATE FUNCTION app.enforce_access_tag_exclusion_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF ROW(OLD."id", OLD."orgId", OLD."tenantId", OLD."userId", OLD."tagKey", OLD."excludedById", OLD."createdAt")
    IS DISTINCT FROM
     ROW(NEW."id", NEW."orgId", NEW."tenantId", NEW."userId", NEW."tagKey", NEW."excludedById", NEW."createdAt")
  THEN
    RAISE EXCEPTION 'Access-tag exclusion facts cannot be changed' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."revokedAt" IS DISTINCT FROM NEW."revokedAt" OR OLD."revokedById" IS DISTINCT FROM NEW."revokedById" THEN
    IF OLD."revokedAt" IS NOT NULL OR OLD."revokedById" IS NOT NULL OR NEW."revokedAt" IS NULL OR NEW."revokedById" IS NULL THEN
      RAISE EXCEPTION 'Access-tag exclusion revocation is immutable once recorded' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.enforce_access_tag_exclusion_update() FROM PUBLIC;
CREATE TRIGGER "AccessTagExclusion_preserve_facts"
BEFORE UPDATE ON "AccessTagExclusion"
FOR EACH ROW EXECUTE FUNCTION app.enforce_access_tag_exclusion_update();

ALTER TABLE "AccessTagExclusion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccessTagExclusion" FORCE ROW LEVEL SECURITY;

CREATE POLICY "AccessTagExclusion_rls_select" ON "AccessTagExclusion" FOR SELECT
  USING (app.current_org_id() IS NOT NULL AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id()));
CREATE POLICY "AccessTagExclusion_rls_insert" ON "AccessTagExclusion" FOR INSERT
  WITH CHECK (app.current_org_id() IS NOT NULL AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id()));
CREATE POLICY "AccessTagExclusion_rls_update" ON "AccessTagExclusion" FOR UPDATE
  USING (app.current_org_id() IS NOT NULL AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id()))
  WITH CHECK (app.current_org_id() IS NOT NULL AND "orgId" = app.current_org_id()
    AND ("tenantId" IS NULL OR "tenantId" = app.current_tenant_id()));

REVOKE ALL PRIVILEGES ON TABLE "AccessTagExclusion" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AccessTagExclusion" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "AccessTagExclusion" FROM authenticated';
  END IF;
END;
$$;
