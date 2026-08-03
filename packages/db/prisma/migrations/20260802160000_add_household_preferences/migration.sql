-- NexSteps Home household settings (Plan 08b): planning preferences and
-- notification preferences, both on Tenant (Tenant == household/site, per
-- the H1 one-Org-per-household decision). Small, fixed, household-singleton
-- shapes validated with Zod at the API boundary, not per-toggle columns.
-- No new RLS policy needed - "Tenant" already carries generic tenant-row
-- policies from 20251201173000_core_tenant_rls (select/update scoped to
-- app.current_tenant_id()), which cover these new columns automatically.
ALTER TABLE "Tenant" ADD COLUMN "planningPreferences" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Tenant" ADD COLUMN "notificationPreferences" JSONB NOT NULL DEFAULT '{}';
