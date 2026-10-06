CREATE TYPE "PaceInventoryOrderStatus" AS ENUM ('ORDERED', 'IN_TRANSIT', 'DELIVERED');
CREATE TYPE "PaceInventorySupplySource" AS ENUM ('CURRENT_STOCK', 'DELIVERED_ORDER');

CREATE TABLE "PaceInventoryOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "paceNumber" INTEGER NOT NULL,
    "status" "PaceInventoryOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inTransitAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaceInventoryOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaceInventoryOrder_paceNumber_check" CHECK ("paceNumber" BETWEEN 1001 AND 1144),
    CONSTRAINT "PaceInventoryOrder_status_times_check" CHECK (
      ("status" = 'ORDERED' AND "inTransitAt" IS NULL AND "deliveredAt" IS NULL)
      OR ("status" = 'IN_TRANSIT' AND "inTransitAt" IS NOT NULL AND "deliveredAt" IS NULL)
      OR ("status" = 'DELIVERED' AND "inTransitAt" IS NOT NULL AND "deliveredAt" IS NOT NULL)
    ),
    CONSTRAINT "PaceInventoryOrder_time_order_check" CHECK (
      ("inTransitAt" IS NULL OR "inTransitAt" >= "orderedAt")
      AND ("deliveredAt" IS NULL OR "deliveredAt" >= "inTransitAt")
    )
);

CREATE TABLE "PaceInventorySupply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "paceNumber" INTEGER NOT NULL,
    "source" "PaceInventorySupplySource" NOT NULL,
    "sourceOrderId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaceInventorySupply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PaceInventorySupply_paceNumber_check" CHECK ("paceNumber" BETWEEN 1001 AND 1144),
    CONSTRAINT "PaceInventorySupply_source_check" CHECK (
      ("source" = 'CURRENT_STOCK' AND "sourceOrderId" IS NULL)
      OR ("source" = 'DELIVERED_ORDER' AND "sourceOrderId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "PaceInventoryOrder_id_tenantId_key"
  ON "PaceInventoryOrder"("id", "tenantId");
CREATE UNIQUE INDEX "PaceInventoryOrder_id_tenantId_childId_subjectId_paceNumber_key"
  ON "PaceInventoryOrder"("id", "tenantId", "childId", "subjectId", "paceNumber");
CREATE INDEX "PaceInventoryOrder_tenantId_childId_subjectId_status_paceNu_idx"
  ON "PaceInventoryOrder"("tenantId", "childId", "subjectId", "status", "paceNumber");
CREATE INDEX "PaceInventoryOrder_tenantId_status_createdAt_idx"
  ON "PaceInventoryOrder"("tenantId", "status", "createdAt");
CREATE UNIQUE INDEX "PaceInventoryOrder_pending_number_key"
  ON "PaceInventoryOrder"("tenantId", "childId", "subjectId", "paceNumber")
  WHERE "status" IN ('ORDERED', 'IN_TRANSIT');

CREATE UNIQUE INDEX "PaceInventorySupply_tenantId_childId_subjectId_paceNumber_key"
  ON "PaceInventorySupply"("tenantId", "childId", "subjectId", "paceNumber");
CREATE UNIQUE INDEX "PaceInventorySupply_sourceOrderId_tenantId_childId_subjectI_key"
  ON "PaceInventorySupply"("sourceOrderId", "tenantId", "childId", "subjectId", "paceNumber");
CREATE INDEX "PaceInventorySupply_tenantId_childId_subjectId_idx"
  ON "PaceInventorySupply"("tenantId", "childId", "subjectId");

ALTER TABLE "PaceInventoryOrder"
  ADD CONSTRAINT "PaceInventoryOrder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventoryOrder_childId_tenantId_fkey"
  FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventoryOrder_subjectId_tenantId_fkey"
  FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventoryOrder_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaceInventorySupply"
  ADD CONSTRAINT "PaceInventorySupply_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventorySupply_childId_tenantId_fkey"
  FOREIGN KEY ("childId", "tenantId") REFERENCES "Child"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventorySupply_subjectId_tenantId_fkey"
  FOREIGN KEY ("subjectId", "tenantId") REFERENCES "Subject"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventorySupply_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaceInventorySupply_sourceOrderId_tenantId_childId_subject_fkey"
  FOREIGN KEY ("sourceOrderId", "tenantId", "childId", "subjectId", "paceNumber")
  REFERENCES "PaceInventoryOrder"("id", "tenantId", "childId", "subjectId", "paceNumber")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TRIGGER "PaceInventoryOrder_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "PaceInventoryOrder"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('createdByUserId');

CREATE TRIGGER "PaceInventorySupply_require_actor_membership"
BEFORE INSERT OR UPDATE OF "tenantId", "createdByUserId" ON "PaceInventorySupply"
FOR EACH ROW EXECUTE FUNCTION app.require_ace_record_actor_membership('createdByUserId');

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['PaceInventoryOrder', 'PaceInventorySupply']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I
         USING (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id())
         WITH CHECK (app.current_tenant_id() IS NOT NULL AND "tenantId" = app.current_tenant_id());',
      tbl || '_tenant_rls',
      tbl
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC;', tbl);
    IF to_regrole('anon') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon;', tbl);
    END IF;
    IF to_regrole('authenticated') IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated;', tbl);
    END IF;
  END LOOP;
END;
$$;
