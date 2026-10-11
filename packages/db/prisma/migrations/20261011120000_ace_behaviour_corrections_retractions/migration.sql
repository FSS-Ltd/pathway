ALTER TYPE "AccessTagKey" ADD VALUE 'behaviour-corrector';

ALTER TABLE "BehaviourEntry"
  ADD COLUMN "correctionReason" TEXT;

ALTER TABLE "BehaviourEntry"
  ADD CONSTRAINT "BehaviourEntry_correction_reason_check"
  CHECK ("correctionReason" IS NULL OR length(btrim("correctionReason")) BETWEEN 1 AND 1000);

CREATE TABLE "BehaviourEntryRetraction" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "retractedByUserId" TEXT NOT NULL,
  "clientCommandKeyHash" TEXT NOT NULL,
  "commandFingerprint" TEXT NOT NULL,
  "retractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BehaviourEntryRetraction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BehaviourEntryRetraction_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 1000),
  CONSTRAINT "BehaviourEntryRetraction_command_metadata_check" CHECK (
    "clientCommandKeyHash" ~ '^[a-f0-9]{64}$'
    AND "commandFingerprint" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "BehaviourEntryRetraction_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BehaviourEntryRetraction_entryId_tenantId_childId_fkey"
    FOREIGN KEY ("entryId", "tenantId", "childId")
    REFERENCES "BehaviourEntry"("id", "tenantId", "childId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "BehaviourEntryRetraction_retractedByUserId_fkey" FOREIGN KEY ("retractedByUserId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "BehaviourEntryRetraction_id_tenantId_key"
  ON "BehaviourEntryRetraction"("id", "tenantId");
CREATE UNIQUE INDEX "BehaviourEntryRetraction_entryId_tenantId_childId_key"
  ON "BehaviourEntryRetraction"("entryId", "tenantId", "childId");
CREATE UNIQUE INDEX "BehaviourEntryRetraction_tenantId_clientCommandKeyHash_key"
  ON "BehaviourEntryRetraction"("tenantId", "clientCommandKeyHash");
CREATE INDEX "BehaviourEntryRetraction_tenantId_retractedAt_id_idx"
  ON "BehaviourEntryRetraction"("tenantId", "retractedAt", "id");

CREATE FUNCTION app.set_behaviour_retraction_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW."retractedAt" := pg_catalog.statement_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.set_behaviour_retraction_time() FROM PUBLIC;

CREATE TRIGGER "BehaviourEntryRetraction_set_time"
BEFORE INSERT ON "BehaviourEntryRetraction"
FOR EACH ROW EXECUTE FUNCTION app.set_behaviour_retraction_time();

CREATE TRIGGER "BehaviourEntryRetraction_require_actor_membership"
BEFORE INSERT ON "BehaviourEntryRetraction"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('retractedByUserId');

CREATE TRIGGER "BehaviourEntryRetraction_immutable"
BEFORE UPDATE OR DELETE ON "BehaviourEntryRetraction"
FOR EACH ROW EXECUTE FUNCTION app.reject_ace_record_mutation();

ALTER TABLE "BehaviourEntryRetraction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BehaviourEntryRetraction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "BehaviourEntryRetraction_tenant_rls" ON "BehaviourEntryRetraction"
  USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
  WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());
REVOKE ALL PRIVILEGES ON TABLE "BehaviourEntryRetraction" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "BehaviourEntryRetraction" FROM anon;
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE "BehaviourEntryRetraction" FROM authenticated;
  END IF;
END;
$$;
