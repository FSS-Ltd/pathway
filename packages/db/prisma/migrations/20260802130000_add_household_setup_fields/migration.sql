-- NexSteps Home setup flow (H2/Plan 05): store the household's chosen
-- learning-days preference and when guided setup finished, both on Tenant
-- (Tenant == household/site, per the H1 one-Org-per-household decision).
-- No new RLS policy needed - "Tenant" already carries generic tenant-row
-- policies from 20251201173000_core_tenant_rls (select/update scoped to
-- app.current_tenant_id()), which cover these new columns automatically.
ALTER TABLE "Tenant" ADD COLUMN "learningDays" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Tenant" ADD COLUMN "setupCompletedAt" TIMESTAMP(3);
